/**
 * @module call/livekit
 * @description LiveKit Cloud access tokens for 1:1 calls.
 *
 * Rooms are not created over REST: the first participant to connect creates the
 * room, and LiveKit closes it once it is empty. That keeps the whole call
 * feature inside `AccessToken` signing — no outbound HTTP from a serverless
 * handler, and no SDP/ICE/TURN signalling of our own.
 */

import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { createLogger } from '@constella/shared';

const logger = createLogger('call');

/** Lifetime of a minted token — comfortably longer than a call, short enough to be useless later. */
const TOKEN_TTL = '2h';

export const isCallProviderConfigured = (): boolean =>
  Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);

/** `wss://…livekit.cloud`; throws instead of silently handing the browser a bad endpoint. */
export const callUrl = (): string => {
  const url = process.env.LIVEKIT_URL;
  if (!url) throw new Error('LIVEKIT_URL is not configured.');
  return url;
};

/**
 * Nonce per dial, so two calls inside the same match never collide on the
 * deterministic room name a caller could guess.
 */
export const newCallRoomId = (matchId: string): string =>
  `constella-call-${matchId}-${randomUUID().slice(0, 8)}`;

export const createCallToken = async (params: {
  room: string;
  identity: string;
  name?: string;
}): Promise<string> => {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!key || !secret) {
    logger.warn('LiveKit credentials are missing, call token cannot be signed');
    throw new Error('Call provider is not configured.');
  }

  const token = new AccessToken(key, secret, { identity: params.identity, name: params.name, ttl: TOKEN_TTL });
  token.addGrant({ room: params.room, roomJoin: true, roomCreate: true, canPublish: true, canSubscribe: true });
  return token.toJwt();
};
