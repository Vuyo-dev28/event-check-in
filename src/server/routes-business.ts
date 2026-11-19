import crypto from 'crypto';
import type { Express } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  businessTeam,
  businessVerifications,
  checkInRecords,
  events,
  financialLedger,
  orders,
  payouts,
  platformSettings,
  promoCodes,
  refunds,
  staffInvitations,
  tickets,
  ticketTypes,
  users,
  venues,
} from '../db/schema.ts';
import { requireAuth, requireBusinessMember } from './auth.ts';
import { createNotification } from './notifications.ts';
import { processOrderRefund } from './refunds.ts';

function slugify(input: string, suffix?: string | number) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return suffix !== undefined ? `${base}-${suffix}` : base;
}

export function registerBusinessRoutes(app: Express) {
  // Save & resume onboarding draft
  app.get('/api/businesses/onboarding/draft', requireAuth, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const existing = await db
        .select({
          business: businesses,
          role: businessTeam.role,
        })
        .from(businessTeam)
        .innerJoin(businesses, eq(businessTeam.businessId, businesses.id))
        .where(eq(businessTeam.userId, userId));

      res.json({
        businesses: existing.map((e) => ({
          ...e.business,
          role: e.role,
          onboardingDraft: e.business.onboardingDraft ? JSON.parse(e.business.onboardingDraft) : null,
        })),
      });
    } catch (err) {
      console.error('Get onboarding draft failed:', err);
      res.status(500).json({ error: 'Failed to retrieve onboarding draft.' });
    }
  });

  app.post('/api/businesses/onboarding/draft', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const { businessId, step, draft } = req.body;

      if (businessId) {
        const [membership] = await db
          .select()
          .from(businessTeam)
          .where(and(eq(businessTeam.businessId, Number(businessId)), eq(businessTeam.userId, user.id)));
        if (!membership || !['BUSINESS_OWNER', 'BUSINESS_ADMIN'].includes(membership.role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const [updated] = await db
          .update(businesses)
          .set({
            name: draft?.name || undefined,
            type: draft?.type || undefined,
            contactPerson: draft?.contactPerson || undefined,
            phone: draft?.phone || undefined,
            country: draft?.country || undefined,
            address: draft?.address || undefined,
            website: draft?.website || undefined,
            logo: draft?.logo || undefined,
            description: draft?.description || undefined,
            registrationNumber: draft?.registrationNumber || undefined,
            taxNumber: draft?.taxNumber || undefined,
            bankName: draft?.bankName || undefined,
            bankAccountNumber: draft?.bankAccountNumber || undefined,
            bankBranchCode: draft?.bankBranchCode || undefined,
            accountHolderName: draft?.accountHolderName || undefined,
            payoutEmail: draft?.payoutEmail || undefined,
            onboardingStep: Number(step || 1),
            onboardingDraft: JSON.stringify(draft || {}),
          })
          .where(eq(businesses.id, Number(businessId)))
          .returning();

        return res.json({ success: true, business: updated });
      }

      const emailToUse = (draft?.email || `${user.email.split('@')[0]}+${Date.now()}@business.local`).trim().toLowerCase();
      const [created] = await db
        .insert(businesses)
        .values({
          name: draft?.name || `${user.firstName || 'My'} Events`,
          slug: slugify(draft?.name || 'business', Math.floor(1000 + Math.random() * 9000)),
          type: draft?.type || 'Event Organiser',
          contactPerson: draft?.contactPerson || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: emailToUse,
          phone: draft?.phone || user.phone || null,
          country: draft?.country || 'South Africa',
          address: draft?.address || null,
          website: draft?.website || null,
          logo: draft?.logo || null,
          description: draft?.description || null,
          onboardingStep: Number(step || 1),
          onboardingDraft: JSON.stringify(draft || {}),
          status: 'PENDING',
        })
        .returning();

      await db.insert(businessTeam).values({
        businessId: created.id,
        userId: user.id,
        role: 'BUSINESS_OWNER',
      });

      res.json({ success: true, business: created });
    } catch (err: any) {
      console.error('Save onboarding draft failed:', err);
      res.status(400).json({ error: err?.message || 'Could not save draft. Ensure business email is unique.' });
    }
  });

  // Register or submit full business application for approval
  app.post('/api/businesses', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const {
        businessId,
        name,
        type,
        contactPerson,
        email,
        phone,
        country,
        address,
        website,
        logo,
        description,
        registrationNumber,
        taxNumber,
        bankName,
        bankAccountNumber,
        bankBranchCode,
        accountHolderName,
        payoutEmail,
        agreementAccepted,
        registrationDocUrl,
        idDocUrl,
        bankProofUrl,
      } = req.body;

      if (!name?.trim() || !email?.trim()) {
        return res.status(400).json({ error: 'Business name and email are required.' });
      }
      if (agreementAccepted === false) {
        return res.status(400).json({ error: 'You must accept the platform organiser agreements to submit.' });
      }

      const [settings] = await db.select().from(platformSettings).limit(1);
      const initialStatus = settings?.businessApprovalRequired === 0 ? 'ACTIVE' : 'UNDER_REVIEW';

      let business;
      if (businessId) {
        const [membership] = await db
          .select()
          .from(businessTeam)
          .where(and(eq(businessTeam.businessId, Number(businessId)), eq(businessTeam.userId, user.id)));
        if (!membership || !['BUSINESS_OWNER', 'BUSINESS_ADMIN'].includes(membership.role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        [business] = await db
          .update(businesses)
          .set({
            name: name.trim(),
            slug: slugify(name.trim(), Number(businessId)),
            type: type || 'Event Organiser',
            contactPerson: contactPerson || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: email.trim().toLowerCase(),
            phone: phone || null,
            country: country || 'South Africa',
            address: address || null,
            website: website || null,
            logo: logo || null,
            description: description || null,
            registrationNumber: registrationNumber || null,
            taxNumber: taxNumber || null,
            bankName: bankName || null,
            bankAccountNumber: bankAccountNumber || null,
            bankBranchCode: bankBranchCode || null,
            accountHolderName: accountHolderName || null,
            payoutEmail: payoutEmail || email.trim().toLowerCase(),
            agreementAcceptedAt: new Date(),
            onboardingStep: 14,
            status: initialStatus,
          })
          .where(eq(businesses.id, Number(businessId)))
          .returning();
      } else {
        [business] = await db
          .insert(businesses)
          .values({
            name: name.trim(),
            slug: slugify(name.trim(), Math.floor(1000 + Math.random() * 9000)),
            type: type || 'Event Organiser',
            contactPerson: contactPerson || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: email.trim().toLowerCase(),
            phone: phone || null,
            country: country || 'South Africa',
            address: address || null,
            website: website || null,
            logo: logo || null,
            description: description || null,
            registrationNumber: registrationNumber || null,
            taxNumber: taxNumber || null,
            bankName: bankName || null,
            bankAccountNumber: bankAccountNumber || null,
            bankBranchCode: bankBranchCode || null,
            accountHolderName: accountHolderName || null,
            payoutEmail: payoutEmail || email.trim().toLowerCase(),
            agreementAcceptedAt: new Date(),
            onboardingStep: 14,
            status: initialStatus,
          })
          .returning();

        await db.insert(businessTeam).values({
          businessId: business.id,
          userId: user.id,
          role: 'BUSINESS_OWNER',
        });
      }

      if (registrationDocUrl || idDocUrl || bankProofUrl) {
        await db.insert(businessVerifications).values({
          businessId: business.id,
          registrationDocUrl: registrationDocUrl || null,
          idDocUrl: idDocUrl || null,
          bankProofUrl: bankProofUrl || null,
          status: 'UNDER_REVIEW',
        });
      }

      // Only grant organizer role once user explicitly registers a business
      if (user.role === 'attendee') {
        await db.update(users).set({ role: 'organizer', updatedAt: new Date() }).where(eq(users.id, user.id));
      }

      await db.insert(auditLogs).values({
        userId: user.id,
        businessId: business.id,
        action: 'Business Application Submitted',
        resourceType: 'business',
        resourceId: business.id,
        newValue: JSON.stringify({ status: business.status, name: business.name }),
      });

      await createNotification({
        userId: user.id,
        email: business.email,
        type: 'BUSINESS_APPLICATION_SUBMITTED',
        title: `Business Application Received: ${business.name}`,
        message:
          business.status === 'ACTIVE'
            ? `Your business ${business.name} is active and ready to publish events.`
            : `Your business application for ${business.name} has been submitted for Super Admin review.`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { businessId: business.id },
      });

      res.json({ success: true, business });
    } catch (err: any) {
      console.error('Business registration failed:', err);
      res.status(400).json({ error: 'Registration failed. Ensure the business email is not already registered.' });
    }
  });

  // Update business settings & payout banking info
  app.patch(
    '/api/businesses/my/settings',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const {
          name,
          type,
          contactPerson,
          phone,
          country,
          address,
          website,
          logo,
          description,
          registrationNumber,
          taxNumber,
          bankName,
          bankAccountNumber,
          bankBranchCode,
          accountHolderName,
          payoutEmail,
        } = req.body;

        const [updated] = await db
          .update(businesses)
          .set({
            name: name ?? undefined,
            type: type ?? undefined,
            contactPerson: contactPerson ?? undefined,
            phone: phone ?? undefined,
            country: country ?? undefined,
            address: address ?? undefined,
            website: website ?? undefined,
            logo: logo ?? undefined,
            description: description ?? undefined,
            registrationNumber: registrationNumber ?? undefined,
            taxNumber: taxNumber ?? undefined,
            bankName: bankName ?? undefined,
            bankAccountNumber: bankAccountNumber ?? undefined,
            bankBranchCode: bankBranchCode ?? undefined,
            accountHolderName: accountHolderName ?? undefined,
            payoutEmail: payoutEmail ?? undefined,
          })
          .where(eq(businesses.id, bizId))
          .returning();

        await db.insert(auditLogs).values({
          userId: req.authUser!.id,
          businessId: bizId,
          action: 'Business Settings Updated',
          resourceType: 'business',
          resourceId: bizId,
        });

        res.json({ success: true, business: updated });
      } catch (err) {
        console.error('Update business settings failed:', err);
        res.status(500).json({ error: 'Failed to update business settings.' });
      }
    }
  );

  // My businesses list
  app.get('/api/businesses/my', requireAuth, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const myBusinesses = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          type: businesses.type,
          email: businesses.email,
          phone: businesses.phone,
          country: businesses.country,
          address: businesses.address,
          website: businesses.website,
          logo: businesses.logo,
          description: businesses.description,
          verificationStatus: businesses.verificationStatus,
          rejectionReason: businesses.rejectionReason,
          status: businesses.status,
          bankName: businesses.bankName,
          bankAccountNumber: businesses.bankAccountNumber,
          bankBranchCode: businesses.bankBranchCode,
          accountHolderName: businesses.accountHolderName,
          payoutEmail: businesses.payoutEmail,
          registrationNumber: businesses.registrationNumber,
          taxNumber: businesses.taxNumber,
          grossSales: businesses.grossSales,
          platformFees: businesses.platformFees,
          refundedAmt: businesses.refundedAmt,
          pendingPayout: businesses.pendingPayout,
          paidPayout: businesses.paidPayout,
          grossSalesCents: businesses.grossSalesCents,
          platformFeesCents: businesses.platformFeesCents,
          refundedAmtCents: businesses.refundedAmtCents,
          pendingPayoutCents: businesses.pendingPayoutCents,
          paidPayoutCents: businesses.paidPayoutCents,
          createdAt: businesses.createdAt,
          role: businessTeam.role,
        })
        .from(businessTeam)
        .innerJoin(businesses, eq(businessTeam.businessId, businesses.id))
        .where(eq(businessTeam.userId, userId));

      res.json(myBusinesses);
    } catch (err) {
      console.error('Get my businesses failed:', err);
      res.status(500).json({ error: 'Failed to load businesses.' });
    }
  });

  // Venues - strictly scoped to business members
  app.get('/api/venues', requireAuth, requireBusinessMember(), async (req, res) => {
    try {
      const bizId = (req as any).businessId;
      const list = await db.select().from(venues).where(eq(venues.businessId, bizId)).orderBy(desc(venues.createdAt));
      res.json(list);
    } catch (err) {
      console.error('Get venues failed:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post(
    '/api/venues',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const { name, description, address, city, province, country, latitude, longitude, capacity, image } = req.body;
        if (!name?.trim() || !address?.trim() || !city?.trim()) {
          return res.status(400).json({ error: 'Venue name, address, and city are required.' });
        }
        const [venue] = await db
          .insert(venues)
          .values({
            businessId: bizId,
            name: name.trim(),
            description: description || null,
            address: address.trim(),
            city: city.trim(),
            province: province || null,
            country: country || 'South Africa',
            latitude: latitude || null,
            longitude: longitude || null,
            capacity: Math.max(1, Number(capacity || 100)),
            image: image || null,
          })
          .returning();

        res.json({ success: true, venue });
      } catch (err) {
        console.error('Create venue failed:', err);
        res.status(500).json({ error: 'Failed to create venue.' });
      }
    }
  );

  // Business Events CRUD (CHECK_IN_STAFF can read events for scanner dropdown; managers/admins/owners can create & edit)
  app.get('/api/events/my', requireAuth, requireBusinessMember(), async (req, res) => {
    try {
      const bizId = (req as any).businessId;
      const myEvents = await db
        .select({
          event: events,
          venueName: venues.name,
          venueCity: venues.city,
        })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(eq(events.businessId, bizId))
        .orderBy(desc(events.createdAt));

      const enriched = [];
      for (const row of myEvents) {
        const tiers = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, row.event.id));
        const soldCount = tiers.reduce((sum, t) => sum + Math.max(0, t.quantity - t.remaining), 0);
        enriched.push({
          ...row.event,
          venueName: row.venueName || (row.event.isOnline ? 'Online Event' : row.event.address || 'Venue TBA'),
          venueCity: row.venueCity || row.event.city,
          ticketTypes: tiers,
          soldCount,
        });
      }

      res.json(enriched);
    } catch (err) {
      console.error('Get my events failed:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post(
    '/api/events',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizId));
        if (!biz) return res.status(404).json({ error: 'Business not found.' });

        const {
          venueId,
          name,
          description,
          coverImage,
          bannerImages,
          logo,
          address,
          city,
          province,
          country,
          isOnline,
          onlineUrl,
          mapLat,
          mapLng,
          contactEmail,
          contactPhone,
          refundPolicy,
          termsAndConditions,
          dateText,
          startDate,
          endDate,
          startTime,
          endTime,
          timezone,
          category,
          ageRestriction,
          status: requestedStatus,
          ticketTiers,
        } = req.body;

        if (!name?.trim() || !dateText?.trim()) {
          return res.status(400).json({ error: 'Event name and event date are required.' });
        }

        const [settings] = await db.select().from(platformSettings).limit(1);
        let finalStatus = 'DRAFT';
        if (requestedStatus && requestedStatus !== 'DRAFT') {
          if (biz.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Your business must be ACTIVE before publishing events. Save as DRAFT while awaiting approval.' });
          }
          finalStatus = settings?.eventApprovalRequired === 1 ? 'PENDING_APPROVAL' : 'PUBLISHED';
        }

        const [created] = await db
          .insert(events)
          .values({
            businessId: bizId,
            venueId: venueId ? Number(venueId) : null,
            slug: slugify(name.trim(), Math.floor(1000 + Math.random() * 9000)),
            name: name.trim(),
            description: description || '',
            coverImage: coverImage || null,
            bannerImages: bannerImages ? JSON.stringify(bannerImages) : null,
            logo: logo || biz.logo || null,
            address: address || null,
            city: city || null,
            province: province || null,
            country: country || 'South Africa',
            isOnline: isOnline ? 1 : 0,
            onlineUrl: onlineUrl || null,
            mapLat: mapLat || null,
            mapLng: mapLng || null,
            contactEmail: contactEmail || biz.email,
            contactPhone: contactPhone || biz.phone || null,
            refundPolicy: refundPolicy || 'Tickets are refundable up to 7 days before the event start date.',
            termsAndConditions: termsAndConditions || 'Standard event entry terms apply. One scan per ticket.',
            dateText: dateText.trim(),
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            startTime: startTime || '18:00',
            endTime: endTime || '23:00',
            timezone: timezone || 'SAST',
            category: category || 'Music & Festivals',
            ageRestriction: ageRestriction || 'All Ages',
            status: finalStatus,
          })
          .returning();

        if (Array.isArray(ticketTiers)) {
          for (const tier of ticketTiers) {
            if (!tier.name?.trim()) continue;
            const isFree = Boolean(tier.isFree || Number(tier.price) === 0);
            const priceRand = isFree ? 0 : Math.max(0, Number(tier.price || 0));
            const priceCents = isFree ? 0 : Math.round(priceRand * 100);
            const qty = Math.max(1, Number(tier.quantity || 50));
            await db.insert(ticketTypes).values({
              eventId: created.id,
              name: tier.name.trim(),
              description: tier.description || '',
              price: Math.round(priceRand),
              priceCents,
              isFree: isFree ? 1 : 0,
              quantity: qty,
              remaining: qty,
              minPurchase: Math.max(1, Number(tier.minPurchase || 1)),
              maxPurchase: Math.max(1, Number(tier.maxPurchase || 8)),
              perCustomerLimit: Math.max(1, Number(tier.perCustomerLimit || 8)),
              saleStart: tier.saleStart ? new Date(tier.saleStart) : null,
              saleEnd: tier.saleEnd ? new Date(tier.saleEnd) : null,
              status: 'ACTIVE',
            });
          }
        }

        await db.insert(auditLogs).values({
          userId: req.authUser!.id,
          businessId: bizId,
          action: `Event Created (${finalStatus})`,
          resourceType: 'event',
          resourceId: created.id,
          newValue: JSON.stringify({ name: created.name, status: finalStatus }),
        });

        if (finalStatus === 'PUBLISHED') {
          await createNotification({
            userId: req.authUser!.id,
            email: biz.email,
            type: 'EVENT_PUBLISHED',
            title: `Event Published: ${created.name}`,
            message: `${created.name} is now live in the marketplace!`,
            channel: 'EMAIL',
            sendEmailToo: true,
            metadata: { eventId: created.id },
          });
        }

        res.json({ success: true, event: created });
      } catch (err) {
        console.error('Create event failed:', err);
        res.status(500).json({ error: 'Failed to create event.' });
      }
    }
  );

  app.patch('/api/events/:eventId', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const [evt] = await db.select().from(events).where(eq(events.id, eventId));
      if (!evt) return res.status(404).json({ error: 'Event not found.' });

      const [membership] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.businessId, evt.businessId), eq(businessTeam.userId, req.authUser!.id)));
      if (!membership || !['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER'].includes(membership.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const [biz] = await db.select().from(businesses).where(eq(businesses.id, evt.businessId));
      const { status, name, description, dateText, startTime, endTime, address, city, coverImage, refundPolicy, termsAndConditions, category, ageRestriction } = req.body;

      if (status && ['PUBLISHED', 'ON_SALE'].includes(status) && biz?.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Business must be ACTIVE before publishing.' });
      }

      const [updated] = await db
        .update(events)
        .set({
          name: name ?? evt.name,
          description: description ?? evt.description,
          dateText: dateText ?? evt.dateText,
          startTime: startTime ?? evt.startTime,
          endTime: endTime ?? evt.endTime,
          address: address ?? evt.address,
          city: city ?? evt.city,
          coverImage: coverImage ?? evt.coverImage,
          refundPolicy: refundPolicy ?? evt.refundPolicy,
          termsAndConditions: termsAndConditions ?? evt.termsAndConditions,
          category: category ?? evt.category,
          ageRestriction: ageRestriction ?? evt.ageRestriction,
          status: status ?? evt.status,
        })
        .where(eq(events.id, eventId))
        .returning();

      // If organiser cancels event, notify affected ticket buyers
      if (status === 'CANCELLED' && evt.status !== 'CANCELLED') {
        const affectedOrders = await db
          .select()
          .from(orders)
          .where(and(eq(orders.eventId, eventId), eq(orders.status, 'PAID')));
        for (const ord of affectedOrders) {
          await createNotification({
            userId: ord.userId,
            email: ord.buyerEmail,
            type: 'EVENT_CANCELLED',
            title: `Event Cancelled: ${evt.name}`,
            message: `We regret to inform you that ${evt.name} has been cancelled. You can request a full refund from My Orders for order ${ord.orderNumber}.`,
            channel: 'EMAIL',
            sendEmailToo: true,
            metadata: { eventId: evt.id, orderNumber: ord.orderNumber },
          });
        }
      }

      await db.insert(auditLogs).values({
        userId: req.authUser!.id,
        businessId: evt.businessId,
        action: `Event Updated (${updated.status})`,
        resourceType: 'event',
        resourceId: evt.id,
        previousValue: JSON.stringify({ status: evt.status }),
        newValue: JSON.stringify({ status: updated.status }),
      });

      res.json({ success: true, event: updated });
    } catch (err) {
      console.error('Update event failed:', err);
      res.status(500).json({ error: 'Failed to update event.' });
    }
  });

  // Ticket Types CRUD
  app.post('/api/ticket-types', requireAuth, async (req, res) => {
    try {
      const { eventId, name, description, price, isFree, quantity, minPurchase, maxPurchase, perCustomerLimit, saleStart, saleEnd, isReserved } = req.body;
      const [evt] = await db.select().from(events).where(eq(events.id, Number(eventId)));
      if (!evt) return res.status(404).json({ error: 'Event not found.' });

      const [membership] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.businessId, evt.businessId), eq(businessTeam.userId, req.authUser!.id)));
      if (!membership || !['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER'].includes(membership.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const freeFlag = Boolean(isFree || Number(price) === 0);
      const priceVal = freeFlag ? 0 : Math.max(0, Number(price || 0));
      const qty = Math.max(1, Number(quantity || 50));

      const [created] = await db
        .insert(ticketTypes)
        .values({
          eventId: evt.id,
          name: name.trim(),
          description: description || '',
          price: Math.round(priceVal),
          priceCents: Math.round(priceVal * 100),
          isFree: freeFlag ? 1 : 0,
          quantity: qty,
          remaining: qty,
          minPurchase: Math.max(1, Number(minPurchase || 1)),
          maxPurchase: Math.max(1, Number(maxPurchase || 8)),
          perCustomerLimit: Math.max(1, Number(perCustomerLimit || 8)),
          saleStart: saleStart ? new Date(saleStart) : null,
          saleEnd: saleEnd ? new Date(saleEnd) : null,
          isReserved: isReserved ? 1 : 0,
          status: 'ACTIVE',
        })
        .returning();

      res.json({ success: true, ticketType: created });
    } catch (err) {
      console.error('Create ticket type failed:', err);
      res.status(500).json({ error: 'Failed to create ticket tier.' });
    }
  });

  app.patch('/api/ticket-types/:id', requireAuth, async (req, res) => {
    try {
      const ttId = Number(req.params.id);
      const [existing] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ttId));
      if (!existing) return res.status(404).json({ error: 'Ticket type not found.' });

      const [evt] = await db.select().from(events).where(eq(events.id, existing.eventId));
      if (!evt) return res.status(404).json({ error: 'Parent event not found.' });

      const [membership] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.businessId, evt.businessId), eq(businessTeam.userId, req.authUser!.id)));
      if (!membership || !['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER'].includes(membership.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { name, description, price, isFree, quantity, status, minPurchase, maxPurchase } = req.body;
      const freeFlag = isFree !== undefined ? Boolean(isFree) : Boolean(existing.isFree);
      const newPrice = price !== undefined ? (freeFlag ? 0 : Math.max(0, Number(price))) : existing.price;
      const soldAlready = Math.max(0, existing.quantity - existing.remaining);
      const newQty = quantity !== undefined ? Math.max(soldAlready, Number(quantity)) : existing.quantity;
      const newRemaining = Math.max(0, newQty - soldAlready);

      const [updated] = await db
        .update(ticketTypes)
        .set({
          name: name ?? existing.name,
          description: description ?? existing.description,
          price: Math.round(newPrice),
          priceCents: Math.round(newPrice * 100),
          isFree: freeFlag ? 1 : 0,
          quantity: newQty,
          remaining: newRemaining,
          status: status ?? existing.status,
          minPurchase: minPurchase !== undefined ? Number(minPurchase) : existing.minPurchase,
          maxPurchase: maxPurchase !== undefined ? Number(maxPurchase) : existing.maxPurchase,
        })
        .where(eq(ticketTypes.id, ttId))
        .returning();

      res.json({ success: true, ticketType: updated });
    } catch (err) {
      console.error('Update ticket type failed:', err);
      res.status(500).json({ error: 'Failed to update ticket tier.' });
    }
  });

  // Business Dashboard Analytics (Denied to CHECK_IN_STAFF financial data; returned safely)
  app.get(
    '/api/businesses/my/dashboard',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizId));
        const myEvents = await db.select().from(events).where(eq(events.businessId, bizId));
        const eventIds = myEvents.map((e) => e.id);

        let ticketsSold = 0;
        let checkedIn = 0;
        if (eventIds.length > 0) {
          const soldRes = await db
            .select({ count: sql<number>`count(*)` })
            .from(tickets)
            .where(and(inArray(tickets.eventId, eventIds), sql`${tickets.status} IN ('VALID','CHECKED_IN')`));
          const ciRes = await db
            .select({ count: sql<number>`count(*)` })
            .from(tickets)
            .where(and(inArray(tickets.eventId, eventIds), eq(tickets.status, 'CHECKED_IN')));
          ticketsSold = Number(soldRes[0]?.count || 0);
          checkedIn = Number(ciRes[0]?.count || 0);
        }

        const recentOrders = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            buyerName: orders.buyerName,
            buyerEmail: orders.buyerEmail,
            total: orders.total,
            totalCents: orders.totalCents,
            businessEarningsCents: orders.businessEarningsCents,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            createdAt: orders.createdAt,
            eventName: events.name,
          })
          .from(orders)
          .innerJoin(events, eq(orders.eventId, events.id))
          .where(eq(orders.businessId, bizId))
          .orderBy(desc(orders.createdAt))
          .limit(15);

        res.json({
          business: biz,
          totalEvents: myEvents.length,
          publishedEvents: myEvents.filter((e) => ['PUBLISHED', 'ON_SALE'].includes(e.status)).length,
          ticketsSold,
          checkedIn,
          recentOrders,
        });
      } catch (err) {
        console.error('Get business dashboard failed:', err);
        res.status(500).json({ error: 'Server error' });
      }
    }
  );

  // Business Orders (searchable, filterable, paginated)
  app.get(
    '/api/businesses/my/orders',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const search = ((req.query.q as string) || '').trim().toLowerCase();
        const statusFilter = ((req.query.status as string) || '').trim();
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));

        const allOrders = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            buyerName: orders.buyerName,
            buyerEmail: orders.buyerEmail,
            buyerPhone: orders.buyerPhone,
            total: orders.total,
            totalCents: orders.totalCents,
            subtotalCents: orders.subtotalCents,
            platformFeeCutCents: orders.platformFeeCutCents,
            businessEarningsCents: orders.businessEarningsCents,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            paymentProvider: orders.paymentProvider,
            createdAt: orders.createdAt,
            eventId: orders.eventId,
            eventName: events.name,
          })
          .from(orders)
          .innerJoin(events, eq(orders.eventId, events.id))
          .where(eq(orders.businessId, bizId))
          .orderBy(desc(orders.createdAt));

        const filtered = allOrders.filter((o) => {
          if (statusFilter && o.status !== statusFilter) return false;
          if (search) {
            return (
              o.orderNumber.toLowerCase().includes(search) ||
              o.buyerName.toLowerCase().includes(search) ||
              o.buyerEmail.toLowerCase().includes(search) ||
              o.eventName.toLowerCase().includes(search)
            );
          }
          return true;
        });

        const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
        if (req.query.paginated === '1') {
          return res.json({ items: paged, total: filtered.length, page, pageSize });
        }
        res.json(filtered);
      } catch (err) {
        console.error('Get business orders failed:', err);
        res.status(500).json({ error: 'Server error' });
      }
    }
  );

  // CSV Export Orders
  app.get(
    '/api/businesses/my/orders/export',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const allOrders = await db
          .select({
            orderNumber: orders.orderNumber,
            buyerName: orders.buyerName,
            buyerEmail: orders.buyerEmail,
            totalCents: orders.totalCents,
            subtotalCents: orders.subtotalCents,
            platformFeeCutCents: orders.platformFeeCutCents,
            businessEarningsCents: orders.businessEarningsCents,
            status: orders.status,
            createdAt: orders.createdAt,
            eventName: events.name,
          })
          .from(orders)
          .innerJoin(events, eq(orders.eventId, events.id))
          .where(eq(orders.businessId, bizId))
          .orderBy(desc(orders.createdAt));

        const lines = ['OrderNumber,Event,BuyerName,BuyerEmail,GrossZAR,CommissionZAR,NetEarningsZAR,Status,Date'];
        for (const o of allOrders) {
          const row = [
            o.orderNumber,
            `"${(o.eventName || '').replace(/"/g, '""')}"`,
            `"${(o.buyerName || '').replace(/"/g, '""')}"`,
            o.buyerEmail,
            ((o.subtotalCents || 0) / 100).toFixed(2),
            ((o.platformFeeCutCents || 0) / 100).toFixed(2),
            ((o.businessEarningsCents || 0) / 100).toFixed(2),
            o.status,
            o.createdAt ? new Date(o.createdAt).toISOString() : '',
          ];
          lines.push(row.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="orders-business-${bizId}.csv"`);
        res.send(lines.join('\n'));
      } catch (err) {
        res.status(500).json({ error: 'Failed to export orders CSV.' });
      }
    }
  );

  // Attendees & CSV export
  app.get(
    '/api/businesses/my/attendees',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER', 'CHECK_IN_STAFF']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const eventIdFilter = req.query.eventId ? Number(req.query.eventId) : null;
        const bizEvents = await db.select().from(events).where(eq(events.businessId, bizId));
        const eventIds = eventIdFilter ? bizEvents.filter((e) => e.id === eventIdFilter).map((e) => e.id) : bizEvents.map((e) => e.id);
        if (eventIds.length === 0) return res.json([]);

        const list = await db
          .select()
          .from(tickets)
          .where(inArray(tickets.eventId, eventIds))
          .orderBy(desc(tickets.createdAt));

        res.json(list);
      } catch (err) {
        res.status(500).json({ error: 'Failed to load attendees.' });
      }
    }
  );

  app.get(
    '/api/businesses/my/attendees/export',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const bizEvents = await db.select().from(events).where(eq(events.businessId, bizId));
        const eventIds = bizEvents.map((e) => e.id);
        const list = eventIds.length
          ? await db.select().from(tickets).where(inArray(tickets.eventId, eventIds)).orderBy(desc(tickets.createdAt))
          : [];

        const lines = ['TicketNumber,Event,Tier,AttendeeName,AttendeeEmail,Status,CheckedInAt'];
        for (const t of list) {
          lines.push(
            [
              t.ticketNumber,
              `"${(t.eventName || '').replace(/"/g, '""')}"`,
              `"${(t.type || '').replace(/"/g, '""')}"`,
              `"${(t.attendeeName || '').replace(/"/g, '""')}"`,
              t.attendeeEmail,
              t.status,
              t.checkedInAt ? new Date(t.checkedInAt).toISOString() : '',
            ].join(',')
          );
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendees-business-${bizId}.csv"`);
        res.send(lines.join('\n'));
      } catch {
        res.status(500).json({ error: 'Failed to export attendees.' });
      }
    }
  );

  // Business Financials, Ledger & Payouts
  app.get(
    '/api/businesses/my/financials',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const [biz] = await db.select().from(businesses).where(eq(businesses.id, bizId));
        const ledger = await db
          .select()
          .from(financialLedger)
          .where(eq(financialLedger.businessId, bizId))
          .orderBy(desc(financialLedger.createdAt))
          .limit(100);
        const bizPayouts = await db
          .select()
          .from(payouts)
          .where(eq(payouts.businessId, bizId))
          .orderBy(desc(payouts.createdAt));
        const bizRefunds = await db
          .select()
          .from(refunds)
          .where(eq(refunds.businessId, bizId))
          .orderBy(desc(refunds.createdAt));

        res.json({ business: biz, ledger, payouts: bizPayouts, refunds: bizRefunds });
      } catch (err) {
        res.status(500).json({ error: 'Failed to load financials.' });
      }
    }
  );

  // Business refund approval/rejection
  app.post(
    '/api/businesses/my/refunds/:refundId/review',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'FINANCE']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const refundId = Number(req.params.refundId);
        const { decision, notes } = req.body; // 'APPROVE' | 'REJECT'

        const [rf] = await db.select().from(refunds).where(and(eq(refunds.id, refundId), eq(refunds.businessId, bizId)));
        if (!rf) return res.status(404).json({ error: 'Refund request not found.' });
        if (rf.status !== 'REQUESTED') {
          return res.status(400).json({ error: `Refund request is already ${rf.status}.` });
        }

        if (decision === 'REJECT') {
          const [rejected] = await db
            .update(refunds)
            .set({
              status: 'REJECTED',
              reviewedByUserId: req.authUser!.id,
              reviewNotes: notes || 'Declined by event organiser.',
              processedAt: new Date(),
            })
            .where(eq(refunds.id, refundId))
            .returning();

          await createNotification({
            userId: rf.requestedByUserId,
            email: rf.requesterEmail,
            type: 'REFUND_REJECTED',
            title: 'Refund Request Declined',
            message: `Your refund request was declined by the organiser. Note: ${rejected.reviewNotes}`,
            channel: 'EMAIL',
            sendEmailToo: true,
          });
          return res.json({ success: true, refund: rejected });
        }

        const result = await processOrderRefund({
          orderId: rf.orderId,
          actorUserId: req.authUser!.id,
          reason: rf.reason,
          ticketIds: rf.ticketId ? [rf.ticketId] : undefined,
          existingRefundId: rf.id,
          reviewNotes: notes || 'Approved and refunded by organiser.',
        });
        res.json({ success: true, ...result });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({ error: err?.message || 'Refund review failed.' });
      }
    }
  );

  // Promo Codes CRUD
  app.get(
    '/api/businesses/my/promos',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      const bizId = (req as any).businessId;
      const list = await db.select().from(promoCodes).where(eq(promoCodes.businessId, bizId)).orderBy(desc(promoCodes.createdAt));
      res.json(list);
    }
  );

  app.post(
    '/api/businesses/my/promos',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const { code, discountPercent, discountAmountRand, eventId, maxUses, expiresAt } = req.body;
        if (!code?.trim()) return res.status(400).json({ error: 'Promo code text is required.' });

        const [created] = await db
          .insert(promoCodes)
          .values({
            businessId: bizId,
            eventId: eventId ? Number(eventId) : null,
            code: code.trim().toUpperCase(),
            discountPercent: Math.min(100, Math.max(0, Number(discountPercent || 0))),
            discountCents: Math.max(0, Math.round(Number(discountAmountRand || 0) * 100)),
            maxUses: maxUses ? Number(maxUses) : null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            active: 1,
          })
          .returning();

        res.json({ success: true, promo: created });
      } catch (err) {
        res.status(400).json({ error: 'Promo code could not be created (code might already exist).' });
      }
    }
  );

  app.delete(
    '/api/businesses/my/promos/:id',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      const bizId = (req as any).businessId;
      await db.update(promoCodes).set({ active: 0 }).where(and(eq(promoCodes.id, Number(req.params.id)), eq(promoCodes.businessId, bizId)));
      res.json({ success: true });
    }
  );

  // Team & Staff Invitations (Strictly protected!)
  app.get(
    '/api/businesses/my/team',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const teamList = await db
          .select({
            id: businessTeam.id,
            role: businessTeam.role,
            createdAt: businessTeam.createdAt,
            user: {
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
            },
          })
          .from(businessTeam)
          .innerJoin(users, eq(businessTeam.userId, users.id))
          .where(eq(businessTeam.businessId, bizId));

        const invites = await db
          .select()
          .from(staffInvitations)
          .where(eq(staffInvitations.businessId, bizId))
          .orderBy(desc(staffInvitations.createdAt));

        res.json({ members: teamList, invitations: invites });
      } catch (err) {
        res.status(500).json({ error: 'Failed to load business team.' });
      }
    }
  );

  app.post(
    '/api/businesses/my/team',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN']),
    async (req, res) => {
      try {
        const bizId = (req as any).businessId;
        const { email, role } = req.body;
        if (!email?.trim()) return res.status(400).json({ error: 'Staff email is required.' });
        const cleanEmail = email.trim().toLowerCase();
        const assignedRole = role || 'CHECK_IN_STAFF';

        const [targetUser] = await db.select().from(users).where(eq(users.email, cleanEmail));
        if (targetUser) {
          const [existing] = await db
            .select()
            .from(businessTeam)
            .where(and(eq(businessTeam.businessId, bizId), eq(businessTeam.userId, targetUser.id)));
          if (existing) {
            const [updated] = await db
              .update(businessTeam)
              .set({ role: assignedRole })
              .where(eq(businessTeam.id, existing.id))
              .returning();
            return res.json({ success: true, member: updated, mode: 'updated' });
          }

          const [newMember] = await db
            .insert(businessTeam)
            .values({ businessId: bizId, userId: targetUser.id, role: assignedRole })
            .returning();

          await createNotification({
            userId: targetUser.id,
            email: targetUser.email,
            type: 'STAFF_ADDED',
            title: 'Added to Business Team',
            message: `You have been assigned the ${assignedRole} role on a business workspace.`,
            channel: 'EMAIL',
            sendEmailToo: true,
          });
          return res.json({ success: true, member: newMember, mode: 'added' });
        }

        // Create pending invitation if user has not signed up yet
        const inviteToken = crypto.randomBytes(20).toString('hex');
        const [inv] = await db
          .insert(staffInvitations)
          .values({
            businessId: bizId,
            email: cleanEmail,
            role: assignedRole,
            token: inviteToken,
            status: 'PENDING',
            invitedByUserId: req.authUser!.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
          .returning();

        await createNotification({
          email: cleanEmail,
          type: 'STAFF_INVITATION',
          title: 'Team Invitation',
          message: `You have been invited as ${assignedRole}. Register with ${cleanEmail} and accept your invite token: ${inviteToken}.`,
          channel: 'EMAIL',
          sendEmailToo: true,
          metadata: { businessId: bizId, token: inviteToken },
        });

        res.json({ success: true, invitation: inv, mode: 'invited' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to invite staff member.' });
      }
    }
  );

  app.post('/api/staff-invitations/accept', requireAuth, async (req, res) => {
    try {
      const { token } = req.body;
      const user = req.authUser!;
      const [inv] = await db.select().from(staffInvitations).where(eq(staffInvitations.token, token));
      if (!inv || inv.status !== 'PENDING') {
        return res.status(400).json({ error: 'Invitation not found or no longer active.' });
      }
      if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
        return res.status(403).json({ error: 'This invitation belongs to a different email address.' });
      }

      const [existing] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.businessId, inv.businessId), eq(businessTeam.userId, user.id)));

      if (!existing) {
        await db.insert(businessTeam).values({
          businessId: inv.businessId,
          userId: user.id,
          role: inv.role,
        });
      }

      await db.update(staffInvitations).set({ status: 'ACCEPTED' }).where(eq(staffInvitations.id, inv.id));
      res.json({ success: true, businessId: inv.businessId, role: inv.role });
    } catch (err) {
      res.status(500).json({ error: 'Failed to accept invitation.' });
    }
  });

  app.delete(
    '/api/businesses/my/team/:memberId',
    requireAuth,
    requireBusinessMember(['BUSINESS_OWNER', 'BUSINESS_ADMIN']),
    async (req, res) => {
      const bizId = (req as any).businessId;
      const memberId = Number(req.params.memberId);
      const [target] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.id, memberId), eq(businessTeam.businessId, bizId)));
      if (!target) return res.status(404).json({ error: 'Team member not found.' });
      if (target.role === 'BUSINESS_OWNER') {
        return res.status(400).json({ error: 'Cannot remove the primary Business Owner.' });
      }
      await db.delete(businessTeam).where(eq(businessTeam.id, memberId));
      res.json({ success: true });
    }
  );

  // ==========================================
  // ATOMIC QR SCANNER ENDPOINTS (Restricted to assigned business staff)
  // ==========================================
  app.get('/api/scanner/logs', requireAuth, async (req, res) => {
    try {
      const bizId = Number(req.query.businessId || 0);
      const eventId = Number(req.query.eventId || 0);

      if (bizId > 0) {
        const [membership] = await db
          .select()
          .from(businessTeam)
          .where(and(eq(businessTeam.businessId, bizId), eq(businessTeam.userId, req.authUser!.id)));
        if (!membership) return res.status(403).json({ error: 'Forbidden' });
        const logs = await db
          .select()
          .from(checkInRecords)
          .where(
            eventId > 0
              ? and(eq(checkInRecords.businessId, bizId), eq(checkInRecords.eventId, eventId))
              : eq(checkInRecords.businessId, bizId)
          )
          .orderBy(desc(checkInRecords.time))
          .limit(100);
        return res.json(logs);
      }

      // Return logs across user's businesses
      const myBiz = await db.select().from(businessTeam).where(eq(businessTeam.userId, req.authUser!.id));
      const bizIds = myBiz.map((m) => m.businessId);
      if (bizIds.length === 0) return res.json([]);
      const logs = await db
        .select()
        .from(checkInRecords)
        .where(inArray(checkInRecords.businessId, bizIds))
        .orderBy(desc(checkInRecords.time))
        .limit(100);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load scanner logs.' });
    }
  });

  app.post('/api/scanner/scan', requireAuth, async (req, res) => {
    try {
      const { token: rawToken, ticketNumber, eventId, entrance, scannerName } = req.body;
      const user = req.authUser!;
      const selectedEventId = Number(eventId);
      if (!Number.isInteger(selectedEventId) || selectedEventId <= 0) {
        return res.status(400).json({ error: 'Please select an active event to scan tickets for.' });
      }

      const [evt] = await db.select().from(events).where(eq(events.id, selectedEventId));
      if (!evt) return res.status(404).json({ error: 'Selected event not found.' });

      const [membership] = await db
        .select()
        .from(businessTeam)
        .where(and(eq(businessTeam.businessId, evt.businessId), eq(businessTeam.userId, user.id)));
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden: You are not authorized to scan tickets for this business/event.' });
      }

      // Extract raw token even if full verification URL was scanned
      let cleanedToken = (rawToken || '').trim();
      if (cleanedToken.includes('/ticket/verify/')) {
        cleanedToken = decodeURIComponent(cleanedToken.split('/ticket/verify/').pop() || '');
      }

      const ticketMatch = cleanedToken
        ? await db.select().from(tickets).where(eq(tickets.token, cleanedToken))
        : ticketNumber?.trim()
          ? await db.select().from(tickets).where(eq(tickets.ticketNumber, ticketNumber.trim().toUpperCase()))
          : [];

      const found = ticketMatch[0];
      const staffLabel = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

      if (!found) {
        const [record] = await db
          .insert(checkInRecords)
          .values({
            attendeeName: 'Ticket not found',
            ticketNumber: cleanedToken || ticketNumber || 'UNKNOWN',
            ticketType: '—',
            entrance: entrance || 'Main Gate',
            staffName: staffLabel,
            scannerName: scannerName || 'Web Scanner',
            status: 'INVALID',
            businessId: evt.businessId,
            eventId: evt.id,
            scannerUserId: user.id,
          })
          .returning();

        return res.json({ status: 'INVALID', message: 'No ticket matches this QR token.', ticket: null, record });
      }

      if (found.eventId !== evt.id) {
        const [record] = await db
          .insert(checkInRecords)
          .values({
            attendeeName: found.attendeeName,
            ticketNumber: found.ticketNumber,
            ticketType: found.type,
            entrance: entrance || 'Main Gate',
            staffName: staffLabel,
            scannerName: scannerName || 'Web Scanner',
            status: 'WRONG_EVENT',
            businessId: evt.businessId,
            eventId: evt.id,
            ticketId: found.id,
            scannerUserId: user.id,
          })
          .returning();
        return res.json({
          status: 'WRONG_EVENT',
          message: `Ticket belongs to "${found.eventName}", not "${evt.name}".`,
          ticket: found,
          record,
        });
      }

      // ATOMIC single-entry check-in: prevents concurrent duplicate admission!
      const [checkedInTicket] = await db
        .update(tickets)
        .set({
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: staffLabel,
        })
        .where(and(eq(tickets.id, found.id), eq(tickets.eventId, evt.id), eq(tickets.status, 'VALID')))
        .returning();

      const scanResultStatus = checkedInTicket ? 'VALID' : found.status;
      const [record] = await db
        .insert(checkInRecords)
        .values({
          attendeeName: found.attendeeName,
          ticketNumber: found.ticketNumber,
          ticketType: found.type,
          entrance: entrance || 'Main Gate',
          staffName: staffLabel,
          scannerName: scannerName || 'Web Scanner',
          status: scanResultStatus,
          businessId: evt.businessId,
          eventId: evt.id,
          ticketId: found.id,
          scannerUserId: user.id,
        })
        .returning();

      res.json({
        status: scanResultStatus,
        message: checkedInTicket
          ? `Admitted: ${found.attendeeName} (${found.type})`
          : found.status === 'CHECKED_IN'
            ? `Already checked in at ${found.checkedInAt ? new Date(found.checkedInAt).toLocaleTimeString() : 'earlier'}`
            : `Cannot admit: ticket is ${found.status}`,
        ticket: checkedInTicket || found,
        record,
      });
    } catch (err) {
      console.error('Scanner scan failed:', err);
      res.status(500).json({ error: 'Scanner verification error.' });
    }
  });
}
