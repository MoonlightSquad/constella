import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/constella';
const { recommendationFeedbackSchema } = await import('./router.js');

describe('recommendation feedback input', () => {
  const profileId = '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607';

  it('accepts one of the structured feedback reasons', () => {
    assert.equal(recommendationFeedbackSchema.safeParse({ profileId, reason: 'distance' }).success, true);
  });

  it('rejects free-form reasons and malformed profile ids', () => {
    assert.equal(recommendationFeedbackSchema.safeParse({ profileId, reason: 'personal text' }).success, false);
    assert.equal(recommendationFeedbackSchema.safeParse({ profileId: 'not-a-uuid', reason: 'other' }).success, false);
  });
});
