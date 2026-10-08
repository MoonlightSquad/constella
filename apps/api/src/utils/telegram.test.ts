import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyTelegramInitData } from './telegram.js';

const testBotToken = 'unit-test-bot-token';

const createInitData = (authDate: number) => {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    user: JSON.stringify({ id: 12345, first_name: 'Test User', username: 'test_user' }),
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(testBotToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
};

describe('verifyTelegramInitData', () => {
  it('accepts signed, recent Telegram initData', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = verifyTelegramInitData(createInitData(authDate), testBotToken);

    assert.equal(user.id, 12345);
    assert.equal(user.username, 'test_user');
  });

  it('rejects modified payloads and future auth_date values', () => {
    const now = Math.floor(Date.now() / 1000);
    const tampered = createInitData(now).replace('Test+User', 'Other+User');

    assert.throws(() => verifyTelegramInitData(tampered, testBotToken), /signature/);
    assert.throws(() => verifyTelegramInitData(createInitData(now + 60), testBotToken), /auth_date/);
  });

  it('rejects expired initData', () => {
    const expiredDate = Math.floor(Date.now() / 1000) - 86_401;

    assert.throws(() => verifyTelegramInitData(createInitData(expiredDate), testBotToken), /expired/);
  });
});