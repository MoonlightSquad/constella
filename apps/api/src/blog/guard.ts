import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, users } from '@constella/db';
import { isConfiguredAdmin, type UserPayload } from '../trpc.js';

export type AdminAuth =
  | { ok: true; claims: UserPayload }
  | { ok: false; status: 401 | 403; error: string };

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;

/**
 * `sessionVersion` and `bannedAt` are not expressible in a signed JWT, so a token
 * stays valid until the account row says otherwise. The cache is the compromise:
 * a logout or a ban takes at most a minute to reach an open admin session, while a
 * single editor page load (session + list + preview) costs one database read.
 */
const decisions = new Map<string, { checkedAt: number; allowed: boolean }>();

const cachedDecision = (userId: string) => {
  const hit = decisions.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.checkedAt > CACHE_TTL_MS) {
    decisions.delete(userId);
    return null;
  }
  return hit.allowed;
};

const rememberDecision = (userId: string, allowed: boolean) => {
  if (decisions.size >= CACHE_MAX_ENTRIES) decisions.clear();
  decisions.set(userId, { checkedAt: Date.now(), allowed });
};

export const invalidateAdminSession = (userId: string) => {
  decisions.delete(userId);
};

export const requireAdminAuth = async (fastify: FastifyInstance, request: FastifyRequest): Promise<AdminAuth> => {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token.' };
  }

  let claims: UserPayload;
  try {
    claims = fastify.jwt.verify<UserPayload>(header.slice('Bearer '.length).trim());
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }
  if (!claims?.id || typeof claims.id !== 'string') {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }
  if (!isConfiguredAdmin(claims)) {
    return { ok: false, status: 403, error: 'Admin access is not configured for this account.' };
  }

  const cached = cachedDecision(claims.id);
  if (cached === true) return { ok: true, claims };
  if (cached === false) return { ok: false, status: 403, error: 'This account is currently restricted.' };

  const [account] = await db
    .select({ sessionVersion: users.sessionVersion, bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, claims.id))
    .limit(1);
  if (!account) return { ok: false, status: 401, error: 'Invalid or expired token.' };
  if ((claims.sessionVersion ?? 0) !== account.sessionVersion) {
    return { ok: false, status: 401, error: 'Session revoked. Sign in again.' };
  }
  if (account.bannedAt) {
    rememberDecision(claims.id, false);
    return { ok: false, status: 403, error: 'This account is currently restricted.' };
  }

  rememberDecision(claims.id, true);
  return { ok: true, claims };
};
