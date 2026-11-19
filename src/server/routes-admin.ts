import crypto from 'crypto';
import type { Express } from 'express';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  businessVerifications,
  commissionRules,
  events,
  financialLedger,
  orders,
  payments,
  payouts,
  platformSettings,
  refunds,
  tickets,
  users,
} from '../db/schema.ts';
import { requireAuth, requireSuperAdmin } from './auth.ts';
import { createNotification } from './notifications.ts';
import { processOrderRefund } from './refunds.ts';

export function registerAdminRoutes(app: Express) {
  // Real database overview analytics with date range filter
  app.get('/api/admin/dashboard', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const fromDate = req.query.from ? new Date(String(req.query.from)) : null;
      const toDate = req.query.to ? new Date(String(req.query.to)) : null;

      const orderFilters = [];
      if (fromDate && !isNaN(fromDate.getTime())) orderFilters.push(gte(orders.createdAt, fromDate));
      if (toDate && !isNaN(toDate.getTime())) orderFilters.push(lte(orders.createdAt, toDate));

      const allBiz = await db.select().from(businesses).orderBy(desc(businesses.createdAt));
      const allEvents = await db
        .select({
          event: events,
          businessName: businesses.name,
        })
        .from(events)
        .innerJoin(businesses, eq(events.businessId, businesses.id))
        .orderBy(desc(events.createdAt));

      const allOrders = await db
        .select({
          order: orders,
          eventName: events.name,
          businessName: businesses.name,
        })
        .from(orders)
        .innerJoin(events, eq(orders.eventId, events.id))
        .innerJoin(businesses, eq(orders.businessId, businesses.id))
        .where(orderFilters.length > 0 ? and(...orderFilters) : undefined)
        .orderBy(desc(orders.createdAt));

      const allCustomers = await db.select().from(users).where(eq(users.role, 'attendee'));
      const totalTicketsSoldRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(sql`${tickets.status} IN ('VALID','CHECKED_IN')`);
      const checkedInRes = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(eq(tickets.status, 'CHECKED_IN'));

      const allPayments = await db
        .select({
          payment: payments,
          orderNumber: orders.orderNumber,
          buyerEmail: orders.buyerEmail,
          businessName: businesses.name,
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(businesses, eq(payments.businessId, businesses.id))
        .orderBy(desc(payments.createdAt))
        .limit(100);

      const allPayouts = await db
        .select({
          payout: payouts,
          businessName: businesses.name,
        })
        .from(payouts)
        .innerJoin(businesses, eq(payouts.businessId, businesses.id))
        .orderBy(desc(payouts.createdAt));

      const allRefunds = await db
        .select({
          refund: refunds,
          orderNumber: orders.orderNumber,
          businessName: businesses.name,
        })
        .from(refunds)
        .innerJoin(orders, eq(refunds.orderId, orders.id))
        .innerJoin(businesses, eq(refunds.businessId, businesses.id))
        .orderBy(desc(refunds.createdAt));

      const audits = await db
        .select({
          log: auditLogs,
          userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
          businessName: businesses.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .leftJoin(businesses, eq(auditLogs.businessId, businesses.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);

      const paidOrders = allOrders.filter((o) => o.order.status === 'PAID' || o.order.status === 'PARTIALLY_REFUNDED');
      const guestOrdersCount = paidOrders.filter((o) => o.order.userId === null).length;

      // Real sums in cents from businesses + orders
      const totalGrossSalesCents = allBiz.reduce((acc, b) => acc + (b.grossSalesCents || b.grossSales * 100), 0);
      const totalPlatformCommissionCents = allBiz.reduce((acc, b) => acc + (b.platformFeesCents || b.platformFees * 100), 0);
      const totalRefundedCents = allBiz.reduce((acc, b) => acc + (b.refundedAmtCents || b.refundedAmt * 100), 0);
      const totalPendingPayoutCents = allBiz.reduce((acc, b) => acc + (b.pendingPayoutCents || b.pendingPayout * 100), 0);
      const failedPaymentsCount = allPayments.filter((p) => p.payment.status === 'FAILED').length;

      res.json({
        summary: {
          totalBusinesses: allBiz.length,
          activeBusinesses: allBiz.filter((b) => b.status === 'ACTIVE').length,
          pendingBusinesses: allBiz.filter((b) => ['PENDING', 'UNDER_REVIEW'].includes(b.status)).length,
          totalCustomers: allCustomers.length,
          guestPurchases: guestOrdersCount,
          totalEvents: allEvents.length,
          publishedEvents: allEvents.filter((e) => ['PUBLISHED', 'ON_SALE'].includes(e.event.status)).length,
          ticketsSold: Number(totalTicketsSoldRes[0]?.count || 0),
          checkedIn: Number(checkedInRes[0]?.count || 0),
          totalRevenueCents: totalGrossSalesCents,
          platformCommissionCents: totalPlatformCommissionCents,
          refundedAmtCents: totalRefundedCents,
          pendingPayoutCents: totalPendingPayoutCents,
          totalTransactions: allPayments.length,
          failedTransactions: failedPaymentsCount,
          // Legacy unit values preserved for compatibility
          totalRevenue: Math.round(totalGrossSalesCents / 100),
          platformFees: Math.round(totalPlatformCommissionCents / 100),
          refundedAmt: Math.round(totalRefundedCents / 100),
          activeEvents: allEvents.filter((e) => ['PUBLISHED', 'ON_SALE'].includes(e.event.status)).length,
        },
        businesses: allBiz,
        events: allEvents.map((e) => ({ ...e.event, businessName: e.businessName })),
        orders: allOrders.map((o) => ({ ...o.order, eventName: o.eventName, businessName: o.businessName })),
        transactions: allPayments.map((p) => ({
          ...p.payment,
          orderNumber: p.orderNumber,
          buyerEmail: p.buyerEmail,
          businessName: p.businessName,
        })),
        payouts: allPayouts.map((p) => ({ ...p.payout, businessName: p.businessName })),
        refunds: allRefunds.map((r) => ({ ...r.refund, orderNumber: r.orderNumber, businessName: r.businessName })),
        customers: allCustomers.map((c) => ({
          id: c.id,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          city: c.city,
          emailVerified: c.emailVerified,
          createdAt: c.createdAt,
        })),
        auditLogs: audits,
      });
    } catch (err) {
      console.error('Admin dashboard failed:', err);
      res.status(500).json({ error: 'Failed to load Super Admin dashboard.' });
    }
  });

  // Update business status & verification
  app.post('/api/admin/businesses/:id/status', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const bizId = Number(req.params.id);
      const { status, verificationStatus, rejectionReason, commissionBps } = req.body;
      const [existing] = await db.select().from(businesses).where(eq(businesses.id, bizId));
      if (!existing) return res.status(404).json({ error: 'Business not found.' });

      const updateFields: Record<string, any> = {};
      if (status) updateFields.status = status;
      if (verificationStatus) updateFields.verificationStatus = verificationStatus;
      if (rejectionReason !== undefined) updateFields.rejectionReason = rejectionReason;
      if (commissionBps !== undefined) updateFields.commissionBps = commissionBps === null ? null : Number(commissionBps);

      const [updated] = await db.update(businesses).set(updateFields).where(eq(businesses.id, bizId)).returning();

      if (verificationStatus) {
        await db
          .update(businessVerifications)
          .set({
            status: verificationStatus,
            reviewedByUserId: req.authUser!.id,
            reviewedAt: new Date(),
            notes: rejectionReason || null,
          })
          .where(eq(businessVerifications.businessId, bizId));
      }

      await db.insert(auditLogs).values({
        userId: req.authUser!.id,
        businessId: bizId,
        action: `Business Updated -> ${updated.status}`,
        resourceType: 'business',
        resourceId: bizId,
        previousValue: JSON.stringify({ status: existing.status, verificationStatus: existing.verificationStatus }),
        newValue: JSON.stringify({ status: updated.status, verificationStatus: updated.verificationStatus }),
      });

      if (status && status !== existing.status) {
        await createNotification({
          email: updated.email,
          type: `BUSINESS_${updated.status}`,
          title: `Business Status Update: ${updated.name} is now ${updated.status}`,
          message:
            updated.status === 'ACTIVE'
              ? `Congratulations! ${updated.name} has been approved and activated on the marketplace.`
              : `Your business status has been updated to ${updated.status}. ${rejectionReason || ''}`,
          channel: 'EMAIL',
          sendEmailToo: true,
          metadata: { businessId: bizId, status: updated.status },
        });
      }

      res.json({ success: true, business: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update business.' });
    }
  });

  // Event moderation: approve, reject, feature, suspend, cancel
  app.post('/api/admin/events/:id/moderate', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const { status, isFeatured } = req.body;
      const [existing] = await db.select().from(events).where(eq(events.id, eventId));
      if (!existing) return res.status(404).json({ error: 'Event not found.' });

      const [updated] = await db
        .update(events)
        .set({
          status: status ?? existing.status,
          isFeatured: isFeatured !== undefined ? (isFeatured ? 1 : 0) : existing.isFeatured,
        })
        .where(eq(events.id, eventId))
        .returning();

      await db.insert(auditLogs).values({
        userId: req.authUser!.id,
        businessId: existing.businessId,
        action: `Admin Event Moderation (${updated.status})`,
        resourceType: 'event',
        resourceId: eventId,
        previousValue: JSON.stringify({ status: existing.status, isFeatured: existing.isFeatured }),
        newValue: JSON.stringify({ status: updated.status, isFeatured: updated.isFeatured }),
      });

      if (status === 'CANCELLED' && existing.status !== 'CANCELLED') {
        const affectedOrders = await db
          .select()
          .from(orders)
          .where(and(eq(orders.eventId, eventId), eq(orders.status, 'PAID')));
        for (const ord of affectedOrders) {
          await createNotification({
            userId: ord.userId,
            email: ord.buyerEmail,
            type: 'EVENT_CANCELLED',
            title: `Event Cancelled: ${existing.name}`,
            message: `${existing.name} has been cancelled. You may request a full refund for order ${ord.orderNumber} from My Orders.`,
            channel: 'EMAIL',
            sendEmailToo: true,
          });
        }
      }

      res.json({ success: true, event: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to moderate event.' });
    }
  });

  // Commission rules management
  app.get('/api/admin/commission-rules', requireAuth, requireSuperAdmin, async (_req, res) => {
    const list = await db.select().from(commissionRules).orderBy(desc(commissionRules.createdAt));
    res.json(list);
  });

  app.post('/api/admin/commission-rules', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { scope, businessId, eventId, commissionBps, fixedFeeCents, bookingFeeBps } = req.body;
      const [created] = await db
        .insert(commissionRules)
        .values({
          scope: scope || 'PLATFORM',
          businessId: businessId ? Number(businessId) : null,
          eventId: eventId ? Number(eventId) : null,
          commissionBps: Number(commissionBps ?? 500),
          fixedFeeCents: Number(fixedFeeCents ?? 0),
          bookingFeeBps: Number(bookingFeeBps ?? 350),
          active: 1,
        })
        .returning();

      await db.insert(auditLogs).values({
        userId: req.authUser!.id,
        businessId: created.businessId,
        action: `Commission Rule Created (${created.scope})`,
        resourceType: 'commission_rule',
        resourceId: created.id,
        newValue: JSON.stringify(created),
      });

      res.json({ success: true, rule: created });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create commission rule.' });
    }
  });

  // Settings
  app.get('/api/admin/settings', requireAuth, requireSuperAdmin, async (_req, res) => {
    const [settings] = await db.select().from(platformSettings).limit(1);
    res.json(settings || { platformName: 'BookMyte', currency: 'ZAR', platformFeePercent: 5, platformFixedFee: 0 });
  });

  app.post('/api/admin/settings', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const {
        platformName,
        logo,
        currency,
        platformFeePercent,
        platformFixedFee,
        supportEmail,
        businessApprovalRequired,
        eventApprovalRequired,
      } = req.body;
      const [existing] = await db.select().from(platformSettings).limit(1);

      let updated;
      if (existing) {
        [updated] = await db
          .update(platformSettings)
          .set({
            platformName,
            logo: logo ?? existing.logo,
            currency,
            platformFeePercent: Number(platformFeePercent),
            platformFixedFee: Number(platformFixedFee),
            supportEmail,
            businessApprovalRequired: businessApprovalRequired ? 1 : 0,
            eventApprovalRequired: eventApprovalRequired ? 1 : 0,
          })
          .where(eq(platformSettings.id, existing.id))
          .returning();
      } else {
        [updated] = await db
          .insert(platformSettings)
          .values({
            platformName,
            logo,
            currency,
            platformFeePercent: Number(platformFeePercent),
            platformFixedFee: Number(platformFixedFee),
            supportEmail,
            businessApprovalRequired: businessApprovalRequired ? 1 : 0,
            eventApprovalRequired: eventApprovalRequired ? 1 : 0,
          })
          .returning();
      }

      // Sync default PLATFORM commission rule
      await db
        .update(commissionRules)
        .set({
          commissionBps: Number(platformFeePercent) * 100,
          fixedFeeCents: Number(platformFixedFee) * 100,
        })
        .where(and(eq(commissionRules.scope, 'PLATFORM'), eq(commissionRules.active, 1)));

      await db.insert(auditLogs).values({
        userId: req.authUser!.id,
        action: 'Platform Settings Updated',
        resourceType: 'platform_settings',
        resourceId: updated.id,
        previousValue: existing ? JSON.stringify(existing) : null,
        newValue: JSON.stringify(updated),
      });

      res.json({ success: true, settings: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save platform settings.' });
    }
  });

  // Dispatch Payout (supports amount in Rand or Cents, writes financialLedger PAYOUT_DEBIT)
  app.post('/api/admin/payouts', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { businessId, amount, amountCents, notes } = req.body;
      const bizId = Number(businessId);
      const payoutCents = amountCents !== undefined ? Number(amountCents) : Math.round(Number(amount) * 100);
      if (!Number.isInteger(payoutCents) || payoutCents <= 0) {
        return res.status(400).json({ error: 'Payout amount must be positive.' });
      }

      const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizId));
      if (!biz) return res.status(404).json({ error: 'Business not found.' });

      const availableCents = biz.pendingPayoutCents || biz.pendingPayout * 100;
      if (availableCents < payoutCents) {
        return res.status(400).json({ error: `Insufficient pending payout balance (Max R${(availableCents / 100).toFixed(2)}).` });
      }

      const ref = `PAYOUT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const payoutUnits = Math.round(payoutCents / 100);

      const payout = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(payouts)
          .values({
            businessId: bizId,
            amount: payoutUnits,
            amountCents: payoutCents,
            currency: 'ZAR',
            status: 'PAID',
            reference: ref,
            notes: notes || null,
            processedByUserId: req.authUser!.id,
            processedAt: new Date(),
          })
          .returning();

        await tx
          .update(businesses)
          .set({
            pendingPayoutCents: sql`GREATEST(0, ${businesses.pendingPayoutCents} - ${payoutCents})`,
            paidPayoutCents: sql`${businesses.paidPayoutCents} + ${payoutCents}`,
            pendingPayout: sql`GREATEST(0, ${businesses.pendingPayout} - ${payoutUnits})`,
            paidPayout: sql`${businesses.paidPayout} + ${payoutUnits}`,
          })
          .where(eq(businesses.id, bizId));

        await tx.insert(financialLedger).values({
          businessId: bizId,
          payoutId: p.id,
          entryType: 'PAYOUT_DEBIT',
          amountCents: -payoutCents,
          currency: 'ZAR',
          description: `Payout disbursed (${ref})`,
        });

        await tx.insert(auditLogs).values({
          userId: req.authUser!.id,
          businessId: bizId,
          action: `Processed Payout ${ref}`,
          resourceType: 'payout',
          resourceId: p.id,
          newValue: JSON.stringify({ amountCents: payoutCents, reference: ref }),
        });

        return p;
      });

      await createNotification({
        email: biz.payoutEmail || biz.email,
        type: 'PAYOUT_DISBURSED',
        title: `Payout Disbursed: ${ref} (R${(payoutCents / 100).toFixed(2)})`,
        message: `A payout of R${(payoutCents / 100).toFixed(2)} has been dispatched to ${biz.bankName || 'your configured bank account'} (${ref}).`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { businessId: bizId, payoutId: payout.id },
      });

      res.json({ success: true, payout });
    } catch (err) {
      console.error('Payout failed:', err);
      res.status(500).json({ error: 'Payout transaction failed.' });
    }
  });

  // Super Admin refund by Order ID or Refund ID
  app.post('/api/admin/orders/:id/refund', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { reason, ticketIds } = req.body || {};
      const result = await processOrderRefund({
        orderId,
        actorUserId: req.authUser!.id,
        reason: reason || 'Super Admin Refund',
        ticketIds,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Refund transaction failed.' });
    }
  });

  app.post('/api/admin/refunds/:id/process', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const refundId = Number(req.params.id);
      const { decision, notes } = req.body || {};
      const [rf] = await db.select().from(refunds).where(eq(refunds.id, refundId));
      if (!rf) return res.status(404).json({ error: 'Refund request not found.' });

      if (decision === 'REJECT') {
        const [rejected] = await db
          .update(refunds)
          .set({
            status: 'REJECTED',
            reviewedByUserId: req.authUser!.id,
            reviewNotes: notes || 'Declined by Platform Admin',
            processedAt: new Date(),
          })
          .where(eq(refunds.id, refundId))
          .returning();
        return res.json({ success: true, refund: rejected });
      }

      const result = await processOrderRefund({
        orderId: rf.orderId,
        actorUserId: req.authUser!.id,
        reason: rf.reason,
        ticketIds: rf.ticketId ? [rf.ticketId] : undefined,
        existingRefundId: rf.id,
        reviewNotes: notes || 'Approved by Super Admin.',
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Refund processing failed.' });
    }
  });
}
