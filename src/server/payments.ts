import crypto from 'crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  carts,
  cartItems,
  cashlessTransactions,
  events,
  financialLedger,
  orderItems,
  orders,
  payments,
  paymentWebhooks,
  promoCodes,
  tickets,
  ticketTypes,
  venues,
} from '../db/schema.ts';
import { calculateFinancialBreakdown, resolveCommissionRule } from './commissions.ts';
import { createNotification } from './notifications.ts';

export type GatewayProvider = 'paystack' | 'peach' | 'payfast' | 'sandbox';

export interface GatewayInitResult {
  provider: GatewayProvider;
  reference: string;
  authorizationUrl: string;
  isTestMode: boolean;
  raw: Record<string, any>;
}

const getSandboxWebhookSecret = (): string => {
  return process.env.SANDBOX_WEBHOOK_SECRET || crypto.createHash('sha256').update(`${process.env.SQL_DB_NAME || 'ticketing'}:sandbox-webhook`).digest('hex');
};

export function signSandboxWebhook(payloadString: string): string {
  return crypto.createHmac('sha512', getSandboxWebhookSecret()).update(payloadString).digest('hex');
}

export function verifyWebhookSignature(provider: string, payloadString: string, signature: string | undefined): boolean {
  if (!signature) return false;
  if (provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(payloadString).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (provider === 'sandbox') {
    const expected = signSandboxWebhook(payloadString);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}

export function getAvailableGateways() {
  const paystackConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const peachConfigured = Boolean(process.env.PEACH_ENTITY_ID && process.env.PEACH_ACCESS_TOKEN);
  const payfastConfigured = Boolean(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY);

  return [
    {
      id: 'paystack' as GatewayProvider,
      name: 'Paystack (South Africa ZAR)',
      configured: paystackConfigured,
      mode: paystackConfigured ? 'live' : 'unconfigured',
    },
    {
      id: 'peach' as GatewayProvider,
      name: 'Peach Payments',
      configured: peachConfigured,
      mode: peachConfigured ? 'live' : 'unconfigured',
    },
    {
      id: 'payfast' as GatewayProvider,
      name: 'PayFast',
      configured: payfastConfigured,
      mode: payfastConfigured ? 'live' : 'unconfigured',
    },
    {
      id: 'sandbox' as GatewayProvider,
      name: 'Verified Test Gateway (Sandbox)',
      configured: true,
      mode: 'test',
    },
  ];
}

export async function initializeGatewayPayment(params: {
  provider: GatewayProvider;
  reference: string;
  email: string;
  amountCents: number;
  currency: string;
  callbackUrl: string;
  metadata?: Record<string, any>;
}): Promise<GatewayInitResult> {
  if (params.provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      throw new Error('Paystack is not configured (missing PAYSTACK_SECRET_KEY). Choose the Test Gateway or configure Paystack credentials.');
    }
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: params.amountCents, // ZAR kobo/cents
        currency: params.currency || 'ZAR',
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata || {},
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.status) {
      throw new Error(data.message || 'Paystack payment initialization failed.');
    }
    return {
      provider: 'paystack',
      reference: params.reference,
      authorizationUrl: data.data.authorization_url,
      isTestMode: secret.startsWith('sk_test_'),
      raw: data,
    };
  }

  if (params.provider === 'peach' || params.provider === 'payfast') {
    throw new Error(`${params.provider.toUpperCase()} merchant credentials are not configured in environment variables.`);
  }

  return {
    provider: 'sandbox',
    reference: params.reference,
    authorizationUrl: `/checkout?verifyRef=${encodeURIComponent(params.reference)}&mode=sandbox`,
    isTestMode: true,
    raw: { status: 'initialized', mode: 'sandbox', reference: params.reference, amountCents: params.amountCents },
  };
}

export async function verifyGatewayWithProvider(provider: string, reference: string) {
  if (provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return { verified: false, error: 'Missing PAYSTACK_SECRET_KEY' };
    }
    const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await resp.json();
    if (!resp.ok || !data.status || data.data?.status !== 'success') {
      return { verified: false, error: data.message || 'Payment not confirmed on Paystack', raw: data };
    }
    return {
      verified: true,
      amountCents: Number(data.data.amount),
      gatewayFeeCents: Number(data.data.fees || 0),
      paymentMethod: data.data.channel || 'card',
      raw: data,
    };
  }

  if (provider === 'sandbox') {
    const [payment] = await db.select().from(payments).where(eq(payments.reference, reference));
    if (!payment) return { verified: false, error: 'Payment reference not found' };
    return {
      verified: payment.status === 'SUCCESSFUL',
      amountCents: payment.amountCents,
      gatewayFeeCents: payment.gatewayFeeCents,
      paymentMethod: payment.paymentMethod || 'card_test',
      raw: payment.rawResponse ? JSON.parse(payment.rawResponse) : null,
    };
  }

  return { verified: false, error: `Unsupported provider ${provider}` };
}

export async function expireStaleReservations() {
  const now = new Date();
  await db.transaction(async (tx) => {
    const expiredOrders = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.status, 'PENDING'), lt(orders.reservationExpiresAt, now)));

    for (const ord of expiredOrders) {
      const [flipped] = await tx
        .update(orders)
        .set({ status: 'EXPIRED', paymentStatus: 'EXPIRED', updatedAt: new Date() })
        .where(and(eq(orders.id, ord.id), eq(orders.status, 'PENDING')))
        .returning();

      if (!flipped) continue;

      await tx
        .update(payments)
        .set({ status: 'EXPIRED', updatedAt: new Date() })
        .where(and(eq(payments.orderId, ord.id), eq(payments.status, 'PENDING')));

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
      for (const item of items) {
        await tx
          .update(ticketTypes)
          .set({
            remaining: sql`${ticketTypes.remaining} + ${item.quantity}`,
            reserved: sql`GREATEST(0, ${ticketTypes.reserved} - ${item.quantity})`,
          })
          .where(eq(ticketTypes.id, item.ticketTypeId));
      }
    }
  });
}

export async function completeOrderPayment(params: {
  reference: string;
  provider: string;
  amountCents: number;
  gatewayFeeCents?: number;
  paymentMethod?: string;
  rawResponse?: Record<string, any>;
  assignments?: Record<string, { name?: string; email?: string }>;
  cartSessionId?: string;
}) {
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.reference, params.reference));
    if (!payment) {
      return { ok: false as const, statusCode: 404, error: 'Payment record not found.' };
    }

    if (params.amountCents !== payment.amountCents) {
      await tx
        .update(payments)
        .set({
          status: 'FAILED',
          rawResponse: JSON.stringify({ error: 'Amount mismatch', expected: payment.amountCents, received: params.amountCents }),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      return {
        ok: false as const,
        statusCode: 400,
        error: `Payment amount mismatch (expected ${payment.amountCents}, received ${params.amountCents}).`,
      };
    }

    // Idempotent atomic flip on orders from PENDING -> PAID
    const [paidOrder] = await tx
      .update(orders)
      .set({
        status: 'PAID',
        paymentStatus: 'SUCCESSFUL',
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, payment.orderId), eq(orders.status, 'PENDING')))
      .returning();

    if (!paidOrder) {
      // Check if already PAID (idempotent duplicate webhook/verify)
      const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, payment.orderId));
      if (existingOrder && existingOrder.status === 'PAID') {
        const existingTickets = await tx.select().from(tickets).where(eq(tickets.orderId, existingOrder.id));
        return {
          ok: true as const,
          alreadyProcessed: true,
          order: existingOrder,
          payment,
          tickets: existingTickets,
        };
      }
      return {
        ok: false as const,
        statusCode: 409,
        error: `Order is in state '${existingOrder?.status || 'UNKNOWN'}' and cannot be paid.`,
      };
    }

    const actualGatewayFee = params.gatewayFeeCents ?? (paidOrder.gatewayFeeCents || 0);

    const [updatedPayment] = await tx
      .update(payments)
      .set({
        status: 'SUCCESSFUL',
        gatewayFeeCents: actualGatewayFee,
        paymentMethod: params.paymentMethod || payment.paymentMethod || 'card',
        rawResponse: params.rawResponse ? JSON.stringify(params.rawResponse) : payment.rawResponse,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    const [evt] = await tx.select().from(events).where(eq(events.id, paidOrder.eventId));
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, paidOrder.id));

    const issuedTickets = [];
    let flatIdx = 0;
    for (const oItem of items) {
      // Clear reserved counter now that stock is sold
      await tx
        .update(ticketTypes)
        .set({
          reserved: sql`GREATEST(0, ${ticketTypes.reserved} - ${oItem.quantity})`,
        })
        .where(eq(ticketTypes.id, oItem.ticketTypeId));

      for (let i = 0; i < oItem.quantity; i++) {
        const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const ticketNumber = `TKT-${paidOrder.id}-${suffix}`;
        const secureToken = crypto.randomBytes(24).toString('hex');
        const cashlessNumber = `RFID-${paidOrder.id}-${suffix}`;
        const assignKey = `${oItem.ticketTypeId}-${i}`;
        const assignmentObj = Array.isArray(params.assignments)
          ? params.assignments[flatIdx]
          : params.assignments?.[assignKey];
        flatIdx++;
        const assignedName = assignmentObj?.name?.trim() || paidOrder.buyerName;
        const assignedEmail = assignmentObj?.email?.trim().toLowerCase() || paidOrder.buyerEmail;
        const qrCodeUrl = `/ticket/verify/${encodeURIComponent(secureToken)}`;

        const [insertedTicket] = await tx
          .insert(tickets)
          .values({
            token: secureToken,
            ticketNumber,
            buyerName: paidOrder.buyerName,
            buyerEmail: paidOrder.buyerEmail,
            attendeeName: assignedName,
            attendeeEmail: assignedEmail,
            type: oItem.ticketTypeName || 'General Admission',
            eventName: evt?.name || 'Live Event',
            status: 'VALID',
            userId: paidOrder.userId,
            eventId: paidOrder.eventId,
            ticketTypeId: oItem.ticketTypeId,
            orderId: paidOrder.id,
            orderItemId: oItem.id,
            qrCodeUrl,
            cashlessNumber,
            cashlessBalance: 0,
            purchasedAt: new Date(),
          })
          .returning();

        issuedTickets.push(insertedTicket);
      }
    }

    // Write immutable ledger entries in cents
    const netSalesCents = Math.max(0, (paidOrder.subtotalCents || 0) - (paidOrder.discountCents || 0));
    const commissionCents = paidOrder.platformFeeCutCents || 0;
    const earningsCents = paidOrder.businessEarningsCents || Math.max(0, netSalesCents - commissionCents);

    await tx.insert(financialLedger).values([
      {
        businessId: paidOrder.businessId,
        orderId: paidOrder.id,
        paymentId: updatedPayment.id,
        entryType: 'GROSS_SALE',
        amountCents: netSalesCents,
        currency: paidOrder.currency,
        description: `Ticket sale for order ${paidOrder.orderNumber}`,
      },
      {
        businessId: paidOrder.businessId,
        orderId: paidOrder.id,
        paymentId: updatedPayment.id,
        entryType: 'PLATFORM_COMMISSION',
        amountCents: -commissionCents,
        currency: paidOrder.currency,
        description: `Platform commission (${((paidOrder.commissionBpsSnapshot || 500) / 100).toFixed(2)}%) on ${paidOrder.orderNumber}`,
      },
      {
        businessId: paidOrder.businessId,
        orderId: paidOrder.id,
        paymentId: updatedPayment.id,
        entryType: 'GATEWAY_FEE',
        amountCents: -actualGatewayFee,
        currency: paidOrder.currency,
        description: `Payment gateway processing fee (${params.provider})`,
      },
      {
        businessId: paidOrder.businessId,
        orderId: paidOrder.id,
        paymentId: updatedPayment.id,
        entryType: 'BUSINESS_EARNING',
        amountCents: earningsCents,
        currency: paidOrder.currency,
        description: `Net business earnings credited for ${paidOrder.orderNumber}`,
      },
    ]);

    // Update business balances atomically (both cents & legacy integer units)
    const addedSalesUnits = Math.round(netSalesCents / 100);
    const addedFeeUnits = Math.round(commissionCents / 100);
    const addedEarningUnits = Math.round(earningsCents / 100);

    await tx
      .update(businesses)
      .set({
        grossSalesCents: sql`${businesses.grossSalesCents} + ${netSalesCents}`,
        platformFeesCents: sql`${businesses.platformFeesCents} + ${commissionCents}`,
        pendingPayoutCents: sql`${businesses.pendingPayoutCents} + ${earningsCents}`,
        grossSales: sql`${businesses.grossSales} + ${addedSalesUnits}`,
        platformFees: sql`${businesses.platformFees} + ${addedFeeUnits}`,
        pendingPayout: sql`${businesses.pendingPayout} + ${addedEarningUnits}`,
      })
      .where(eq(businesses.id, paidOrder.businessId));

    // Clear cart if linked
    if (params.cartSessionId) {
      const [cart] = await tx.select().from(carts).where(eq(carts.sessionId, params.cartSessionId));
      if (cart) {
        await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
        await tx.update(carts).set({ promoCode: null, updatedAt: new Date() }).where(eq(carts.id, cart.id));
      }
    }

    await tx.insert(auditLogs).values({
      userId: paidOrder.userId,
      businessId: paidOrder.businessId,
      action: 'Payment Confirmed & Tickets Issued',
      resourceType: 'order',
      resourceId: paidOrder.id,
      newValue: JSON.stringify({ orderNumber: paidOrder.orderNumber, totalCents: paidOrder.totalCents, ticketsCount: issuedTickets.length }),
      metadata: JSON.stringify({ provider: params.provider, reference: params.reference }),
    });

    const [biz] = await tx.select().from(businesses).where(eq(businesses.id, paidOrder.businessId));
    const [venue] = evt?.venueId ? await tx.select().from(venues).where(eq(venues.id, evt.venueId)) : [null];

    return {
      ok: true as const,
      alreadyProcessed: false,
      order: paidOrder,
      payment: updatedPayment,
      tickets: issuedTickets,
      event: evt,
      business: biz,
      venue,
    };
  });

  if (result.ok && !result.alreadyProcessed) {
    // Send customer confirmation & business notification outside transaction
    await createNotification({
      userId: result.order.userId,
      email: result.order.buyerEmail,
      type: 'ORDER_CONFIRMED',
      title: `Tickets Confirmed: ${result.event?.name || 'Your Event'} (${result.order.orderNumber})`,
      message: `Hi ${result.order.buyerName}, your order ${result.order.orderNumber} is confirmed with ${result.tickets.length} ticket(s). Present your QR pass at the entrance.`,
      channel: 'EMAIL',
      sendEmailToo: true,
      metadata: { orderId: result.order.id, orderNumber: result.order.orderNumber },
    });

    if (result.business?.email) {
      await createNotification({
        email: result.business.email,
        type: 'NEW_TICKET_SALE',
        title: `New Sale: ${result.order.orderNumber} (${result.tickets.length} tickets)`,
        message: `${result.order.buyerName} purchased ${result.tickets.length} ticket(s) for ${result.event?.name || 'Event'}. Net earnings: R${((result.order.businessEarningsCents || 0) / 100).toFixed(2)}.`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { businessId: result.business.id, orderId: result.order.id },
      });
    }
  }

  return result;
}

export async function cancelPendingOrder(reference: string) {
  return await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.reference, reference));
    if (!payment) return { ok: false, error: 'Payment not found' };

    const [cancelled] = await tx
      .update(orders)
      .set({ status: 'CANCELLED', paymentStatus: 'CANCELLED', updatedAt: new Date() })
      .where(and(eq(orders.id, payment.orderId), eq(orders.status, 'PENDING')))
      .returning();

    if (!cancelled) {
      return { ok: false, error: 'Only pending orders can be cancelled.' };
    }

    await tx
      .update(payments)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, cancelled.id));
    for (const item of items) {
      await tx
        .update(ticketTypes)
        .set({
          remaining: sql`${ticketTypes.remaining} + ${item.quantity}`,
          reserved: sql`GREATEST(0, ${ticketTypes.reserved} - ${item.quantity})`,
        })
        .where(eq(ticketTypes.id, item.ticketTypeId));
    }

    return { ok: true, order: cancelled };
  });
}

export async function initiateCheckoutOrder(params: {
  userId: number | null;
  eventId: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  items: Array<{ ticketTypeId?: number | string; tierId?: number | string; quantity: number }>;
  assignments?: any;
  promoCode?: string | null;
  provider: GatewayProvider;
  idempotencyKey?: string;
  callbackOrigin: string;
  cartSessionId?: string;
}) {
  // Clean up any expired reservations first so stock is accurate
  await expireStaleReservations();

  // Check idempotency key if supplied
  if (params.idempotencyKey) {
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, params.idempotencyKey));
    if (existingPayment) {
      const [existingOrder] = await db.select().from(orders).where(eq(orders.id, existingPayment.orderId));
      const existingTickets = existingOrder?.status === 'PAID'
        ? await db.select().from(tickets).where(eq(tickets.orderId, existingOrder.id))
        : [];
      return {
        order: existingOrder,
        payment: existingPayment,
        authorizationUrl: existingPayment.authorizationUrl,
        isTestMode: existingPayment.provider === 'sandbox',
        tickets: existingTickets,
        reused: true,
      };
    }
  }

  const txResult = await db.transaction(async (tx) => {
    const [evt] = await tx.select().from(events).where(eq(events.id, params.eventId));
    if (!evt) {
      throw Object.assign(new Error('Selected event was not found.'), { statusCode: 404 });
    }
    if (!['PUBLISHED', 'ON_SALE'].includes(evt.status)) {
      throw Object.assign(new Error(`Tickets are currently unavailable for this event (status: ${evt.status}).`), { statusCode: 400 });
    }

    const [biz] = await tx.select().from(businesses).where(eq(businesses.id, evt.businessId));
    if (!biz || biz.status !== 'ACTIVE') {
      throw Object.assign(new Error('This organiser is currently not active or suspended from selling tickets.'), { statusCode: 403 });
    }

    if (!params.items || params.items.length === 0) {
      throw Object.assign(new Error('Your cart is empty. Please select at least one ticket.'), { statusCode: 400 });
    }

    const now = new Date();
    let subtotalCents = 0;
    const preparedItems: Array<{
      ticketTypeId: number;
      name: string;
      quantity: number;
      unitPriceCents: number;
    }> = [];

    for (const rawItem of params.items) {
      const qty = Number(rawItem.quantity);
      if (!Number.isInteger(qty) || qty <= 0) continue;

      const rawId = rawItem.ticketTypeId ?? rawItem.tierId;
      const tierIdNum = Number(rawId);
      if (!Number.isInteger(tierIdNum) || tierIdNum <= 0) {
        throw Object.assign(new Error(`Invalid ticket type ID '${rawId}'.`), { statusCode: 400 });
      }

      const [tType] = await tx
        .select()
        .from(ticketTypes)
        .where(and(eq(ticketTypes.id, tierIdNum), eq(ticketTypes.eventId, evt.id)));

      if (!tType) {
        throw Object.assign(new Error(`Ticket tier #${tierIdNum} does not belong to this event.`), { statusCode: 400 });
      }
      if (tType.status !== 'ACTIVE') {
        throw Object.assign(new Error(`${tType.name} is not currently on sale.`), { statusCode: 400 });
      }
      if (tType.saleStart && new Date(tType.saleStart) > now) {
        throw Object.assign(new Error(`Sales for ${tType.name} have not started yet.`), { statusCode: 400 });
      }
      if (tType.saleEnd && new Date(tType.saleEnd) < now) {
        throw Object.assign(new Error(`Sales for ${tType.name} have ended.`), { statusCode: 400 });
      }
      const minP = tType.minPurchase ?? 1;
      const maxP = tType.maxPurchase ?? 20;
      if (qty < minP || qty > maxP) {
        throw Object.assign(new Error(`${tType.name} allows between ${minP} and ${maxP} tickets per order.`), { statusCode: 400 });
      }

      // ATOMIC INVENTORY LOCK: prevents concurrent overselling!
      const [decremented] = await tx
        .update(ticketTypes)
        .set({
          remaining: sql`${ticketTypes.remaining} - ${qty}`,
          reserved: sql`${ticketTypes.reserved} + ${qty}`,
        })
        .where(and(eq(ticketTypes.id, tType.id), sql`${ticketTypes.remaining} >= ${qty}`))
        .returning();

      if (!decremented) {
        throw Object.assign(new Error(`Not enough tickets remaining for ${tType.name}.`), { statusCode: 409 });
      }

      const unitPriceCents = tType.isFree ? 0 : (tType.priceCents ?? tType.price * 100);
      subtotalCents += unitPriceCents * qty;
      preparedItems.push({
        ticketTypeId: tType.id,
        name: tType.name,
        quantity: qty,
        unitPriceCents,
      });
    }

    if (preparedItems.length === 0) {
      throw Object.assign(new Error('Select at least 1 valid ticket to proceed.'), { statusCode: 400 });
    }

    // Promo validation inside transaction with atomic usage increment
    let discountCents = 0;
    let appliedPromo: string | null = null;
    if (params.promoCode && params.promoCode.trim()) {
      const code = params.promoCode.trim().toUpperCase();
      const [promo] = await tx
        .select()
        .from(promoCodes)
        .where(and(eq(promoCodes.code, code), eq(promoCodes.active, 1)));

      if (!promo) {
        throw Object.assign(new Error(`Promo code '${code}' is invalid or inactive.`), { statusCode: 400 });
      }
      if (promo.expiresAt && new Date(promo.expiresAt) < now) {
        throw Object.assign(new Error(`Promo code '${code}' has expired.`), { statusCode: 400 });
      }
      if (promo.businessId && promo.businessId !== biz.id) {
        throw Object.assign(new Error(`Promo code '${code}' is not valid for this organiser.`), { statusCode: 400 });
      }
      if (promo.eventId && promo.eventId !== evt.id) {
        throw Object.assign(new Error(`Promo code '${code}' is not valid for this event.`), { statusCode: 400 });
      }
      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        throw Object.assign(new Error(`Promo code '${code}' has reached its maximum usage limit.`), { statusCode: 400 });
      }

      await tx
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(eq(promoCodes.id, promo.id));

      if (promo.discountPercent > 0) {
        discountCents = Math.round((subtotalCents * promo.discountPercent) / 100);
      } else if (promo.discountCents > 0) {
        discountCents = Math.min(subtotalCents, promo.discountCents);
      }
      appliedPromo = code;
    }

    const commissionRule = await resolveCommissionRule(biz.id, evt.id);
    const breakdown = calculateFinancialBreakdown(subtotalCents, discountCents, commissionRule);

    const orderNumber = `ORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const paymentRef = `PAY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: params.userId,
        businessId: biz.id,
        eventId: evt.id,
        buyerName: params.buyerName.trim(),
        buyerEmail: params.buyerEmail.trim().toLowerCase(),
        buyerPhone: params.buyerPhone?.trim() || null,
        currency: 'ZAR',
        subtotal: Math.round(breakdown.subtotalCents / 100),
        discount: Math.round(breakdown.discountCents / 100),
        serviceFee: Math.round(breakdown.serviceFeeCents / 100),
        total: Math.round(breakdown.totalCents / 100),
        platformFeeCut: Math.round(breakdown.platformFeeCutCents / 100),
        subtotalCents: breakdown.subtotalCents,
        discountCents: breakdown.discountCents,
        serviceFeeCents: breakdown.serviceFeeCents,
        totalCents: breakdown.totalCents,
        platformFeeCutCents: breakdown.platformFeeCutCents,
        gatewayFeeCents: breakdown.gatewayFeeCents,
        businessEarningsCents: breakdown.businessEarningsCents,
        commissionBpsSnapshot: commissionRule.commissionBps,
        commissionFixedCentsSnapshot: commissionRule.fixedFeeCents,
        paymentProvider: params.provider,
        paymentReference: paymentRef,
        paymentStatus: 'PENDING',
        reservationExpiresAt,
        status: 'PENDING',
        promoCode: appliedPromo,
      })
      .returning();

    for (const pItem of preparedItems) {
      await tx.insert(orderItems).values({
        orderId: createdOrder.id,
        ticketTypeId: pItem.ticketTypeId,
        ticketTypeName: pItem.name,
        quantity: pItem.quantity,
        price: Math.round(pItem.unitPriceCents / 100),
        priceCents: pItem.unitPriceCents,
      });
    }

    const [createdPayment] = await tx
      .insert(payments)
      .values({
        orderId: createdOrder.id,
        businessId: biz.id,
        provider: params.provider,
        reference: paymentRef,
        idempotencyKey: params.idempotencyKey || `idem_${paymentRef}`,
        amountCents: breakdown.totalCents,
        currency: 'ZAR',
        gatewayFeeCents: breakdown.gatewayFeeCents,
        status: 'PENDING',
      })
      .returning();

    return { order: createdOrder, payment: createdPayment, evt, biz };
  });

  // Free order completes directly without external gateway payment
  if (txResult.payment.amountCents === 0) {
    const completed = await completeOrderPayment({
      reference: txResult.payment.reference,
      provider: txResult.payment.provider,
      amountCents: 0,
      gatewayFeeCents: 0,
      paymentMethod: 'free_order',
      rawResponse: { freeOrder: true },
      assignments: params.assignments,
      cartSessionId: params.cartSessionId,
    });
    return {
      order: completed.ok ? completed.order : txResult.order,
      payment: completed.ok ? completed.payment : txResult.payment,
      tickets: completed.ok ? completed.tickets : [],
      authorizationUrl: null,
      isTestMode: false,
      freeCompleted: true,
    };
  }

  // Initialize external/sandbox gateway session
  try {
    const init = await initializeGatewayPayment({
      provider: params.provider,
      reference: txResult.payment.reference,
      email: txResult.order.buyerEmail,
      amountCents: txResult.payment.amountCents,
      currency: 'ZAR',
      callbackUrl: `${params.callbackOrigin}/checkout?verifyRef=${encodeURIComponent(txResult.payment.reference)}`,
      metadata: {
        orderId: txResult.order.id,
        orderNumber: txResult.order.orderNumber,
        businessId: txResult.order.businessId,
        eventId: txResult.order.eventId,
      },
    });

    await db
      .update(payments)
      .set({
        authorizationUrl: init.authorizationUrl,
        rawResponse: JSON.stringify(init.raw),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, txResult.payment.id));

    return {
      order: txResult.order,
      payment: { ...txResult.payment, authorizationUrl: init.authorizationUrl },
      authorizationUrl: init.authorizationUrl,
      isTestMode: init.isTestMode,
      tickets: [],
      freeCompleted: false,
    };
  } catch (err: any) {
    // Release stock reservation immediately if gateway initialization fails
    await cancelPendingOrder(txResult.payment.reference);
    throw Object.assign(new Error(err?.message || 'Gateway initialization failed'), { statusCode: 400 });
  }
}

export async function recordWebhookAndProcess(params: {
  provider: string;
  rawBody: string;
  parsedBody: any;
  signature: string | undefined;
}) {
  const sigValid = verifyWebhookSignature(params.provider, params.rawBody, params.signature);
  const eventType = params.parsedBody?.event || 'unknown';
  const data = params.parsedBody?.data || {};
  const reference = data?.reference || params.parsedBody?.reference || 'UNKNOWN';

  const [webhookRow] = await db
    .insert(paymentWebhooks)
    .values({
      provider: params.provider,
      eventType,
      reference,
      payload: params.rawBody,
      signature: params.signature || null,
      signatureValid: sigValid ? 1 : 0,
      processed: 0,
    })
    .returning();

  if (!sigValid) {
    await db
      .update(paymentWebhooks)
      .set({ processingError: 'Invalid webhook HMAC signature' })
      .where(eq(paymentWebhooks.id, webhookRow.id));
    return { ok: false, statusCode: 401, error: 'Invalid webhook signature' };
  }

  if (eventType === 'charge.success') {
    const amountCents = Number(data.amount);
    const completion = await completeOrderPayment({
      reference,
      provider: params.provider,
      amountCents,
      gatewayFeeCents: Number(data.fees || 0),
      paymentMethod: data.channel || 'card',
      rawResponse: params.parsedBody,
      assignments: data.metadata?.assignments,
    });

    await db
      .update(paymentWebhooks)
      .set({
        processed: completion.ok ? 1 : 0,
        processingError: completion.ok ? null : completion.error,
        processedAt: new Date(),
      })
      .where(eq(paymentWebhooks.id, webhookRow.id));

    if (!completion.ok) {
      return { ok: false, statusCode: completion.statusCode || 400, error: completion.error };
    }
    return { ok: true, alreadyProcessed: completion.alreadyProcessed, order: completion.order };
  }

  await db
    .update(paymentWebhooks)
    .set({ processed: 1, processedAt: new Date() })
    .where(eq(paymentWebhooks.id, webhookRow.id));

  return { ok: true, ignored: true };
}
