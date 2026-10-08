import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProfileOnboardingSchema } from './profile.js';

describe('ProfileOnboardingSchema', () => {
  it('accepts a valid onboarding payload for a new user', () => {
    const payload = {
      birthdate: '2002-06-15',
      displayName: 'Alex',
      gender: 'woman',
      lookingFor: ['man'],
      city: 'Kyiv',
      timeZone: 'Europe/Kyiv',
      acceptedTerms: true,
      bio: 'Love long walks, good coffee, and honest conversations.',
      radiusKm: 50,
      promptOne: 'I plan the perfect evening around a good playlist and an open table.',
      promptTwo: 'My ideal weekend starts with a walk and ends with a story over coffee.',
      promptThree: 'I value curiosity, patience, and a little bit of chaos.',
      photos: [
        'https://example.com/photo-1.jpg',
        'https://example.com/photo-2.jpg',
      ],
    };

    const result = ProfileOnboardingSchema.safeParse(payload);
    assert.equal(result.success, true);
  });

  it('rejects underage profiles and missing required prompts', () => {
    const result = ProfileOnboardingSchema.safeParse({
      birthdate: '2012-01-01',
      displayName: 'Alex',
      gender: 'man',
      lookingFor: [],
      city: 'Lviv',
      timeZone: 'Not/AZone',
      acceptedTerms: true,
      bio: 'hi',
      radiusKm: 10,
      promptOne: '',
      promptTwo: '',
      promptThree: '',
      photos: ['https://example.com/photo-1.jpg'],
    });

    assert.equal(result.success, false);
  });
});
