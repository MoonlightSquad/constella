import { timingSafeEqual } from 'node:crypto';

const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export const isValidTelegramWebhookSecret = (expected: string | undefined, provided: unknown) => {
  if (!expected || !TELEGRAM_WEBHOOK_SECRET_PATTERN.test(expected) || typeof provided !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
};

export const isConfiguredTelegramWebhookSecret = (secret: string | undefined) =>
  Boolean(secret && TELEGRAM_WEBHOOK_SECRET_PATTERN.test(secret));
