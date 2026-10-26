/**
 * @module realtime/ably
 * @description Ably REST: fan-out to browsers and short-lived channel tokens.
 *
 * The API runs on Vercel, where a process cannot hold a subscriber list — every
 * connection is pinned to whichever instance accepted it (see `realtime.ts`).
 * Ably is that shared bus: the server *publishes* over REST (one request, no
 * long-lived connection, so it survives serverless) and the browser *subscribes*
 * directly to Ably with a token scoped to a single match channel.
 *
 * Every function is best-effort like `push/notify.ts`: a failing Ably call is
 * logged, never thrown, because it must not take down the mutation that
 * triggered it (sending a message, starting a call).
 */

import { Rest } from 'ably';
import type { Auth, TokenRequest } from 'ably';
import { createLogger } from '@constella/shared';

const logger = createLogger('realtime-ably');

/** Channel prefix shared with the browser subscription in `useChat.ts`. */
export const ABLY_CHANNEL_PREFIX = 'match:';

/**
 * Publish deadline. Generous enough for a cold Ably round-trip, short enough
 * that a hung Ably cannot turn `startCall` into a three-second dial delay — the
 * request is awaited, because Vercel freezes the instance once the response is
 * flushed and an in-flight publish would die with it.
 */
const PUBLISH_TIMEOUT_MS = 1500;

/** Token lifetime: one hour, so a long chat session re-mints on reconnect. */
const TOKEN_TTL_MS = 3_600_000;

export const ablyChannelName = (matchId: string): string => `${ABLY_CHANNEL_PREFIX}${matchId}`;

/**
 * Ably keys are `appId.keyId:secret` — a dot inside the public half, one colon
 * before the secret. Anything else is a misconfiguration, and failing here is
 * far cheaper than a 401 from Ably inside the browser.
 */
const parseKey = (rawKey: string): { keyName: string; secret: string } | null => {
  const separator = rawKey.lastIndexOf(':');
  const keyName = rawKey.slice(0, separator);
  const secret = rawKey.slice(separator + 1);
  if (separator < 1 || !keyName.includes('.') || !secret) return null;
  return { keyName, secret };
};

const ablyKey = (): string | null => {
  const raw = process.env.ABLY_API_KEY;
  if (!raw) return null;
  return parseKey(raw) ? raw : null;
};

export const isAblyConfigured = (): boolean => ablyKey() !== null;

/**
 * Sandbox apps (the card-free tier used for local testing) only accept requests
 * on `sandbox-rest.ably.io`; published apps live on `rest.ably.io`.
 */
const restBase = (): string =>
  process.env.ABLY_ENVIRONMENT === 'sandbox' ? 'https://sandbox-rest.ably.io' : 'https://rest.ably.io';

/** Cached only to avoid rebuilding the signing context per frame — no sockets are held. */
let tokenIssuer: Auth | null = null;
let tokenIssuerKey = '';

const authContext = (rawKey: string): Auth | null => {
  if (!parseKey(rawKey)) return null;
  if (tokenIssuer && tokenIssuerKey === rawKey) return tokenIssuer;
  const rest = new Rest({ key: rawKey });
  tokenIssuer = rest.auth;
  tokenIssuerKey = rawKey;
  return tokenIssuer;
};

/**
 * Envelope published to a match channel. `actorId` replaces the `exceptUserId`
 * filter the socket registry uses: a shared channel cannot skip recipients, so
 * the client drops events it caused itself.
 */
export type AblyEnvelope = Record<string, unknown> & { type: string; actorId?: string | null };

/** Publish one envelope to the match channel. Returns whether Ably accepted it. */
export async function publishToMatch(matchId: string, envelope: AblyEnvelope): Promise<boolean> {
  const rawKey = ablyKey();
  if (!rawKey) return false;
  try {
    const response = await fetch(`${restBase()}/channels/${encodeURIComponent(ablyChannelName(matchId))}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(rawKey).toString('base64')}`,
      },
      body: JSON.stringify({ name: envelope.type, data: envelope }),
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn('Ably publish rejected', { status: response.status, matchId, type: envelope.type });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn('Ably publish failed', {
      matchId,
      type: envelope.type,
      message: error instanceof Error ? error.message : 'Unknown Ably error',
    });
    return false;
  }
}

/**
 * Token request for one browser on one channel. Signed locally by the SDK (the
 * MAC is a hash, not a network call) so the secret never reaches the client.
 *
 * `subscribe` only: a client cannot publish to a match channel, so every event
 * on the wire has been through our authorization checks.
 */
export async function createMatchTokenRequest(
  matchId: string,
  clientId: string,
): Promise<TokenRequest> {
  const rawKey = process.env.ABLY_API_KEY;
  if (!rawKey) throw new Error('ABLY_API_KEY is not configured.');
  const auth = authContext(rawKey);
  if (!auth) throw new Error('ABLY_API_KEY is malformed (expected appId.keyId:secret).');
  return auth.createTokenRequest({
    clientId,
    ttl: TOKEN_TTL_MS,
    capability: { [ablyChannelName(matchId)]: ['subscribe'] },
  });
}
