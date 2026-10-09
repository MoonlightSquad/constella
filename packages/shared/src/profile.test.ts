import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProfileOnboardingSchema } from './profile.js';

describe('ProfileOnboardingSchema', () => {
  it('accepts a profile with only the required onboarding fields and one photo', () => {
    const payload = {
      birthdate: '2002-06-15',
      displayName: 'Alex',
      gender: 'woman',
      lookingFor: ['man'],
      city: 'Kyiv',
      radiusKm: 50,
      photos: ['https://example.com/photo-1.jpg'],
    };

    const result = ProfileOnboardingSchema.safeParse(payload);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.timeZone, 'UTC');
      assert.equal(result.data.acceptedTerms, false);
      assert.equal(result.data.bio, '');
      assert.equal(result.data.promptOne, '');
      assert.equal(result.data.promptTwo, '');
      assert.equal(result.data.promptThree, '');
    }
  });

  it('rejects underage profiles', () => {
    const result = ProfileOnboardingSchema.safeParse({
      birthdate: '2012-01-01',
      displayName: 'Alex',
      gender: 'man',
      lookingFor: ['woman'],
      city: 'Lviv',
      radiusKm: 10,
      photos: ['https://example.com/photo-1.jpg'],
    });

    assert.equal(result.success, false);
  });

  it('requires a search target, radius, and at least one photo', () => {
    const base = {
      birthdate: '2002-06-15',
      displayName: 'Alex',
      gender: 'woman',
      lookingFor: ['man'],
      city: 'Kyiv',
      radiusKm: 50,
      photos: ['https://example.com/photo-1.jpg'],
    };

    assert.equal(ProfileOnboardingSchema.safeParse({ ...base, lookingFor: [] }).success, false);
    assert.equal(ProfileOnboardingSchema.safeParse({ ...base, photos: [] }).success, false);
    const { radiusKm: _radiusKm, ...withoutRadius } = base;
    assert.equal(ProfileOnboardingSchema.safeParse(withoutRadius).success, false);
  });
});
