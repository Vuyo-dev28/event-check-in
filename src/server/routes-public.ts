import crypto from 'crypto';
import type { Express } from 'express';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  businessTeam,
  cashlessTransactions,
  checkInRecords,
  customerFavourites,
  eventCategories,
  events,
  notifications,
  orderItems,
  orders,
  payments,
  platformTeam,
  promoCodes,
  refunds,
  tickets,
  ticketTypes,
  users,
  venues,
} from '../db/schema.ts';
import {
  clearAuthCookie,
  hashPassword,
  optionalAuth,
  requireAuth,
  setAuthCookie,
  signSessionToken,
  verifyPassword,
} from './auth.ts';
import { getCartState, mergeGuestCartIntoUser, saveCartState } from './cart.ts';
import { createNotification, retryEmailNotification } from './notifications.ts';
import {
  cancelPendingOrder,
  completeOrderPayment,
  expireStaleReservations,
  getAvailableGateways,
  initiateCheckoutOrder,
  recordWebhookAndProcess,
  signSandboxWebhook,
  verifyGatewayWithProvider,
  type GatewayProvider,
} from './payments.ts';
import { resolveCommissionRule } from './commissions.ts';

async function buildMePayload(userId: number) {
  const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!dbUser) return null;

  const [pTeam] = await db.select().from(platformTeam).where(eq(platformTeam.userId, dbUser.id));
  const bMemberships = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      status: businesses.status,
      role: businessTeam.role,
    })
    .from(businessTeam)
    .innerJoin(businesses, eq(businessTeam.businessId, businesses.id))
    .where(eq(businessTeam.userId, dbUser.id));

  const { passwordHash: _pw, resetToken: _rt, verificationToken: _vt, ...safeUser } = dbUser;
  return {
    user: safeUser,
    platformRole: pTeam?.role || null,
    businesses: bMemberships,
  };
}

async function claimVerifiedEmailOrders(userId: number, email: string) {
  const cleanEmail = email.trim().toLowerCase();
  const unclaimedOrders = await db
    .select()
    .from(orders)
    .where(and(isNull(orders.userId), sql`LOWER(${orders.buyerEmail}) = ${cleanEmail}`));

  if (unclaimedOrders.length === 0) return 0;

  const orderIds = unclaimedOrders.map((o) => o.id);
  await db
    .update(orders)
    .set({ userId, claimedAt: new Date(), updatedAt: new Date() })
    .where(inArray(orders.id, orderIds));

  await db
    .update(tickets)
    .set({ userId })
    .where(and(isNull(tickets.userId), sql`(LOWER(${tickets.buyerEmail}) = ${cleanEmail} OR LOWER(${tickets.attendeeEmail}) = ${cleanEmail})`));

  await db.insert(auditLogs).values({
    userId,
    action: `Claimed ${unclaimedOrders.length} Guest Order(s)`,
    resourceType: 'user',
    resourceId: userId,
    newValue: JSON.stringify({ orderIds }),
  });

  return unclaimedOrders.length;
}

export function registerPublicRoutes(app: Express) {
  // ==========================================
  // AUTHENTICATION ENDPOINTS
  // ==========================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, firstName, lastName, phone } = req.body;
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !password || password.length < 6) {
        return res.status(400).json({ error: 'Valid email and password (min 6 characters) are required.' });
      }
      if (!firstName?.trim()) {
        return res.status(400).json({ error: 'First name is required.' });
      }

      const [existing] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`);
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      }

      const uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
      const verificationToken = crypto.randomBytes(16).toString('hex');

      // Security rule: new registrations ALWAYS default to 'attendee' role
      const [created] = await db
        .insert(users)
        .values({
          uid,
          email: cleanEmail,
          role: 'attendee',
          firstName: firstName.trim(),
          lastName: (lastName || '').trim(),
          phone: phone?.trim() || null,
          passwordHash: hashPassword(password),
          emailVerified: 0,
          verificationToken,
        })
        .returning();

      if (req.cartSessionId) {
        await mergeGuestCartIntoUser(req.cartSessionId, created.id);
      }

      await createNotification({
        userId: created.id,
        email: cleanEmail,
        type: 'EMAIL_VERIFICATION',
        title: 'Verify Your Email Address',
        message: `Welcome ${created.firstName}! Verify your email with token: ${verificationToken}`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { verificationToken },
      });

      const token = signSessionToken(created.uid, created.email);
      setAuthCookie(res, token);

      const me = await buildMePayload(created.id);
      res.json({ success: true, token, verificationTokenSent: true, ...me });
    } catch (err) {
      console.error('Register failed:', err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const [dbUser] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`);
      if (!dbUser || !dbUser.passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (!verifyPassword(password, dbUser.passwordHash)) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (req.cartSessionId) {
        await mergeGuestCartIntoUser(req.cartSessionId, dbUser.id);
      }

      const token = signSessionToken(dbUser.uid, dbUser.email);
      setAuthCookie(res, token);

      const me = await buildMePayload(dbUser.id);
      res.json({ success: true, token, ...me });
    } catch (err) {
      console.error('Login failed:', err);
      res.status(500).json({ error: 'Sign in failed.' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
  });

  app.post('/api/auth/verify-email', requireAuth, async (req, res) => {
    try {
      const { token: verToken } = req.body;
      const [dbUser] = await db.select().from(users).where(eq(users.id, req.authUser!.id));
      if (!dbUser) return res.status(404).json({ error: 'User not found.' });

      if (dbUser.verificationToken && verToken && verToken.trim() !== dbUser.verificationToken) {
        return res.status(400).json({ error: 'Invalid email verification token.' });
      }

      await db
        .update(users)
        .set({ emailVerified: 1, verificationToken: null, updatedAt: new Date() })
        .where(eq(users.id, dbUser.id));

      const claimedCount = await claimVerifiedEmailOrders(dbUser.id, dbUser.email);
      const me = await buildMePayload(dbUser.id);
      res.json({ success: true, claimedOrdersCount: claimedCount, ...me });
    } catch (err) {
      res.status(500).json({ error: 'Email verification failed.' });
    }
  });

  app.post('/api/auth/request-verification', requireAuth, async (req, res) => {
    try {
      const [dbUser] = await db.select().from(users).where(eq(users.id, req.authUser!.id));
      if (!dbUser) return res.status(404).json({ error: 'User not found.' });

      const newToken = crypto.randomBytes(4).toString('hex').toUpperCase();
      await db.update(users).set({ verificationToken: newToken }).where(eq(users.id, dbUser.id));

      await createNotification({
        userId: dbUser.id,
        email: dbUser.email,
        type: 'EMAIL_VERIFICATION',
        title: 'Your Verification Code',
        message: `Use verification code ${newToken} to verify ${dbUser.email} and claim guest ticket purchases.`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { code: newToken },
      });

      res.json({
        success: true,
        message: `Verification code sent to ${dbUser.email}. Check your inbox or Notifications log.`,
      });
    } catch (err) {
      res.status(500).json({ error: 'Could not send verification code.' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const cleanEmail = (req.body.email || '').trim().toLowerCase();
      const [dbUser] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`);
      if (dbUser) {
        const resetToken = crypto.randomBytes(16).toString('hex');
        await db
          .update(users)
          .set({
            resetToken,
            resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
          })
          .where(eq(users.id, dbUser.id));

        await createNotification({
          userId: dbUser.id,
          email: dbUser.email,
          type: 'PASSWORD_RESET',
          title: 'Password Reset Request',
          message: `Use this password reset token within 60 minutes: ${resetToken}`,
          channel: 'EMAIL',
          sendEmailToo: true,
        });
      }
      res.json({ success: true, message: 'If an account exists for that email, reset instructions have been issued.' });
    } catch {
      res.status(500).json({ error: 'Failed to initiate password reset.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Valid reset token and new password (min 6 chars) required.' });
      }
      const [dbUser] = await db.select().from(users).where(eq(users.resetToken, token.trim()));
      if (!dbUser || !dbUser.resetTokenExpires || new Date(dbUser.resetTokenExpires) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired password reset token.' });
      }
      await db
        .update(users)
        .set({
          passwordHash: hashPassword(newPassword),
          resetToken: null,
          resetTokenExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, dbUser.id));
      res.json({ success: true, message: 'Password updated. You may now sign in.' });
    } catch {
      res.status(500).json({ error: 'Password reset failed.' });
    }
  });

  // Current user workspace context
  app.get('/api/users/me', requireAuth, async (req, res) => {
    try {
      const me = await buildMePayload(req.authUser!.id);
      if (!me) return res.status(404).json({ error: 'User not found' });
      res.json(me);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load account context.' });
    }
  });

  // Sync Firebase Google user safely (NEVER allows escalating to organizer/superadmin via request body!)
  app.post('/api/users/sync', requireAuth, async (req, res) => {
    try {
      const authUser = req.authUser!;
      const { firstName, lastName, phone, city } = req.body;
      const [updated] = await db
        .update(users)
        .set({
          firstName: firstName?.trim() || authUser.firstName,
          lastName: lastName?.trim() || authUser.lastName,
          phone: phone?.trim() || authUser.phone,
          city: city?.trim() || authUser.city,
          updatedAt: new Date(),
        })
        .where(eq(users.id, authUser.id))
        .returning();

      if (req.cartSessionId) {
        await mergeGuestCartIntoUser(req.cartSessionId, authUser.id);
      }

      const me = await buildMePayload(updated.id);
      res.json(me?.user || updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to sync user profile.' });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const { firstName, lastName, phone, city } = req.body;
      const [updated] = await db
        .update(users)
        .set({
          firstName: firstName?.trim() ?? req.authUser!.firstName,
          lastName: lastName?.trim() ?? req.authUser!.lastName,
          phone: phone?.trim() ?? req.authUser!.phone,
          city: city?.trim() ?? req.authUser!.city,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.authUser!.id))
        .returning();
      const { passwordHash: _p, resetToken: _r, verificationToken: _v, ...safe } = updated;
      res.json({ success: true, user: safe });
    } catch {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // ==========================================
  // PUBLIC MARKETPLACE DISCOVERY
  // ==========================================
  app.get('/api/categories', async (_req, res) => {
    const cats = await db.select().from(eventCategories);
    res.json(cats);
  });

  app.get('/api/discover', async (req, res) => {
    try {
      await expireStaleReservations();
      const q = ((req.query.q as string) || '').trim().toLowerCase();
      const category = ((req.query.category as string) || '').trim().toLowerCase();
      const city = ((req.query.city as string) || '').trim().toLowerCase();
      const priceFilter = ((req.query.price as string) || '').trim(); // 'free' | 'paid' | 'under200'
      const sort = ((req.query.sort as string) || 'featured').trim(); // 'featured' | 'popular' | 'upcoming' | 'recent'

      const rows = await db
        .select({
          id: events.id,
          slug: events.slug,
          businessId: events.businessId,
          venueId: events.venueId,
          name: events.name,
          description: events.description,
          coverImage: events.coverImage,
          logo: events.logo,
          address: events.address,
          city: events.city,
          province: events.province,
          country: events.country,
          isOnline: events.isOnline,
          isFeatured: events.isFeatured,
          dateText: events.dateText,
          startDate: events.startDate,
          startTime: events.startTime,
          endTime: events.endTime,
          category: events.category,
          ageRestriction: events.ageRestriction,
          status: events.status,
          createdAt: events.createdAt,
          businessName: businesses.name,
          businessStatus: businesses.status,
          venueName: venues.name,
          venueCity: venues.city,
          venueAddress: venues.address,
        })
        .from(events)
        .innerJoin(businesses, eq(events.businessId, businesses.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(
          and(
            eq(businesses.status, 'ACTIVE'),
            inArray(events.status, ['PUBLISHED', 'ON_SALE', 'SOLD_OUT'])
          )
        );

      const enriched = [];
      for (const evt of rows) {
        const tiers = await db
          .select()
          .from(ticketTypes)
          .where(and(eq(ticketTypes.eventId, evt.id), eq(ticketTypes.status, 'ACTIVE')));
        const pricesCents = tiers.map((t) => (t.isFree ? 0 : t.priceCents ?? t.price * 100));
        const minPriceCents = pricesCents.length > 0 ? Math.min(...pricesCents) : 0;
        const maxPriceCents = pricesCents.length > 0 ? Math.max(...pricesCents) : 0;
        const totalRemaining = tiers.reduce((s, t) => s + t.remaining, 0);
        const totalSold = tiers.reduce((s, t) => s + Math.max(0, t.quantity - t.remaining), 0);
        const effectiveCity = evt.venueCity || evt.city || 'Johannesburg';

        if (q) {
          const hay = `${evt.name} ${evt.description || ''} ${evt.category} ${effectiveCity} ${evt.businessName} ${evt.venueName || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        if (category && category !== 'all') {
          if (!evt.category.toLowerCase().includes(category)) continue;
        }
        if (city && city !== 'all') {
          if (!effectiveCity.toLowerCase().includes(city)) continue;
        }
        if (priceFilter === 'free' && minPriceCents > 0) continue;
        if (priceFilter === 'paid' && minPriceCents === 0) continue;
        if (priceFilter === 'under200' && minPriceCents > 20000) continue;

        enriched.push({
          ...evt,
          city: effectiveCity,
          venueDisplay: evt.isOnline ? 'Online Experience' : evt.venueName || evt.address || effectiveCity,
          minPriceCents,
          maxPriceCents,
          price: Math.round(minPriceCents / 100),
          totalRemaining,
          totalSold,
          tierCount: tiers.length,
        });
      }

      if (sort === 'popular') {
        enriched.sort((a, b) => b.totalSold - a.totalSold);
      } else if (sort === 'recent') {
        enriched.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      } else {
        enriched.sort((a, b) => b.isFeatured - a.isFeatured || b.totalSold - a.totalSold);
      }

      const categories = await db.select().from(eventCategories);
      res.json({ events: enriched, categories });
    } catch (err) {
      console.error('Discover failed:', err);
      res.status(500).json({ error: 'Failed to load marketplace events.' });
    }
  });

  app.get('/api/events/all', async (_req, res) => {
    try {
      await expireStaleReservations();
      const publicEvents = await db
        .select({
          id: events.id,
          slug: events.slug,
          businessId: events.businessId,
          venueId: events.venueId,
          name: events.name,
          description: events.description,
          coverImage: events.coverImage,
          logo: events.logo,
          address: events.address,
          city: events.city,
          isOnline: events.isOnline,
          isFeatured: events.isFeatured,
          dateText: events.dateText,
          startTime: events.startTime,
          endTime: events.endTime,
          category: events.category,
          ageRestriction: events.ageRestriction,
          status: events.status,
          businessName: businesses.name,
          venueName: venues.name,
          venueCity: venues.city,
        })
        .from(events)
        .innerJoin(businesses, eq(events.businessId, businesses.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(
          and(
            eq(businesses.status, 'ACTIVE'),
            inArray(events.status, ['PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'COMPLETED'])
          )
        );

      const eventsWithPrice = [];
      for (const event of publicEvents) {
        const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
        const minPriceCents = types.length > 0 ? Math.min(...types.map((t) => (t.isFree ? 0 : t.priceCents ?? t.price * 100))) : 0;
        eventsWithPrice.push({
          ...event,
          minPriceCents,
          price: Math.round(minPriceCents / 100),
        });
      }

      res.json(eventsWithPrice);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  const getEventDetail = async (whereClause: any) => {
    const [evt] = await db
      .select({
        id: events.id,
        slug: events.slug,
        businessId: events.businessId,
        venueId: events.venueId,
        name: events.name,
        description: events.description,
        coverImage: events.coverImage,
        bannerImages: events.bannerImages,
        logo: events.logo,
        address: events.address,
        city: events.city,
        province: events.province,
        country: events.country,
        isOnline: events.isOnline,
        onlineUrl: events.onlineUrl,
        mapLat: events.mapLat,
        mapLng: events.mapLng,
        contactEmail: events.contactEmail,
        contactPhone: events.contactPhone,
        refundPolicy: events.refundPolicy,
        termsAndConditions: events.termsAndConditions,
        isFeatured: events.isFeatured,
        dateText: events.dateText,
        startDate: events.startDate,
        endDate: events.endDate,
        startTime: events.startTime,
        endTime: events.endTime,
        timezone: events.timezone,
        category: events.category,
        ageRestriction: events.ageRestriction,
        status: events.status,
        businessName: businesses.name,
        businessLogo: businesses.logo,
        businessDescription: businesses.description,
        businessStatus: businesses.status,
        venueName: venues.name,
        venueAddress: venues.address,
        venueCity: venues.city,
        venueCapacity: venues.capacity,
      })
      .from(events)
      .innerJoin(businesses, eq(events.businessId, businesses.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(whereClause);

    if (!evt) return null;

    const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, evt.id));
    const commissionRule = await resolveCommissionRule(evt.businessId, evt.id);
    const minPriceCents = types.length > 0 ? Math.min(...types.map((t) => (t.isFree ? 0 : t.priceCents ?? t.price * 100))) : 0;

    return {
      ...evt,
      minPriceCents,
      price: Math.round(minPriceCents / 100),
      bookingFeeBps: commissionRule.bookingFeeBps,
      ticketTypes: types.map((t) => ({
        ...t,
        priceCents: t.isFree ? 0 : (t.priceCents ?? t.price * 100),
      })),
    };
  };

  app.get('/api/events/slug/:slug', async (req, res) => {
    try {
      await expireStaleReservations();
      const slug = req.params.slug;
      const numericId = Number(slug);
      const detail =
        Number.isInteger(numericId) && numericId > 0
          ? await getEventDetail(or(eq(events.slug, slug), eq(events.id, numericId)))
          : await getEventDetail(eq(events.slug, slug));
      if (!detail) return res.status(404).json({ error: 'Event not found' });
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/events/:eventId', async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }
      await expireStaleReservations();
      const detail = await getEventDetail(eq(events.id, eventId));
      if (!detail) return res.status(404).json({ error: 'Event not found' });
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/events/:eventId/ticket-types', async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || isNaN(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }
      await expireStaleReservations();
      const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
      res.json(
        types.map((t) => ({
          ...t,
          priceCents: t.isFree ? 0 : (t.priceCents ?? t.price * 100),
        }))
      );
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==========================================
  // SERVER-SIDE CART & PROMO VALIDATION
  // ==========================================
  app.get('/api/cart', optionalAuth, async (req, res) => {
    try {
      const state = await getCartState(req.cartSessionId!, req.authUser?.id);
      res.json({ sessionId: req.cartSessionId, ...state });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load cart.' });
    }
  });

  app.put('/api/cart', optionalAuth, async (req, res) => {
    try {
      const { eventId, items, promoCode } = req.body;
      const numericEventId = Number(eventId);
      if (!Number.isInteger(numericEventId) || numericEventId <= 0) {
        return res.status(400).json({ error: 'Valid eventId is required.' });
      }
      await saveCartState({
        sessionId: req.cartSessionId!,
        userId: req.authUser?.id || null,
        eventId: numericEventId,
        promoCode,
        items: Array.isArray(items) ? items : [],
      });
      const state = await getCartState(req.cartSessionId!, req.authUser?.id);
      res.json({ sessionId: req.cartSessionId, ...state });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to save cart.' });
    }
  });

  app.post('/api/promo/validate', async (req, res) => {
    try {
      const { code, eventId } = req.body;
      if (!code?.trim()) {
        return res.status(400).json({ valid: false, error: 'Promo code is required.' });
      }
      const cleanCode = code.trim().toUpperCase();
      const [promo] = await db
        .select()
        .from(promoCodes)
        .where(and(eq(promoCodes.code, cleanCode), eq(promoCodes.active, 1)));

      if (!promo) {
        return res.status(400).json({ valid: false, error: 'Invalid or inactive promo code.' });
      }
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, error: 'This promo code has expired.' });
      }
      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        return res.status(400).json({ valid: false, error: 'This promo code has reached its redemption limit.' });
      }
      if (eventId) {
        const [evt] = await db.select().from(events).where(eq(events.id, Number(eventId)));
        if (evt) {
          if (promo.businessId && promo.businessId !== evt.businessId) {
            return res.status(400).json({ valid: false, error: 'Promo code does not apply to this organiser.' });
          }
          if (promo.eventId && promo.eventId !== evt.id) {
            return res.status(400).json({ valid: false, error: 'Promo code does not apply to this event.' });
          }
        }
      }

      res.json({
        valid: true,
        code: promo.code,
        discountPercent: promo.discountPercent,
        discountCents: promo.discountCents,
      });
    } catch {
      res.status(500).json({ valid: false, error: 'Promo validation error.' });
    }
  });

  // ==========================================
  // CHECKOUT, PAYMENT GATEWAY & WEBHOOKS
  // ==========================================
  app.get('/api/gateways', (_req, res) => {
    res.json({ gateways: getAvailableGateways() });
  });

  app.post('/api/checkout/initiate', optionalAuth, async (req, res) => {
    try {
      const { buyerName, buyerEmail, buyerPhone, items, assignments, promoCode, eventId, provider, idempotencyKey } = req.body;
      if (!buyerName?.trim() || !buyerEmail?.trim()) {
        return res.status(400).json({ error: 'Buyer first/last name and email address are required.' });
      }
      const selectedEventId = Number(eventId);
      if (!Number.isInteger(selectedEventId) || selectedEventId <= 0) {
        return res.status(400).json({ error: 'Valid eventId is required.' });
      }

      const origin = `${req.protocol}://${req.get('host')}`;
      const result = await initiateCheckoutOrder({
        userId: req.authUser?.id || null,
        eventId: selectedEventId,
        buyerName,
        buyerEmail,
        buyerPhone,
        items,
        assignments,
        promoCode,
        provider: (provider || (process.env.PAYSTACK_SECRET_KEY ? 'paystack' : 'sandbox')) as GatewayProvider,
        idempotencyKey,
        callbackOrigin: origin,
        cartSessionId: req.cartSessionId,
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Checkout initialization failed.' });
    }
  });

  // Paystack / Sandbox Payment Webhook
  app.post('/api/payments/webhook/:provider', async (req, res) => {
    try {
      const provider = req.params.provider;
      const signature =
        (req.headers['x-paystack-signature'] as string | undefined) ||
        (req.headers['x-webhook-signature'] as string | undefined);
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      const outcome = await recordWebhookAndProcess({
        provider,
        rawBody,
        parsedBody: req.body,
        signature,
      });

      if (!outcome.ok) {
        return res.status(outcome.statusCode || 400).json({ error: outcome.error });
      }
      res.json({ received: true, ...outcome });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Webhook processing error.' });
    }
  });

  // Sandbox Test Gateway confirmation (executes signed server webhook flow!)
  app.post('/api/payments/sandbox/complete/:reference', optionalAuth, async (req, res) => {
    try {
      const reference = req.params.reference;
      const [payment] = await db.select().from(payments).where(eq(payments.reference, reference));
      if (!payment) return res.status(404).json({ error: 'Payment reference not found.' });
      if (payment.provider !== 'sandbox') {
        return res.status(400).json({ error: 'Endpoint only valid for sandbox test payments.' });
      }

      const { simulateOutcome = 'success', assignments } = req.body || {};
      if (simulateOutcome === 'fail') {
        await db
          .update(payments)
          .set({ status: 'FAILED', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
        await cancelPendingOrder(reference);
        return res.status(402).json({ error: 'Simulated payment failure: card declined. Ticket reservation released.' });
      }

      const webhookPayload = {
        event: 'charge.success',
        data: {
          reference,
          amount: payment.amountCents,
          fees: payment.gatewayFeeCents,
          channel: 'card_sandbox',
          metadata: { assignments },
        },
      };
      const rawBody = JSON.stringify(webhookPayload);
      const sig = signSandboxWebhook(rawBody);
      const outcome = await recordWebhookAndProcess({
        provider: 'sandbox',
        rawBody,
        parsedBody: webhookPayload,
        signature: sig,
      });

      if (!outcome.ok) {
        return res.status(outcome.statusCode || 400).json({ error: outcome.error });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
      const issuedTickets = await db.select().from(tickets).where(eq(tickets.orderId, payment.orderId));
      const [evt] = order ? await db.select().from(events).where(eq(events.id, order.eventId)) : [null];
      const [venue] = evt?.venueId ? await db.select().from(venues).where(eq(venues.id, evt.venueId)) : [null];

      res.json({
        success: true,
        order,
        event: evt
          ? {
              name: evt.name,
              date: evt.dateText,
              venue: venue ? `${venue.name}, ${venue.city}` : evt.address || evt.city || 'Venue TBA',
            }
          : null,
        tickets: issuedTickets,
        isGuestOrder: order?.userId === null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Sandbox payment confirmation failed.' });
    }
  });

  app.post('/api/payments/cancel/:reference', async (req, res) => {
    const out = await cancelPendingOrder(req.params.reference);
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ success: true, order: out.order });
  });

  // Verify payment status & return order/tickets cleanly
  app.get('/api/payments/verify/:reference', optionalAuth, async (req, res) => {
    try {
      const reference = req.params.reference;
      const [payment] = await db.select().from(payments).where(eq(payments.reference, reference));
      if (!payment) return res.status(404).json({ error: 'Payment not found.' });

      let [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
      if (order && order.status === 'PENDING' && payment.provider === 'paystack') {
        const verified = await verifyGatewayWithProvider('paystack', reference);
        if (verified.verified) {
          await completeOrderPayment({
            reference,
            provider: 'paystack',
            amountCents: verified.amountCents!,
            gatewayFeeCents: verified.gatewayFeeCents,
            paymentMethod: verified.paymentMethod,
            rawResponse: verified.raw,
            cartSessionId: req.cartSessionId,
          });
          [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
        }
      }

      const issuedTickets = order?.status === 'PAID' ? await db.select().from(tickets).where(eq(tickets.orderId, order.id)) : [];
      const [evt] = order ? await db.select().from(events).where(eq(events.id, order.eventId)) : [null];
      const [venue] = evt?.venueId ? await db.select().from(venues).where(eq(venues.id, evt.venueId)) : [null];

      res.json({
        order,
        payment,
        event: evt
          ? {
              name: evt.name,
              date: evt.dateText,
              venue: venue ? `${venue.name}, ${venue.city}` : evt.address || evt.city || 'Venue TBA',
            }
          : null,
        tickets: issuedTickets,
        isGuestOrder: order?.userId === null,
      });
    } catch (err) {
      res.status(500).json({ error: 'Payment verification failed.' });
    }
  });

  // Backwards-compatible order shortcut when Sandbox is active
  app.post('/api/tickets/orders', optionalAuth, async (req, res) => {
    try {
      const { buyerName, buyerEmail, buyerPhone, items, assignments, promoCode, eventId, provider } = req.body;
      const selectedEventId = Number(eventId || 1);
      const origin = `${req.protocol}://${req.get('host')}`;
      const chosenProvider = (provider || 'sandbox') as GatewayProvider;

      const init = await initiateCheckoutOrder({
        userId: req.authUser?.id || null,
        eventId: selectedEventId,
        buyerName: buyerName || 'Guest Customer',
        buyerEmail: buyerEmail || 'guest@example.com',
        buyerPhone,
        items,
        assignments,
        promoCode,
        provider: chosenProvider,
        callbackOrigin: origin,
        cartSessionId: req.cartSessionId,
      });

      if (init.freeCompleted || chosenProvider === 'sandbox') {
        const payRef = init.payment.reference;
        if (!init.freeCompleted) {
          const webhookPayload = {
            event: 'charge.success',
            data: {
              reference: payRef,
              amount: init.payment.amountCents,
              fees: init.payment.gatewayFeeCents,
              channel: 'card_sandbox',
              metadata: { assignments },
            },
          };
          const rawBody = JSON.stringify(webhookPayload);
          await recordWebhookAndProcess({
            provider: 'sandbox',
            rawBody,
            parsedBody: webhookPayload,
            signature: signSandboxWebhook(rawBody),
          });
        }
        const [order] = await db.select().from(orders).where(eq(orders.id, init.order!.id));
        const issuedTickets = await db.select().from(tickets).where(eq(tickets.orderId, init.order!.id));
        const [evt] = await db.select().from(events).where(eq(events.id, selectedEventId));
        const [venue] = evt?.venueId ? await db.select().from(venues).where(eq(venues.id, evt.venueId)) : [null];
        return res.json({
          orderNumber: order.orderNumber,
          paymentReference: payRef,
          emailStatus: 'queued',
          totalCents: order.totalCents,
          event: {
            name: evt?.name || 'Live Event',
            date: evt?.dateText || '',
            venue: venue ? `${venue.name}, ${venue.city}` : evt?.address || evt?.city || 'Venue TBA',
          },
          tickets: issuedTickets.map((t) => ({
            ...t,
            ticketId: t.id,
            ticketType: t.type,
            eventDate: evt?.dateText || '',
            venue: venue ? `${venue.name}, ${venue.city}` : evt?.address || evt?.city || 'Venue TBA',
            qrDataUrl: t.qrCodeUrl,
          })),
        });
      }

      res.json(init);
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Order failed.' });
    }
  });

  // ==========================================
  // CUSTOMER ORDERS, CLAIMING, TICKETS, REFUNDS & FAVOURITES
  // ==========================================
  app.get('/api/orders/my', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const myOrders = await db
        .select({
          order: orders,
          eventName: events.name,
          eventDate: events.dateText,
          eventSlug: events.slug,
          venueName: venues.name,
          venueCity: venues.city,
        })
        .from(orders)
        .innerJoin(events, eq(orders.eventId, events.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(eq(orders.userId, user.id))
        .orderBy(desc(orders.createdAt));

      const enriched = [];
      for (const row of myOrders) {
        const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, row.order.id));
        const orderRefunds = await db.select().from(refunds).where(eq(refunds.orderId, row.order.id));
        enriched.push({
          ...row.order,
          eventName: row.eventName,
          eventDate: row.eventDate,
          eventSlug: row.eventSlug,
          venue: row.venueName ? `${row.venueName}, ${row.venueCity || ''}` : 'Venue TBA',
          tickets: orderTickets,
          refunds: orderRefunds,
        });
      }

      // Count any unclaimed guest orders matching this verified email
      const unclaimed = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(isNull(orders.userId), sql`LOWER(${orders.buyerEmail}) = ${user.email.toLowerCase()}`));

      res.json({
        orders: enriched,
        unclaimedGuestOrdersCount: Number(unclaimed[0]?.count || 0),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load your orders.' });
    }
  });

  // Secure guest purchase claiming: requires authenticated user + verified email ownership
  app.post('/api/orders/claim', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const { verificationCode } = req.body || {};
      const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
      if (!dbUser) return res.status(404).json({ error: 'Account not found.' });

      if (dbUser.emailVerified !== 1) {
        if (!verificationCode || !dbUser.verificationToken || verificationCode.trim() !== dbUser.verificationToken) {
          return res.status(403).json({
            error: 'Email ownership verification required before claiming guest purchases.',
            requiresVerification: true,
          });
        }
        await db.update(users).set({ emailVerified: 1, verificationToken: null }).where(eq(users.id, dbUser.id));
      }

      const claimedCount = await claimVerifiedEmailOrders(dbUser.id, dbUser.email);
      res.json({
        success: true,
        claimedCount,
        message:
          claimedCount > 0
            ? `Successfully linked ${claimedCount} guest order(s) for ${dbUser.email} to your account.`
            : `No unclaimed guest orders found for ${dbUser.email}.`,
      });
    } catch {
      res.status(500).json({ error: 'Failed to claim guest orders.' });
    }
  });

  // Customer Refund Request (only by order owner)
  app.post('/api/orders/:orderNumber/refund-request', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const orderNumber = req.params.orderNumber;
      const { reason, ticketId } = req.body;
      if (!reason?.trim()) return res.status(400).json({ error: 'Please explain your reason for requesting a refund.' });

      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      if (order.userId !== user.id && order.buyerEmail.toLowerCase() !== user.email.toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden: You can only request refunds for your own orders.' });
      }
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.status)) {
        return res.status(400).json({ error: `Cannot request a refund for order in status '${order.status}'.` });
      }

      const totalCents = order.totalCents ?? order.total * 100;
      const [created] = await db
        .insert(refunds)
        .values({
          orderId: order.id,
          businessId: order.businessId,
          ticketId: ticketId ? Number(ticketId) : null,
          requestedByUserId: user.id,
          requesterEmail: user.email,
          reason: reason.trim(),
          amountCents: totalCents,
          status: 'REQUESTED',
        })
        .returning();

      const [biz] = await db.select().from(businesses).where(eq(businesses.id, order.businessId));
      await createNotification({
        email: biz?.email || null,
        type: 'REFUND_REQUESTED',
        title: `Refund Requested: ${order.orderNumber}`,
        message: `${order.buyerName} requested a refund for order ${order.orderNumber}. Reason: ${reason.trim()}`,
        channel: 'EMAIL',
        sendEmailToo: true,
        metadata: { refundId: created.id, orderId: order.id },
      });

      res.json({ success: true, refund: created });
    } catch {
      res.status(500).json({ error: 'Failed to submit refund request.' });
    }
  });

  // Customer My Tickets (joined with real event & venue metadata — no hardcoded dates/venues!)
  app.get('/api/tickets/my', requireAuth, async (req, res) => {
    try {
      const user = req.authUser!;
      const rows = await db
        .select({
          ticket: tickets,
          eventDate: events.dateText,
          startTime: events.startTime,
          endTime: events.endTime,
          eventAddress: events.address,
          eventCity: events.city,
          eventStatus: events.status,
          isOnline: events.isOnline,
          onlineUrl: events.onlineUrl,
          venueName: venues.name,
          venueCity: venues.city,
          orderNumber: orders.orderNumber,
        })
        .from(tickets)
        .leftJoin(events, eq(tickets.eventId, events.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(orders, eq(tickets.orderId, orders.id))
        .where(
          or(
            eq(tickets.userId, user.id),
            sql`LOWER(${tickets.attendeeEmail}) = ${user.email.toLowerCase()}`,
            sql`LOWER(${tickets.buyerEmail}) = ${user.email.toLowerCase()}`
          )
        )
        .orderBy(desc(tickets.createdAt));

      res.json(
        rows.map((r) => ({
          ...r.ticket,
          eventDate: r.eventDate || 'Date TBA',
          startTime: r.startTime,
          endTime: r.endTime,
          venue: r.isOnline
            ? 'Online Event'
            : r.venueName
              ? `${r.venueName}, ${r.venueCity || ''}`
              : r.eventAddress || r.eventCity || 'Venue TBA',
          eventStatus: r.eventStatus,
          onlineUrl: r.onlineUrl,
          orderNumber: r.orderNumber || `ORD-${r.ticket.orderId || r.ticket.id}`,
        }))
      );
    } catch {
      res.status(500).json({ error: 'Failed to load tickets.' });
    }
  });

  // Public Ticket Verification Preview (read-only)
  app.get('/api/tickets/verify/:token', async (req, res) => {
    const [row] = await db
      .select({
        ticketNumber: tickets.ticketNumber,
        eventName: tickets.eventName,
        type: tickets.type,
        attendeeName: tickets.attendeeName,
        status: tickets.status,
        checkedInAt: tickets.checkedInAt,
        eventDate: events.dateText,
        venueName: venues.name,
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(eq(tickets.token, req.params.token));
    if (!row) return res.status(404).json({ error: 'Ticket token not found.' });
    res.json(row);
  });

  // Transfer ticket (STRICT ownership check!)
  app.post('/api/tickets/transfer', requireAuth, async (req, res) => {
    try {
      const { ticketId, newName, newEmail } = req.body;
      const user = req.authUser!;
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, Number(ticketId)));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

      const ownsTicket =
        ticket.userId === user.id ||
        ticket.buyerEmail?.toLowerCase() === user.email.toLowerCase() ||
        ticket.attendeeEmail.toLowerCase() === user.email.toLowerCase();

      if (!ownsTicket) {
        return res.status(403).json({ error: 'Forbidden: You do not own this ticket.' });
      }
      if (ticket.status !== 'VALID') {
        return res.status(400).json({ error: `Cannot transfer a ticket in '${ticket.status}' state.` });
      }

      const [recipient] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${newEmail.trim().toLowerCase()}`);

      const [updatedTicket] = await db
        .update(tickets)
        .set({
          attendeeName: newName.trim(),
          attendeeEmail: newEmail.trim().toLowerCase(),
          userId: recipient ? recipient.id : null,
        })
        .where(eq(tickets.id, ticket.id))
        .returning();

      await createNotification({
        userId: recipient?.id || null,
        email: newEmail.trim().toLowerCase(),
        type: 'TICKET_TRANSFERRED',
        title: `You Received a Ticket: ${ticket.eventName}`,
        message: `${user.firstName || user.email} transferred ticket ${ticket.ticketNumber} (${ticket.type}) for ${ticket.eventName} to you.`,
        channel: 'EMAIL',
        sendEmailToo: true,
      });

      res.json({ success: true, ticket: updatedTicket });
    } catch {
      res.status(500).json({ error: 'Ticket transfer failed.' });
    }
  });

  // Cashless endpoints (STRICT authentication & ownership check!)
  app.get('/api/tickets/:id/cashless', requireAuth, async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const user = req.authUser!;
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const owns =
        ticket.userId === user.id ||
        ticket.buyerEmail?.toLowerCase() === user.email.toLowerCase() ||
        ticket.attendeeEmail.toLowerCase() === user.email.toLowerCase();
      if (!owns) return res.status(403).json({ error: 'Forbidden' });

      const txns = await db
        .select()
        .from(cashlessTransactions)
        .where(eq(cashlessTransactions.ticketId, ticketId))
        .orderBy(desc(cashlessTransactions.time));

      res.json({
        cashlessNumber: ticket.cashlessNumber,
        cashlessBalance: ticket.cashlessBalance,
        transactions: txns,
      });
    } catch {
      res.status(500).json({ error: 'Failed to retrieve cashless details.' });
    }
  });

  app.post('/api/cashless/topup', requireAuth, async (req, res) => {
    try {
      const { ticketId, amountCents } = req.body;
      const amount = Number(amountCents);
      const user = req.authUser!;
      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Positive integer amountCents required.' });
      }

      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, Number(ticketId)));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const owns =
        ticket.userId === user.id ||
        ticket.buyerEmail?.toLowerCase() === user.email.toLowerCase() ||
        ticket.attendeeEmail.toLowerCase() === user.email.toLowerCase();
      if (!owns) return res.status(403).json({ error: 'Forbidden' });

      const [txn] = await db
        .insert(cashlessTransactions)
        .values({ ticketId: ticket.id, description: 'RFID Wallet Top-up', amount })
        .returning();

      const [updatedTicket] = await db
        .update(tickets)
        .set({ cashlessBalance: ticket.cashlessBalance + amount })
        .where(eq(tickets.id, ticket.id))
        .returning();

      res.json({ success: true, newBalance: updatedTicket.cashlessBalance, transaction: txn });
    } catch {
      res.status(500).json({ error: 'Top-up failed.' });
    }
  });

  app.post('/api/cashless/spend', requireAuth, async (req, res) => {
    try {
      const { ticketId, description, amountCents } = req.body;
      const amount = Number(amountCents);
      const user = req.authUser!;
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, Number(ticketId)));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const owns =
        ticket.userId === user.id ||
        ticket.buyerEmail?.toLowerCase() === user.email.toLowerCase() ||
        ticket.attendeeEmail.toLowerCase() === user.email.toLowerCase();
      if (!owns) return res.status(403).json({ error: 'Forbidden' });
      if (ticket.status !== 'CHECKED_IN') {
        return res.status(400).json({ error: 'Ticket must be checked in before RFID wristband spending.' });
      }
      if (ticket.cashlessBalance - amount < 0) {
        return res.status(400).json({ error: 'Insufficient cashless balance.' });
      }

      const [txn] = await db
        .insert(cashlessTransactions)
        .values({ ticketId: ticket.id, description, amount: -amount })
        .returning();

      const [updatedTicket] = await db
        .update(tickets)
        .set({ cashlessBalance: ticket.cashlessBalance - amount })
        .where(eq(tickets.id, ticket.id))
        .returning();

      res.json({ success: true, newBalance: updatedTicket.cashlessBalance, transaction: txn });
    } catch {
      res.status(500).json({ error: 'RFID spend failed.' });
    }
  });

  // Favourites
  app.get('/api/favourites', requireAuth, async (req, res) => {
    const rows = await db
      .select({
        id: customerFavourites.id,
        eventId: customerFavourites.eventId,
        eventName: events.name,
        slug: events.slug,
        dateText: events.dateText,
        coverImage: events.coverImage,
        category: events.category,
      })
      .from(customerFavourites)
      .innerJoin(events, eq(customerFavourites.eventId, events.id))
      .where(eq(customerFavourites.userId, req.authUser!.id));
    res.json(rows);
  });

  app.post('/api/favourites/toggle', requireAuth, async (req, res) => {
    const eventId = Number(req.body.eventId);
    const [existing] = await db
      .select()
      .from(customerFavourites)
      .where(and(eq(customerFavourites.userId, req.authUser!.id), eq(customerFavourites.eventId, eventId)));
    if (existing) {
      await db.delete(customerFavourites).where(eq(customerFavourites.id, existing.id));
      return res.json({ favourited: false });
    }
    await db.insert(customerFavourites).values({ userId: req.authUser!.id, eventId });
    res.json({ favourited: true });
  });

  // Notifications
  app.get('/api/notifications/my', requireAuth, async (req, res) => {
    const list = await db
      .select()
      .from(notifications)
      .where(or(eq(notifications.userId, req.authUser!.id), sql`LOWER(${notifications.email}) = ${req.authUser!.email.toLowerCase()}`))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json(list);
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, Number(req.params.id)), eq(notifications.userId, req.authUser!.id)));
    res.json({ success: true });
  });

  app.post('/api/notifications/:id/retry', requireAuth, async (req, res) => {
    const out = await retryEmailNotification(Number(req.params.id));
    res.json(out);
  });

  // Real DB Overview & History (NO hardcoded floor numbers!)
  app.get('/api/overview', optionalAuth, async (_req, res) => {
    try {
      const totalSoldResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(sql`${tickets.status} IN ('VALID','CHECKED_IN')`);
      const checkedInResult = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(eq(tickets.status, 'CHECKED_IN'));
      const records = await db.select().from(checkInRecords).orderBy(desc(checkInRecords.time)).limit(15);

      const checkedIn = Number(checkedInResult[0]?.count || 0);
      const sold = Number(totalSoldResult[0]?.count || 0);
      res.json({
        checkedIn,
        sold,
        remaining: Math.max(0, sold - checkedIn),
        records,
      });
    } catch {
      res.status(500).json({ error: 'Failed to retrieve overview metrics.' });
    }
  });
}
