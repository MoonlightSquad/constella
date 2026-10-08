import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSmtpConfiguration, isEmailDeliveryConfigured } from './email.js';

const env = (overrides: Record<string, string> = {}) => ({
  SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
  SMTP_USER: 'resend', SMTP_PASSWORD: 're_test_key',
  SMTP_FROM: 'Constella <no-reply@example.com>', ...overrides,
});

describe('SMTP email configuration', () => {
  it('recognizes complete provider credentials', () => {
    assert.equal(isEmailDeliveryConfigured(env()), true);
    assert.equal(isEmailDeliveryConfigured({ SMTP_HOST: 'smtp.resend.com' }), false);
  });
  it('uses Resend-compatible STARTTLS defaults', () => {
    const config = getSmtpConfiguration(env());
    assert.equal(config.host, 'smtp.resend.com');
    assert.equal(config.port, 587);
    assert.equal(config.secure, false);
    assert.deepEqual(config.auth, { user: 'resend', pass: 're_test_key' });
  });
  it('selects implicit TLS on port 465 and honors explicit secure flag', () => {
    assert.equal(getSmtpConfiguration(env({ SMTP_PORT: '465' })).secure, true);
    assert.equal(getSmtpConfiguration(env({ SMTP_PORT: '587', SMTP_SECURE: 'true' })).secure, true);
  });
  it('rejects missing credentials and invalid ports', () => {
    assert.throws(() => getSmtpConfiguration({ SMTP_HOST: 'smtp.resend.com' }), /must be configured/);
    assert.throws(() => getSmtpConfiguration(env({ SMTP_PORT: '65536' })), /valid port/);
    assert.throws(() => getSmtpConfiguration(env({ SMTP_PORT: 'invalid' })), /valid port/);
  });
});
