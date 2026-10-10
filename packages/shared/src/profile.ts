import { z } from 'zod';

export const genderEnum = z.enum(['woman', 'man', 'nonbinary', 'other']);
const profilePhotoSchema = z
  .string()
  .trim()
  .url('Each photo must be a valid URL')
  .refine((value) => new URL(value).protocol === 'https:', 'Photo links must use HTTPS');

export const ProfileOnboardingSchema = z
  .object({
    birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthdate must be in YYYY-MM-DD format'),
    displayName: z.string().trim().min(2, 'Name must be at least 2 characters').max(40),
    gender: genderEnum,
    lookingFor: z.array(genderEnum).min(1, 'Choose at least one target gender').max(3),
    city: z.string().trim().min(2, 'City is required').max(80),
    timeZone: z.string().trim().min(1).max(64).default('UTC'),
    acceptedTerms: z.boolean().default(false),
    bio: z.string().trim().max(500).default(''),
    radiusKm: z.number().int().min(1).max(500),
    quote: z.string().trim().max(80).optional().or(z.literal('')),
    interests: z.array(z.string().trim().min(2).max(32)).max(12).default([]),
    ageMin: z.number().int().min(18).max(99).default(18),
    ageMax: z.number().int().min(18).max(99).default(99),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    promptOne: z.string().trim().max(180).default(''),
    promptTwo: z.string().trim().max(180).default(''),
    promptThree: z.string().trim().max(180).default(''),
    photos: z.array(profilePhotoSchema).min(1, 'At least 1 photo is required').max(6),
  })
  .superRefine((value, ctx) => {
    const birth = new Date(value.birthdate);
    if (!Number.isNaN(birth.getTime()) && birth.toISOString().slice(0, 10) !== value.birthdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthdate'],
        message: 'Birthdate must be a real calendar date.',
      });
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeZone'],
        message: 'Choose a valid time zone.',
      });
    }

    const age = new Date().getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear =
      new Date().getMonth() < birth.getMonth() ||
      (new Date().getMonth() === birth.getMonth() && new Date().getDate() < birth.getDate());

    const computedAge = age - (hasHadBirthdayThisYear ? 1 : 0);

    if (Number.isNaN(birth.getTime()) || computedAge < 18) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthdate'],
        message: 'You must be at least 18 years old.',
      });
    }

    if (value.ageMin > value.ageMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ageMax'],
        message: 'Maximum age must be greater than or equal to minimum age.',
      });
    }
  });

export type ProfileOnboardingInput = z.infer<typeof ProfileOnboardingSchema>;
