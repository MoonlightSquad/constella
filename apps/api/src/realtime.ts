/**
 * @module realtime
 * @description In-memory registry of live chat WebSocket connections.
 *
 * The registry is the single source of truth for "who is currently connected to
 * which match". Two call sites share it:
 *
 *  - the `/api/chat/ws` route handler in `index.ts`, which registers and
 *    unregisters connections as sockets open/close;
 *  - the tRPC layer (`routers/social.ts`), which broadcasts so that messages
 *    sent over plain HTTP still reach a peer that has a live socket.
 *
 * State is per-process. With more than one API replica, cross-replica delivery
 * needs a shared broker (see the known limitations in README.md).
 */

import type { ChatSocket } from '@constella/shared';
import { broadcastToClients } from '@constella/shared';

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