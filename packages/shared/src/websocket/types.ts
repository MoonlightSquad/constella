/**
 * @module @constella/shared/websocket/types
 * @description Canonical payload & routing types shared by client and API.
 *
 * These types are deliberately free of any `fastify` / `ws` imports so that the
 * shared package can be consumed without pulling in a server framework. The
 * {@link ChatSocket} interface is the structural contract every WebSocket
 * implementation used by the API must satisfy.
 */

/**
 * Minimal structural contract for a live WebSocket connection.
 *
 * `@fastify/websocket` hands the raw `ws` socket to route handlers, which
 * provides exactly this surface. Declaring it structurally keeps
 * `packages/shared` framework-agnostic while still catching typos such as
 * calling the non-existent `.payload()` instead of `.send()`.
 */
export interface ChatSocket {
  /** `ws` readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED. */
  readonly readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
}

/** `readyState` value indicating an open, writable socket. */
export const CHAT_SOCKET_OPEN = 1;

/** Terminals after which a call row never changes status again. */
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

/** Why a call stopped; `missed` is what the callee sees as a missed-call entry. */
export type CallEndReason = 'ended' | 'missed' | 'rejected' | 'failed';

/**
 * Call control frames pushed over the chat socket. Media negotiation itself
 * happens inside the LiveKit SDK, so these carry no SDP/ICE — only lifecycle.
 */
export type CallWsEvent = 'call.incoming' | 'call.accepted' | 'call.rejected' | 'call.ended';

export interface CallSignal {
  type: CallWsEvent;
  matchId: string;
  roomId: string;
  callType: 'audio' | 'video';
  /** The participant that caused the event (caller for `incoming`, callee otherwise). */
  fromId: string;
  fromName?: string;
  reason?: CallEndReason;
  durationSec?: number;
}

export interface ClientPayload {
  type: 'send.message' | 'send.typing' | 'send.read' | 'send.linked' | 'send.media' | 'send.pin';
  matchId: string;
  senderId?: string;
  body?: string;
  messageId?: string;
  kind?: 'image' | 'video';
  url?: string;
  fileName?: string;
  size?: number;
  localPath?: string;
  icon?: string;
  /** TTL in seconds (IPTV / partner systems) */
  ttl?: number;
  tag?: string;
}

export interface ChatMessageDB {
  id: string;
  matchId: string;
  senderId: string;
  kind: 'text' | 'system' | 'contact' | 'gift' | 'voice' | 'video' | 'image' | 'call';
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface ChatWsClient {
  conn: ChatSocket;
  userId?: string;
  matchId?: string;
  send: (payload: ClientPayload) => void;
  isClosed: () => boolean;
}

/** Room registry keyed by user id -> map of matchId -> client */
export interface RoomRegistry {
  get: (userId: string) => Map<string, ChatWsClient>;
  set: (userId: string, room: Map<string, ChatWsClient>) => void;
  delete: (userId: string, matchId: string) => boolean;
}
