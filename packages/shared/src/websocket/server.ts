/**
 * @module @constella/shared/websocket/server
 * @description Server-side WebSocket helpers: per-client notify and room broadcast.
 *
 * These helpers are intentionally framework-agnostic — they operate on the
 * structural {@link ChatSocket} contract rather than a concrete fastify/ws type,
 * so `packages/shared` builds without a server-framework dependency. The API
 * (`apps/api`) owns route registration, authentication and the connection
 * registry; it wires those in when mounting `/api/chat/ws`.
 *
 * @example
 * // from an authenticated WS handler or the tRPC layer
 * import { notifyClient, broadcastToMatch } from '@constella/shared';
 * notifyClient(client, { type: 'chat.message', message });
 * broadcastToMatch(registry, matchId, { type: 'chat.typing' }, senderUserId);
 */

import type { ChatSocket } from './types.js';
import { CHAT_SOCKET_OPEN } from './types.js';

/** Anything carrying a socket plus its optional routing identity. */
export interface SocketClient {
  conn: ChatSocket;
  userId?: string | null;
  matchId?: string | null;
}

/**
 * Sends a typed payload to a single client.
 * Safe by construction: a no-op when the socket is missing or not OPEN, and
 * encode/send failures are swallowed so one bad socket never breaks a broadcast.
 *
 * @returns `true` when the payload was handed to an open socket.
 */
export function notifyClient<T extends Record<string, unknown>>(
  client: SocketClient | null | undefined,
  payload: T,
): boolean {
  if (!client?.conn || client.conn.readyState !== CHAT_SOCKET_OPEN) return false;
  try {
    client.conn.send(JSON.stringify(payload));
    return true;
  } catch {
    // A throw here means the socket died mid-send; the close handler will
    // clean up the registry entry, so there is nothing to recover.
    return false;
  }
}

/**
 * Sends a payload to every currently-open client in an iterable, optionally
 * skipping one user (typically the sender, so it does not echo to itself).
 *
 * @returns how many sockets accepted the payload.
 */
export function broadcastToClients<T extends Record<string, unknown>>(
  clients: Iterable<SocketClient>,
  payload: T,
  exceptUserId?: string | null,
): number {
  let delivered = 0;
  for (const client of clients) {
    if (exceptUserId && client.userId && client.userId === exceptUserId) continue;
    if (notifyClient(client, payload)) delivered += 1;
  }
  return delivered;
}

/**
 * Registry lookup contract for per-match rooms.
 *
 * Keyed by `matchId`; each value is the set of sockets currently attached to
 * that match. The API implements this over its in-memory room map.
 */
export interface MatchRegistry {
  get: (matchId: string) => Iterable<SocketClient> | undefined;
}

/**
 * Broadcasts a payload to every open socket attached to `matchId`, optionally
 * skipping one user. Unknown matches are a silent no-op (nobody is connected).
 *
 * @returns how many sockets accepted the payload.
 */
export function broadcastToMatch<T extends Record<string, unknown>>(
  registry: MatchRegistry,
  matchId: string,
  payload: T,
  exceptUserId?: string | null,
): number {
  const clients = registry.get(matchId);
  if (!clients) return 0;
  return broadcastToClients(clients, payload, exceptUserId);
}
