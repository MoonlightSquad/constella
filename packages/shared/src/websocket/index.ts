/**
 * @module @constella/shared/websocket
 * @description WebSocket payload definitions and server-side broadcast helpers.
 *
 * Used by:
 *  - client (apps/web)   – render chat messages, typing, read receipts and call
 *    signalling pushed from the API over `/api/chat/ws`.
 *  - API (apps/api)      – mounts `/api/chat/ws`, persists inbound
 *    `send.*` frames, and broadcasts the matching `chat.*` / `presence.*`
 *    events to every socket attached to the match. The tRPC layer reuses the
 *    same broadcast helpers so messages sent over HTTP reach live sockets too.
 *
 * @see {@link https://github.com/MoonlightSquad/constella/blob/test/apps/api/src/index.ts}
 * @see {@link https://github.com/MoonlightSquad/constella/blob/test/apps/web/components/ConstellaDashboard.vue}
 */

export * from './server.js';
export * from './types.js';
