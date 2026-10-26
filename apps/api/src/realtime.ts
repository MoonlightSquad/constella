/**
 * @module realtime
 * @description Fan-out of chat and call events to the peers of one match.
 *
 * Two transports, always published together when configured:
 *
 *  - the in-memory registry below — sockets that attached to `/api/chat/ws`,
 *    which is how the mobile app receives events;
 *  - Ably (`realtime/ably.ts`) — the shared bus the browser subscribes to,
 *    because a Vercel instance cannot see the sockets of another instance.
 *
 * Delivery to Ably is awaited: Vercel freezes the instance as soon as the HTTP
 * response is flushed, and an unawaited publish would die mid-flight.
 */

import type { ChatSocket } from '@constella/shared';
import { broadcastToClients } from '@constella/shared';
import { isAblyConfigured, publishToMatch } from './realtime/ably.js';

/** A single authenticated socket attached to a match. */
export interface ChatConnection {
  conn: ChatSocket;
  userId: string;
  matchId: string;
}

/** `matchId` -> every socket currently attached to that match. */
const rooms = new Map<string, Set<ChatConnection>>();

/**
 * Registry adapter for the shared `broadcastToMatch` helper.
 * Exposed for tests and for callers that already hold a `matchId`.
 */
export const matchRegistry = {
  get: (matchId: string): Iterable<ChatConnection> | undefined => rooms.get(matchId),
};

/** Registers an open socket. A socket may be registered for several matches. */
export function registerConnection(connection: ChatConnection): void {
  let bucket = rooms.get(connection.matchId);
  if (!bucket) {
    bucket = new Set();
    rooms.set(connection.matchId, bucket);
  }
  bucket.add(connection);
}

/**
 * Removes a socket from a match and drops the bucket once empty so the map
 * does not accumulate stale entries for finished matches.
 */
export function unregisterConnection(connection: ChatConnection): void {
  const bucket = rooms.get(connection.matchId);
  if (!bucket) return;
  bucket.delete(connection);
  if (bucket.size === 0) rooms.delete(connection.matchId);
}

/**
 * Sends `payload` to every open socket in `matchId`, optionally skipping one
 * user (usually the actor, to avoid echoing an event back to its originator).
 *
 * @returns how many sockets accepted the payload.
 */
export function broadcastToMatch(
  matchId: string,
  payload: Record<string, unknown>,
  exceptUserId?: string | null,
): number {
  const bucket = rooms.get(matchId);
  if (!bucket) return 0;
  return broadcastToClients(bucket, payload, exceptUserId);
}

/**
 * Publish `payload` for `matchId` on every transport this deployment has: the
 * sockets in this process, plus the Ably channel the browsers listen on.
 *
 * Must be awaited. On Vercel the instance is frozen once the response is
 * flushed, so a fire-and-forget publish would be cut off mid-request.
 *
 * @returns how many local sockets accepted the payload (Ably is not counted).
 */
export async function deliverToMatch(
  matchId: string,
  payload: Record<string, unknown> & { type: string },
  exceptUserId?: string | null,
): Promise<number> {
  const delivered = broadcastToMatch(matchId, payload, exceptUserId);
  if (isAblyConfigured()) {
    // A shared channel cannot skip a recipient the way `exceptUserId` does for
    // sockets, so the actor is named in the envelope and filters itself out.
    await publishToMatch(matchId, { ...payload, actorId: exceptUserId ?? null });
  }
  return delivered;
}

/** Number of live sockets for a match; used by tests and health logging. */
export function connectionCount(matchId?: string): number {
  if (matchId) return rooms.get(matchId)?.size ?? 0;
  let total = 0;
  for (const bucket of rooms.values()) total += bucket.size;
  return total;
}

/** Clears every connection. Test-only — production relies on close handlers. */
export function resetConnections(): void {
  rooms.clear();
}