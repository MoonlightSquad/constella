import { z } from 'zod';

export const entitlementPlan = z.enum(['vip', 'plus', 'prime']);

export const grantVipSchema = z.object({
  userId: z.string().uuid(),
  days: z.number().int().min(1).max(365).default(30),
  reason: z.string().trim().min(8).max(500),
});

export const setEntitlementSchema = z.object({
  userId: z.string().uuid(),
  plan: entitlementPlan,
  days: z.number().int().min(1).max(365).default(30),
  reason: z.string().trim().min(8).max(500),
});

export const cancelEntitlementSchema = z.object({
  userId: z.string().uuid(),
  note: z.string().trim().min(8).max(500),
});

export const forceLogoutSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(8).max(500),
});

export const createAdminSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  reason: z.string().trim().min(8).max(500),
});

export const revokeAdminSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(8).max(500),
});

export const userContentSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export const metricsSchema = z.object({
  days: z.number().int().min(7).max(90).default(30),
});

/** `active` and `new` read `days` as a window; `all` and `vip` ignore it. */
export const pushAudience = z.enum(['all', 'active', 'new', 'vip']);

export const pushAudienceSchema = z.object({
  audience: pushAudience.default('active'),
  days: z.number().int().min(1).max(90).default(7),
});

// `dryRun` defaults to true: a broadcast cannot be recalled once it has left the device, so the
// dangerous direction of this switch has to be the one an admin has to ask for on purpose.
// A dry run writes nothing, so the audit reason is demanded only of the send that does.
export const pushBroadcastSchema = pushAudienceSchema.extend({
  title: z.string().trim().min(3).max(48),
  body: z.string().trim().min(3).max(240),
  reason: z.string().trim().max(500).default(''),
  dryRun: z.boolean().default(true),
}).refine((value) => value.dryRun || value.reason.length >= 8, {
  path: ['reason'],
  message: 'Справжня розсилка потребує причини щонайменше 8 символів.',
});

const isAdultBirthdate = (value: string) => {
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) return false;
  const now = new Date();
  const years = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday = now.getUTCMonth() > birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  return years - (hadBirthday ? 0 : 1) >= 18;
};

// Deliberately narrower than the onboarding schema: a moderator edits what a report or a
// support ticket showed to be wrong, never the account's state machine. `bannedAt`,
// `sessionVersion` and the plan live in their own procedures, each with its own audit row.
export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  city: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500),
  birthdate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthdate must be in YYYY-MM-DD format')
    .refine(isAdultBirthdate, 'A profile has to stay 18 or older'),
  photos: z.array(z.string().trim().url().refine((value) => new URL(value).protocol === 'https:', 'Photo links must use HTTPS')).min(1).max(6),
}).partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field has to be provided.',
});
