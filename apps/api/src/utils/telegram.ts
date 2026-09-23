import { createHmac, timingSafeEqual } from 'node:crypto';
import { TelegramUser, TelegramUserSchema } from '@constella/shared';

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 86400
): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  if (!hash) {
    throw new Error('Hash parameter is missing');
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const h1 = Buffer.from(calculatedHash, 'hex');
  const h2 = Buffer.from(hash, 'hex');

  if (h1.length !== h2.length || !timingSafeEqual(h1, h2)) {
    throw new Error('Invalid Telegram signature');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) {
    throw new Error('InitData is expired');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new Error('User field is missing');
  }

  const parsedUser = JSON.parse(userJson);
  const validationResult = TelegramUserSchema.safeParse(parsedUser);

  if (!validationResult.success) {
    throw new Error('Invalid user payload format');
  }

  return validationResult.data;
}