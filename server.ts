import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import path from 'path';
import fs from 'fs';
import { eq, isNull, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  businesses,
  businessTeam,
  commissionRules,
  eventCategories,
  events,
  platformSettings,
  platformTeam,
  promoCodes,
  ticketTypes,
  users,
  venues,
} from './src/db/schema.ts';
import { attachCartSession, hashPassword } from './src/server/auth.ts';
import { registerPublicRoutes } from './src/server/routes-public.ts';
import { registerBusinessRoutes } from './src/server/routes-business.ts';
import { registerAdminRoutes } from './src/server/routes-admin.ts';

const app = express();

// Preserve rawBody for HMAC webhook signature verification
app.use(
  express.json({
    limit: '4mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Support BASE_PATH rewrites for API endpoints
const basePath = process.env.BASE_PATH || '/';
if (basePath !== '/') {
  const apiPrefix = basePath.endsWith('/') ? `${basePath}api/` : `${basePath}/api/`;
  app.use((req, _res, next) => {
    if (req.url.startsWith(apiPrefix)) {
      req.url = req.url.slice(apiPrefix.length - 4);
    }
    next();
  });
}

app.use(attachCartSession);

const isProduction = process.env.NODE_ENV === 'production';

async function ensureDefaultsAndPasswords() {
  try {
    // 1. Ensure default platform settings & commission rule exist
    const settingsCount = await db.select({ count: sql<number>`count(*)` }).from(platformSettings);
    if (Number(settingsCount[0].count) === 0) {
      await db.insert(platformSettings).values({
        platformName: 'Howler Tickets',
        currency: 'ZAR',
        platformFeePercent: 5,
        platformFixedFee: 0,
        supportEmail: 'support@howlertickets.com',
        businessApprovalRequired: 1,
        eventApprovalRequired: 0,
      });
    }

    const commCount = await db.select({ count: sql<number>`count(*)` }).from(commissionRules);
    if (Number(commCount[0].count) === 0) {
      await db.insert(commissionRules).values({
        scope: 'PLATFORM',
        commissionBps: 500,
        fixedFeeCents: 0,
        bookingFeeBps: 350,
        active: 1,
      });
    }

    const catCount = await db.select({ count: sql<number>`count(*)` }).from(eventCategories);
    if (Number(catCount[0].count) === 0) {
      await db
        .insert(eventCategories)
        .values([
          { name: 'Music & Festivals', slug: 'music-festivals', description: 'Live concerts and DJ lineups', icon: 'music' },
          { name: 'Conferences & Tech', slug: 'conferences-tech', description: 'Summits, talks, and workshops', icon: 'laptop' },
          { name: 'Nightlife & Clubs', slug: 'nightlife-clubs', description: 'Clubs, rooftops, and late sets', icon: 'sparkles' },
          { name: 'Comedy & Theatre', slug: 'comedy-theatre', description: 'Stand-up and stage arts', icon: 'mic' },
          { name: 'Food & Drink', slug: 'food-drink', description: 'Markets, tastings, and supper clubs', icon: 'utensils' },
          { name: 'Sports & Wellness', slug: 'sports-wellness', description: 'Races, games, and expos', icon: 'trophy' },
        ])
        .onConflictDoNothing();
    }

    // 2. Ensure core seeded accounts exist and have scrypt password hashes if missing
    const coreUsers = [
      { uid: 'super-admin-uid', email: 'admin@howlertickets.com', role: 'superadmin', firstName: 'Admin', lastName: 'Boss', verified: 1 },
      { uid: 'user_2N6x2B5p9a8K7b4C1d9E', email: 'jordan.scott@northstarsummit.com', role: 'organizer', firstName: 'Jordan', lastName: 'Scott', verified: 1 },
      { uid: 'uid-maya', email: 'maya@example.com', role: 'attendee', firstName: 'Maya', lastName: 'Chen', verified: 1 },
    ];

    for (const cu of coreUsers) {
      let [existing] = await db.select().from(users).where(eq(users.email, cu.email));
      if (!existing) {
        [existing] = await db.select().from(users).where(eq(users.uid, cu.uid));
      }
      if (!existing) {
        [existing] = await db
          .insert(users)
          .values({
            uid: cu.uid,
            email: cu.email,
            role: cu.role,
            firstName: cu.firstName,
            lastName: cu.lastName,
            passwordHash: hashPassword('password123'),
            emailVerified: cu.verified,
          })
          .returning();
      } else if (!existing.passwordHash) {
        await db
          .update(users)
          .set({ passwordHash: hashPassword('password123'), emailVerified: cu.verified })
          .where(eq(users.id, existing.id));
      }

      if (cu.role === 'superadmin') {
        const [pRow] = await db.select().from(platformTeam).where(eq(platformTeam.userId, existing.id));
        if (!pRow) {
          await db.insert(platformTeam).values({ userId: existing.id, role: 'SUPER_ADMIN' });
        }
      }
    }

    // Ensure any legacy users without passwordHash get default passwordHash=null left safely or backfilled
    const unverifiedDemo = await db.select().from(users).where(isNull(users.passwordHash));
    for (const u of unverifiedDemo) {
      if (u.email.endsWith('@example.com') || u.email.endsWith('@northstarsummit.com') || u.email.endsWith('@howlertickets.com')) {
        await db.update(users).set({ passwordHash: hashPassword('password123') }).where(eq(users.id, u.id));
      }
    }

    // Ensure ABC Entertainment has Jordan linked cleanly as BUSINESS_OWNER
    const [jordan] = await db.select().from(users).where(eq(users.email, 'jordan.scott@northstarsummit.com'));
    const [abc] = await db.select().from(businesses).where(eq(businesses.email, 'jordan.scott@northstarsummit.com'));
    if (jordan && abc) {
      const [bt] = await db
        .select()
        .from(businessTeam)
        .where(sql`${businessTeam.businessId} = ${abc.id} AND ${businessTeam.userId} = ${jordan.id}`);
      if (!bt) {
        await db.insert(businessTeam).values({ businessId: abc.id, userId: jordan.id, role: 'BUSINESS_OWNER' });
      }
    }

    // Ensure at least one venue & promo exist cleanly
    const venueCount = await db.select({ count: sql<number>`count(*)` }).from(venues);
    if (Number(venueCount[0].count) === 0 && abc) {
      await db.insert(venues).values({
        businessId: abc.id,
        name: 'Constitution Hill Pavilion',
        description: 'Open-air amphitheatre and cultural precinct in Johannesburg.',
        address: '11 Kotze St, Braamfontein',
        city: 'Johannesburg',
        province: 'Gauteng',
        country: 'South Africa',
        capacity: 1200,
      });
    }

    await db
      .insert(promoCodes)
      .values({ code: 'SUMMER20', discountPercent: 20, discountCents: 0, active: 1 })
      .onConflictDoNothing();

    // Ensure published events have valid priceCents
    const evtCount = await db.select({ count: sql<number>`count(*)` }).from(events);
    if (Number(evtCount[0].count) === 0 && abc) {
      const [createdEvt] = await db
        .insert(events)
        .values({
          businessId: abc.id,
          name: 'Johannesburg Waterfront Live',
          slug: 'johannesburg-waterfront-live-1',
          description: 'Flagship music, food, and tech gathering.',
          dateText: '18 Dec 2026',
          startTime: '14:00',
          endTime: '23:00',
          city: 'Johannesburg',
          province: 'Gauteng',
          country: 'South Africa',
          category: 'Music & Festivals',
          ageRestriction: '18+',
          status: 'PUBLISHED',
          isFeatured: 1,
        })
        .returning();
      await db.insert(ticketTypes).values({
        eventId: createdEvt.id,
        name: 'General Admission',
        description: 'Full festival access',
        price: 250,
        priceCents: 25000,
        quantity: 300,
        remaining: 300,
        status: 'ACTIVE',
      });
    }
  } catch (err) {
    console.error('[Database] Startup initialization warning:', err);
  }
}

ensureDefaultsAndPasswords();

// Register API modules
registerPublicRoutes(app);
registerBusinessRoutes(app);
registerAdminRoutes(app);

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, currency: 'ZAR', paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY) });
});

// Serve frontend static / Vite middleware
const port = 3000;
const server = http.createServer(app);

let vite: any;
if (!isProduction) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server,
        protocol: 'wss',
        clientPort: 443,
      },
    },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(import.meta.dirname, 'dist/public')));
}

app.use(async (req, res, next) => {
  const url = req.originalUrl;
  try {
    if (!isProduction && vite) {
      const template = fs.readFileSync(path.resolve(import.meta.dirname, 'index.html'), 'utf-8');
      const html = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } else {
      res.sendFile(path.resolve(import.meta.dirname, 'dist/public/index.html'));
    }
  } catch (e) {
    next(e);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[Server] Running in fullstack mode at http://0.0.0.0:${port}`);
});
