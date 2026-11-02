import assert from 'node:assert/strict';
import test from 'node:test';
import { hitCooldown, parseSignup, subscriberPayload } from '../server/utils/newsletter.mjs';

test('a signup keeps only a normalized, deliverable address', () => {
  assert.deepEqual(parseSignup({ email: '  Marta.K@GMAIL.COM ' }), { kind: 'signup', email: 'marta.k@gmail.com' });
  for (const body of [null, undefined, 'email', {}, { email: 42 }, { email: 'no-at-sign' }, { email: 'a@b' }, { email: 'a@b.c' },
    { email: 'a b@c.de' }, { email: 'a,b@c.de' }, { email: 'a@b@c.de' }, { email: 'a@'.padEnd(300, 'x') }]) {
    assert.equal(parseSignup(body).kind, 'invalid', JSON.stringify(body));
  }
});

test('the honeypot answers before the address is even looked at', () => {
  assert.deepEqual(parseSignup({ email: 'not-an-email', website: 'spam' }), { kind: 'trap' });
  assert.equal(parseSignup({ email: 'a@b.de', website: '   ' }).kind, 'signup', 'whitespace is not a bot');
});

test('two submits from one address inside the window is the second one refused', () => {
  const store = new Map();
  const start = 1_000_000;
  assert.equal(hitCooldown(store, '203.0.113.7', start, 60_000), false);
  assert.equal(hitCooldown(store, '203.0.113.7', start + 59_000, 60_000), true);
  assert.equal(hitCooldown(store, '203.0.113.9', start + 1, 60_000), false, 'another address is not punished');
  assert.equal(hitCooldown(store, '203.0.113.7', start + 61_000, 60_000), false);
  assert.equal(store.size, 1, 'an expired entry is dropped instead of accumulating');
});

test('the subscriber payload asks for confirmation and carries no unknown keys', () => {
  assert.deepEqual(subscriberPayload('a@b.de', '203.0.113.7', '4243829086487936'), {
    email: 'a@b.de',
    groups: ['4243829086487936'],
    status: 'unconfirmed',
    ip_address: '203.0.113.7',
  });
  // A spoofed or absent X-Forwarded-For must not turn into a 422 from the ESP.
  assert.deepEqual(Object.keys(subscriberPayload('a@b.de', 'unknown', 'g')), ['email', 'groups', 'status']);
  assert.deepEqual(Object.keys(subscriberPayload('a@b.de', '300.300.300.300', 'g')), ['email', 'groups', 'status']);
});
