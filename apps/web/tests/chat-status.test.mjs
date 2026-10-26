import assert from 'node:assert/strict';
import test from 'node:test';
import { messageTickOf, TICK_GLYPH, TICK_LABEL_KEY } from '../composables/chat-status.mjs';

const MINE = 'u-me';
const mine = (patch = {}) => ({ senderId: MINE, deliveredAt: null, readAt: null, ...patch });

test('a peer message never gets a tick', () => {
  assert.equal(messageTickOf({ senderId: 'u-peer', deliveredAt: null, readAt: null }, MINE), null);
  // Read receipts for the peer's own row must not leak into our bubble either.
  assert.equal(messageTickOf({ senderId: 'u-peer', readAt: '2026-10-26T10:00:00Z' }, MINE), null);
});

test('a local row awaits the server before it may claim anything', () => {
  assert.equal(messageTickOf(mine({ pending: true }), MINE), 'pending');
});

test('stored, delivered and read are three separate facts', () => {
  assert.equal(messageTickOf(mine(), MINE), 'sent');
  assert.equal(messageTickOf(mine({ deliveredAt: '2026-10-26T10:00:00Z' }), MINE), 'delivered');
  assert.equal(
    messageTickOf(mine({ deliveredAt: '2026-10-26T10:00:00Z', readAt: '2026-10-26T10:00:05Z' }), MINE),
    'read',
  );
});

test('a read that backfilled delivery still reports read, not the grey pair', () => {
  // `markMessagesRead` COALESCEs `delivered_at`, so both columns arrive in one row.
  assert.equal(messageTickOf(mine({ deliveredAt: 'x', readAt: 'x' }), MINE), 'read');
});

test('every state has a glyph and a translation key', () => {
  for (const state of ['pending', 'sent', 'delivered', 'read']) {
    assert.ok(TICK_GLYPH[state], `glyph for ${state}`);
    assert.ok(TICK_LABEL_KEY[state], `label for ${state}`);
  }
  assert.equal(TICK_GLYPH.delivered, '✓✓');
  assert.equal(TICK_GLYPH.read, '✓✓');
});

test('no row, no crash', () => {
  assert.equal(messageTickOf(undefined, MINE), null);
  assert.equal(messageTickOf(null, MINE), null);
  assert.equal(messageTickOf(mine(), undefined), null);
});
