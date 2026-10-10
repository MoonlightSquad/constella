import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isConfiguredTelegramWebhookSecret, isValidTelegramWebhookSecret } from './telegram-webhook.js';

const validSecret = '0123456789abcdef0123456789abcdef';

describe('Telegram webhook secret validation', () => {
  it('accepts a valid Telegram secret token', () => {
    assert.equal(isConfiguredTelegramWebhookSecret(validSecret), true);
    assert.equal(isValidTelegramWebhookSecret(validSecret, validSecret), true);
  });

  it('rejects missing, malformed, or mismatched secrets', () => {
    assert.equal(isConfiguredTelegramWebhookSecret(undefined), false);
    assert.equal(isConfiguredTelegramWebhookSecret('short'), false);
    assert.equal(isConfiguredTelegramWebhookSecret(`${validSecret}!`), false);
    assert.equal(isValidTelegramWebhookSecret(validSecret, undefined), false);
    assert.equal(isValidTelegramWebhookSecret(validSecret, `${validSecret}x`), false);
    assert.equal(isValidTelegramWebhookSecret(validSecret, 'fedcba9876543210fedcba9876543210'), false);
  });
});
