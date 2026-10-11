import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyTelegramLoginWidget, type TelegramLoginWidgetPayload } from './telegram-login-widget.js';

const botToken = '123456:telegram-test-token';
const now = Date.UTC(2026, 9, 10, 12);

const signedPayload = (overrides: Partial<TelegramLoginWidgetPayload> = {}): TelegramLoginWidgetPayload => {
  const payload: TelegramLoginWidgetPayload = {
    id: 123456789,
    first_name: 'Constella',
    username: 'constella_test',
    auth_date: Math.floor(now / 1000),
    hash: '',
    ...overrides,
  };
  const dataCheckString = Object.entries(payload)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  payload.hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return payload;
};

describe('Telegram Login Widget verification', () => {
  it('accepts a valid signed payload and returns its Telegram ID', () => {
    assert.deepEqual(verifyTelegramLoginWidget(signedPayload(), botToken, now), { telegramId: 123456789 });
  });

  it('rejects tampered fields and a signature from another bot', () => {
    const payload = signedPayload();
    assert.throws(() => verifyTelegramLoginWidget({ ...payload, id: 987654321 }, botToken, now), /verification failed/);
    assert.throws(() => verifyTelegramLoginWidget(payload, '987654:another-bot-token', now), /verification failed/);
  });

  it('rejects missing tokens, malformed hashes, stale data, and future dates', () => {
    const payload = signedPayload();
    assert.throws(() => verifyTelegramLoginWidget(payload, '', now), /verification failed/);
    assert.throws(() => verifyTelegramLoginWidget({ ...payload, hash: 'invalid' }, botToken, now), /verification failed/);
    assert.throws(() => verifyTelegramLoginWidget(
      signedPayload({ auth_date: Math.floor(now / 1000) - 601 }),
      botToken,
      now,
    ), /expired/);
    assert.throws(() => verifyTelegramLoginWidget(
      signedPayload({ auth_date: Math.floor(now / 1000) + 31 }),
      botToken,
      now,
    ), /expired/);
  });
});
