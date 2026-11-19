import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users, businessTeam, platformTeam } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthUserContext {
  id: number;
  uid: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  city: string | null;
  emailVerified: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUserContext;
      cartSessionId?: string;
    }
  }
}

const getAuthSecret = (): string => {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET;
  }
  const seed = [
    process.env.SQL_HOST || 'local',
    process.env.SQL_DB_NAME || 'ticketing',
    process.env.SQL_USER || 'user',
    'event-marketplace-hmac-v1',
  ].join(':');
  return crypto.createHash('sha256').update(seed).digest('hex');
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const [, salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

interface TokenPayload {
  uid: string;
  email: string;
  exp: number;
}

export function signSessionToken(uid: string, email: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload: TokenPayload = {
    uid,
    email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(encoded).digest('base64url');
  return `eh.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  if (!token.startsWith('eh.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getAuthSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as TokenPayload;
    if (!decoded.uid || !decoded.email || !decoded.exp) return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie('eh_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie('eh_session', { path: '/' });
}

export function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token && token !== 'null' && token !== 'undefined') return token;
  }
  const cookies = parseCookies(req);
  return cookies.eh_session || null;
}

export async function resolveAuthUser(req: Request): Promise<AuthUserContext | null> {
  const token = extractBearerOrCookieToken(req);
  if (!token) return null;

  // 1. Verify HMAC-signed first-party session token
  if (token.startsWith('eh.')) {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    const [dbUser] = await db.select().from(users).where(eq(users.uid, payload.uid));
    if (!dbUser) return null;
    return {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      role: dbUser.role,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      phone: dbUser.phone,
      city: dbUser.city,
      emailVerified: dbUser.emailVerified,
    };
  }

  // 2. Verify authentic Firebase ID token (for Google Sign-In / Firebase Auth)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();
    let [dbUser] = await db.select().from(users).where(eq(users.uid, uid));
    if (!dbUser && email) {
      const [existingByEmail] = await db.select().from(users).where(eq(users.email, email));
      if (existingByEmail) {
        [dbUser] = await db
          .update(users)
          .set({ uid, emailVerified: decoded.email_verified ? 1 : existingByEmail.emailVerified, updatedAt: new Date() })
          .where(eq(users.id, existingByEmail.id))
          .returning();
      }
    }
    if (!dbUser) {
      const names = (decoded.name || '').trim().split(/\s+/);
      const firstName = names[0] || 'Guest';
      const lastName = names.slice(1).join(' ') || '';
      [dbUser] = await db
        .insert(users)
        .values({
          uid,
          email: email || `${uid}@firebase.local`,
          role: 'attendee',
          firstName,
          lastName,
          emailVerified: decoded.email_verified ? 1 : 0,
        })
        .returning();
    }
    return {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      role: dbUser.role,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      phone: dbUser.phone,
      city: dbUser.city,
      emailVerified: dbUser.emailVerified,
    };
  } catch {
    return null;
  }
}

export const attachCartSession = (req: Request, res: Response, next: NextFunction) => {
  const cookies = parseCookies(req);
  const headerSession = (req.headers['x-cart-session'] as string | undefined)?.trim();
  let sessionId = headerSession || cookies.eh_cart;
  if (!sessionId || sessionId.length < 8) {
    sessionId = `cs_${crypto.randomBytes(16).toString('hex')}`;
    res.cookie('eh_cart', sessionId, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  req.cartSessionId = sessionId;
  next();
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  req.authUser = (await resolveAuthUser(req)) || undefined;
  next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const user = await resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  req.authUser = user;
  next();
};

export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.authUser || (await resolveAuthUser(req));
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.authUser = user;

  const [pTeam] = await db.select().from(platformTeam).where(eq(platformTeam.userId, user.id));
  if (!pTeam || !['SUPER_ADMIN', 'ADMIN'].includes(pTeam.role)) {
    return res.status(403).json({ error: 'Forbidden: Super Admin privileges required.' });
  }
  next();
};

export const requireBusinessMember = (allowedRoles?: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.authUser || (await resolveAuthUser(req));
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    req.authUser = user;

    const rawBizId = req.query.businessId ?? req.body?.businessId ?? req.params.businessId;
    const bizId = Number(rawBizId);
    if (!Number.isInteger(bizId) || bizId <= 0) {
      return res.status(400).json({ error: 'Valid businessId is required.' });
    }

    const [membership] = await db
      .select()
      .from(businessTeam)
      .where(and(eq(businessTeam.businessId, bizId), eq(businessTeam.userId, user.id)));

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You do not belong to this business workspace.' });
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ error: `Forbidden: Requires role ${allowedRoles.join(' or ')}.` });
    }

    (req as any).businessMembership = membership;
    (req as any).businessId = bizId;
    next();
  };
};
