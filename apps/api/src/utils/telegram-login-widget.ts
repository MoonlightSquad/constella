import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramLoginWidgetPayload extends Record<string, string | number | boolean> {
  id: number;
  auth_date: number;
  hash: string;
  first_name: string;
}

const MAX_AUTH_AGE_SECONDS = 10 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 30;

export const verifyTelegramLoginWidget = (
  payload: TelegramLoginWidgetPayload,
  botToken: string,
  now = Date.now(),
) => {
  if (!botToken || !/^[a-f\d]{64}$/i.test(payload.hash)) {
    throw new Error('Telegram account verification failed.');
  }

  const ageSeconds = Math.floor(now / 1000) - payload.auth_date;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS || ageSeconds < -FUTURE_CLOCK_SKEW_SECONDS) {
    throw new Error('Telegram account verification expired. Please try again.');
  }

  const dataCheckString = Object.entries(payload)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const providedHash = Buffer.from(payload.hash, 'hex');

  if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) {
    throw new Error('Telegram account verification failed.');
  }

  return { telegramId: payload.id };
};
