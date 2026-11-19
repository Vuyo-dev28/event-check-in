import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { businesses, commissionRules, events, platformSettings } from '../db/schema.ts';

export interface ResolvedCommission {
  commissionBps: number;
  fixedFeeCents: number;
  bookingFeeBps: number;
  source: 'EVENT' | 'BUSINESS' | 'PLATFORM';
}

export async function resolveCommissionRule(businessId: number, eventId?: number | null): Promise<ResolvedCommission> {
  if (eventId) {
    const [eventRule] = await db
      .select()
      .from(commissionRules)
      .where(and(eq(commissionRules.scope, 'EVENT'), eq(commissionRules.eventId, eventId), eq(commissionRules.active, 1)))
      .orderBy(desc(commissionRules.createdAt))
      .limit(1);
    if (eventRule) {
      return {
        commissionBps: eventRule.commissionBps,
        fixedFeeCents: eventRule.fixedFeeCents,
        bookingFeeBps: eventRule.bookingFeeBps,
        source: 'EVENT',
      };
    }

    const [evt] = await db.select().from(events).where(eq(events.id, eventId));
    if (evt && evt.commissionBps !== null) {
      return {
        commissionBps: evt.commissionBps,
        fixedFeeCents: evt.commissionFixedCents ?? 0,
        bookingFeeBps: 350,
        source: 'EVENT',
      };
    }
  }

  const [bizRule] = await db
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.scope, 'BUSINESS'), eq(commissionRules.businessId, businessId), eq(commissionRules.active, 1)))
    .orderBy(desc(commissionRules.createdAt))
    .limit(1);
  if (bizRule) {
    return {
      commissionBps: bizRule.commissionBps,
      fixedFeeCents: bizRule.fixedFeeCents,
      bookingFeeBps: bizRule.bookingFeeBps,
      source: 'BUSINESS',
    };
  }

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (biz && biz.commissionBps !== null) {
    return {
      commissionBps: biz.commissionBps,
      fixedFeeCents: biz.commissionFixedCents ?? 0,
      bookingFeeBps: 350,
      source: 'BUSINESS',
    };
  }

  const [platRule] = await db
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.scope, 'PLATFORM'), eq(commissionRules.active, 1)))
    .orderBy(desc(commissionRules.createdAt))
    .limit(1);

  if (platRule) {
    return {
      commissionBps: platRule.commissionBps,
      fixedFeeCents: platRule.fixedFeeCents,
      bookingFeeBps: platRule.bookingFeeBps,
      source: 'PLATFORM',
    };
  }

  const [settings] = await db.select().from(platformSettings).limit(1);
  return {
    commissionBps: settings ? settings.platformFeePercent * 100 : 500,
    fixedFeeCents: settings ? settings.platformFixedFee * 100 : 0,
    bookingFeeBps: 350,
    source: 'PLATFORM',
  };
}

export function calculateFinancialBreakdown(
  subtotalCents: number,
  discountCents: number,
  rule: ResolvedCommission
) {
  const netTicketSalesCents = Math.max(0, subtotalCents - discountCents);
  const serviceFeeCents = netTicketSalesCents > 0 ? Math.round((netTicketSalesCents * rule.bookingFeeBps) / 10000) : 0;
  const totalCents = netTicketSalesCents + serviceFeeCents;
  const platformFeeCutCents =
    netTicketSalesCents > 0
      ? Math.round((netTicketSalesCents * rule.commissionBps) / 10000) + rule.fixedFeeCents
      : 0;
  const gatewayFeeCents = totalCents > 0 ? Math.round(totalCents * 0.029) : 0;
  const businessEarningsCents = Math.max(0, netTicketSalesCents - platformFeeCutCents);

  return {
    subtotalCents,
    discountCents,
    netTicketSalesCents,
    serviceFeeCents,
    totalCents,
    platformFeeCutCents,
    gatewayFeeCents,
    businessEarningsCents,
  };
}
