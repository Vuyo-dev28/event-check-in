import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  financialLedger,
  orders,
  payments,
  refunds,
  tickets,
  ticketTypes,
} from '../db/schema.ts';
import { createNotification } from './notifications.ts';

async function executeGatewayRefund(provider: string | null, reference: string | null, amountCents: number) {
  if (provider === 'paystack' && reference && process.env.PAYSTACK_SECRET_KEY) {
    try {
      const resp = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: reference, amount: amountCents }),
      });
      const data = await resp.json();
      if (resp.ok && data.status) {
        return { ok: true, gatewayRefundId: String(data.data?.id || `rf_ps_${Date.now()}`) };
      }
      return { ok: false, error: data.message || 'Paystack refund request rejected.' };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Gateway refund error' };
    }
  }
  return { ok: true, gatewayRefundId: `rf_sbx_${Date.now()}` };
}

export async function processOrderRefund(params: {
  orderId: number;
  actorUserId: number;
  reason: string;
  ticketIds?: number[];
  existingRefundId?: number;
  reviewNotes?: string;
}) {
  const [order] = await db.select().from(orders).where(eq(orders.id, params.orderId));
  if (!order) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
  if (order.status === 'REFUNDED') {
    throw Object.assign(new Error('Order has already been fully refunded.'), { statusCode: 400 });
  }
  if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
    throw Object.assign(new Error(`Cannot refund an order in '${order.status}' state.`), { statusCode: 400 });
  }

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
  const targetTickets =
    params.ticketIds && params.ticketIds.length > 0
      ? orderTickets.filter((t) => params.ticketIds!.includes(t.id) && !['REFUNDED', 'CANCELLED'].includes(t.status))
      : orderTickets.filter((t) => !['REFUNDED', 'CANCELLED'].includes(t.status));

  if (targetTickets.length === 0) {
    throw Object.assign(new Error('No active tickets remain to refund on this order.'), { statusCode: 400 });
  }

  const isFullRefund = targetTickets.length === orderTickets.filter((t) => t.status !== 'REFUNDED').length;
  const totalTicketsInOrder = Math.max(1, orderTickets.length);
  const netOrderCents = Math.max(0, (order.subtotalCents ?? order.subtotal * 100) - (order.discountCents ?? order.discount * 100));
  const totalOrderCents = order.totalCents ?? order.total * 100;
  const refundAmountCents = isFullRefund
    ? totalOrderCents
    : Math.round((totalOrderCents * targetTickets.length) / totalTicketsInOrder);

  const gatewayResp = await executeGatewayRefund(order.paymentProvider, order.paymentReference, refundAmountCents);
  if (!gatewayResp.ok) {
    throw Object.assign(new Error(gatewayResp.error || 'Payment gateway refund failed.'), { statusCode: 502 });
  }

  const outcome = await db.transaction(async (tx) => {
    const ticketIdsToRefund = targetTickets.map((t) => t.id);

    await tx
      .update(tickets)
      .set({ status: 'REFUNDED' })
      .where(inArray(tickets.id, ticketIdsToRefund));

    // Restore ticket inventory atomically
    for (const t of targetTickets) {
      if (t.ticketTypeId) {
        await tx
          .update(ticketTypes)
          .set({ remaining: sql`${ticketTypes.remaining} + 1` })
          .where(eq(ticketTypes.id, t.ticketTypeId));
      }
    }

    const newOrderStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx
      .update(orders)
      .set({
        status: newOrderStatus,
        paymentStatus: newOrderStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, order.id));
    if (payment) {
      await tx
        .update(payments)
        .set({ status: newOrderStatus, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }

    let refundRow;
    if (params.existingRefundId) {
      [refundRow] = await tx
        .update(refunds)
        .set({
          status: 'COMPLETED',
          reviewedByUserId: params.actorUserId,
          reviewNotes: params.reviewNotes || 'Refund approved and processed.',
          gatewayRefundId: gatewayResp.gatewayRefundId,
          processedAt: new Date(),
        })
        .where(eq(refunds.id, params.existingRefundId))
        .returning();
    } else {
      [refundRow] = await tx
        .insert(refunds)
        .values({
          orderId: order.id,
          businessId: order.businessId,
          ticketId: ticketIdsToRefund.length === 1 ? ticketIdsToRefund[0] : null,
          requestedByUserId: params.actorUserId,
          requesterEmail: order.buyerEmail,
          reason: params.reason,
          amountCents: refundAmountCents,
          status: 'COMPLETED',
          reviewedByUserId: params.actorUserId,
          reviewNotes: params.reviewNotes || 'Processed directly.',
          gatewayRefundId: gatewayResp.gatewayRefundId,
          processedAt: new Date(),
        })
        .returning();
    }

    const proportionalNetCents = isFullRefund
      ? netOrderCents
      : Math.round((netOrderCents * targetTickets.length) / totalTicketsInOrder);
    const proportionalFeeCents = isFullRefund
      ? (order.platformFeeCutCents ?? order.platformFeeCut * 100)
      : Math.round(((order.platformFeeCutCents ?? order.platformFeeCut * 100) * targetTickets.length) / totalTicketsInOrder);
    const proportionalEarningsCents = Math.max(0, proportionalNetCents - proportionalFeeCents);

    await tx.insert(financialLedger).values([
      {
        businessId: order.businessId,
        orderId: order.id,
        refundId: refundRow.id,
        entryType: 'REFUND_REVERSAL',
        amountCents: -proportionalEarningsCents,
        currency: order.currency,
        description: `Refund reversal (${newOrderStatus}) for ${order.orderNumber}: ${params.reason}`,
      },
    ]);

    const refundUnits = Math.round(refundAmountCents / 100);
    const earningUnits = Math.round(proportionalEarningsCents / 100);
    const feeUnits = Math.round(proportionalFeeCents / 100);
    const salesUnits = Math.round(proportionalNetCents / 100);

    await tx
      .update(businesses)
      .set({
        grossSalesCents: sql`GREATEST(0, ${businesses.grossSalesCents} - ${proportionalNetCents})`,
        platformFeesCents: sql`GREATEST(0, ${businesses.platformFeesCents} - ${proportionalFeeCents})`,
        refundedAmtCents: sql`${businesses.refundedAmtCents} + ${refundAmountCents}`,
        pendingPayoutCents: sql`GREATEST(0, ${businesses.pendingPayoutCents} - ${proportionalEarningsCents})`,
        grossSales: sql`GREATEST(0, ${businesses.grossSales} - ${salesUnits})`,
        platformFees: sql`GREATEST(0, ${businesses.platformFees} - ${feeUnits})`,
        refundedAmt: sql`${businesses.refundedAmt} + ${refundUnits}`,
        pendingPayout: sql`GREATEST(0, ${businesses.pendingPayout} - ${earningUnits})`,
      })
      .where(eq(businesses.id, order.businessId));

    await tx.insert(auditLogs).values({
      userId: params.actorUserId,
      businessId: order.businessId,
      action: `Order ${newOrderStatus} (${order.orderNumber})`,
      resourceType: 'refund',
      resourceId: refundRow.id,
      previousValue: JSON.stringify({ orderStatus: order.status }),
      newValue: JSON.stringify({ orderStatus: newOrderStatus, refundAmountCents, ticketsRefunded: ticketIdsToRefund.length }),
    });

    return {
      order: { ...order, status: newOrderStatus, paymentStatus: newOrderStatus },
      refund: refundRow,
      newOrderStatus,
      ticketsRefunded: ticketIdsToRefund.length,
      refundAmountCents,
    };
  });

  await createNotification({
    userId: order.userId,
    email: order.buyerEmail,
    type: 'REFUND_COMPLETED',
    title: `Refund Processed for Order ${order.orderNumber}`,
    message: `Your refund of R${(outcome.refundAmountCents / 100).toFixed(2)} (${outcome.ticketsRefunded} ticket(s)) has been completed. Ref: ${outcome.refund.gatewayRefundId}.`,
    channel: 'EMAIL',
    sendEmailToo: true,
    metadata: { orderId: order.id, refundId: outcome.refund.id },
  });

  return outcome;
}
