import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WebLoginSchema, WebPasswordResetSchema, WebRegisterSchema } from './auth.js';

describe('web authentication schemas', () => {
  it('normalizes registration email and requires matching password and consent', () => {
    const result = WebRegisterSchema.safeParse({
      email: 'TEST@Example.COM',
      password: 'Constella-password-2026',
      confirmPassword: 'Constella-password-2026',
      acceptedTerms: true,
    });

    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.email, 'test@example.com');
  });

  it('rejects weak passwords, mismatches and missing consent', () => {
    const weak = WebRegisterSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      confirmPassword: 'different',
      acceptedTerms: false,
    });
    assert.equal(weak.success, false);
  });

  it('normalizes login email', () => {
    const result = WebLoginSchema.safeParse({ email: 'USER@EXAMPLE.COM', password: 'a-password' });

    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.email, 'user@example.com');
  });
});


describe('password reset schema', () => {
  it('accepts a strong matching password and opaque token', () => {
    assert.equal(WebPasswordResetSchema.safeParse({
      token: 'x'.repeat(64),
      password: 'correct-horse-battery-staple',
      confirmPassword: 'correct-horse-battery-staple',
    }).success, true);
  });
  it('rejects weak or mismatching passwords', () => {
    assert.equal(WebPasswordResetSchema.safeParse({
      token: 'x'.repeat(64), password: 'too-short', confirmPassword: 'different',
    }).success, false);
  });
});
