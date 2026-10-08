import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminSupportReplySchema, supportCreateSchema, supportQueueSchema, supportReplySchema } from './support.schemas.js';

const ticketId = '123e4567-e89b-12d3-a456-426614174000';

describe('support ticket input schemas', () => {
  it('trims subjects/messages and applies the default category', () => {
    const parsed = supportCreateSchema.parse({ subject: '  Need help  ', message: '  Please help me  ' });
    assert.equal(parsed.subject, 'Need help');
    assert.equal(parsed.message, 'Please help me');
    assert.equal(parsed.category, 'general');
  });
  it('rejects short subjects, empty messages, and unknown categories', () => {
    assert.equal(supportCreateSchema.safeParse({ subject: 'help', message: 'hello' }).success, false);
    assert.equal(supportCreateSchema.safeParse({ subject: 'Help needed', message: '  ' }).success, false);
    assert.equal(supportCreateSchema.safeParse({ subject: 'Help needed', message: 'hello', category: 'other' }).success, false);
  });
  it('bounds reply lengths and requires UUID ticket ids', () => {
    assert.equal(supportReplySchema.safeParse({ ticketId, body: 'reply' }).success, true);
    assert.equal(supportReplySchema.safeParse({ ticketId: 'bad', body: 'reply' }).success, false);
    assert.equal(supportReplySchema.safeParse({ ticketId, body: 'x'.repeat(5001) }).success, false);
  });
  it('applies queue defaults and bounds pagination', () => {
    assert.deepEqual(supportQueueSchema.parse({}), { status: 'open', limit: 50, offset: 0 });
    assert.equal(supportQueueSchema.safeParse({ limit: 101 }).success, false);
    assert.equal(supportQueueSchema.safeParse({ offset: -1 }).success, false);
    assert.equal(adminSupportReplySchema.parse({ ticketId, body: 'done' }).status, 'waiting_user');
  });
});
