import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  bigint,
  boolean,
  bigserial,
  jsonb,
  doublePrecision,
  primaryKey,
  uniqueIndex,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const geographyPoint = customType<{ data: { lng: number; lat: number } }>({
  dataType() {
    return 'geography(Point,4326)';
  },
  toDriver(value) {
    return `POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value: unknown) {
    if (typeof value === 'string') {
      const match = value.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    }
    return { lng: 0, lat: 0 };
  },
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    birthdate: timestamp('birthdate', { mode: 'date' }).notNull(),
    displayName: text('display_name'),
    gender: text('gender').notNull(),
    lookingFor: text('looking_for').array().notNull(),
    city: text('city'),
    timeZone: text('time_zone').default('UTC').notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    bio: text('bio'),
    quote: text('quote'),
    promptOne: text('prompt_one'),
    promptTwo: text('prompt_two'),
    promptThree: text('prompt_three'),
    photos: text('photos').array().default(sql`'{}'::text[]`),
    interests: text('interests').array().default(sql`'{}'::text[]`),
    preferredRadiusKm: integer('preferred_radius_km').default(50).notNull(),
    ageMin: integer('age_min').default(18).notNull(),
    ageMax: integer('age_max').default(99).notNull(),
    geo: geographyPoint('geo'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    locationOverrideCity: text('location_override_city'),
    locationOverrideLat: doublePrecision('location_override_lat'),
    locationOverrideLng: doublePrecision('location_override_lng'),
    xp: integer('xp').default(0).notNull(),
    level: integer('level').default(1).notNull(),
    streakCount: integer('streak_count').default(0).notNull(),
    streakUpdatedOn: date('streak_updated_on', { mode: 'string' }),
    streakFreezes: integer('streak_freezes').default(0).notNull(),
    superlikeBalance: integer('superlike_balance').default(0).notNull(),
    dailyLikesUsed: integer('daily_likes_used').default(0).notNull(),
    dailyLikesOn: date('daily_likes_on', { mode: 'string' }),
    lastPassProfileId: uuid('last_pass_profile_id'),
    incognitoUntil: timestamp('incognito_until', { withTimezone: true }),
    telegramUsername: text('telegram_username'),
    sessionVersion: integer('session_version').default(0).notNull(),
    referralCode: text('referral_code'),
    referredByUserId: uuid('referred_by_user_id'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    bannedAt: timestamp('banned_at', { withTimezone: true }),
    shadowbannedAt: timestamp('shadowbanned_at', { withTimezone: true }),
  },
  (table) => ({
    referralUnique: uniqueIndex('users_referral_code_unique').on(table.referralCode),
  })
);

export const identities = pgTable(
  'identities',
  {
    provider: text('provider').notNull(),
    providerUid: text('provider_uid').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerUid] }),
  })
);

export const webCredentials = pgTable(
  'web_credentials',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  },
  (table) => ({
    emailUnique: uniqueIndex('web_credentials_email_unique').on(table.email),
  })
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose').$type<'email_verification' | 'password_reset'>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex('auth_tokens_hash_unique').on(table.tokenHash),
    userPurposeIdx: index('auth_tokens_user_purpose_idx').on(table.userId, table.purpose),
  })
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tokenUnique: uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    userIdx: index('refresh_tokens_user_idx').on(table.userId),
  })
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    payload: text('payload').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    telegramUserId: text('telegram_user_id').notNull(),
    sku: text('sku').notNull(),
    plan: text('plan').$type<'vip' | 'plus' | 'prime'>(),
    currency: text('currency').default('XTR').notNull(),
    totalAmount: integer('total_amount').notNull(),
    status: text('status').$type<'pending' | 'paid' | 'failed' | 'cancelled'>().default('pending').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    payloadUnique: uniqueIndex('payment_intents_payload_unique').on(table.payload),
  })
);

export const telegramStarPayments = pgTable(
  'telegram_star_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntents.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    telegramPaymentChargeId: text('telegram_payment_charge_id').notNull(),
    providerPaymentChargeId: text('provider_payment_charge_id').default('').notNull(),
    currency: text('currency').notNull(),
    totalAmount: integer('total_amount').notNull(),
    isRecurring: boolean('is_recurring').default(false).notNull(),
    isFirstRecurring: boolean('is_first_recurring').default(false).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    chargeUnique: uniqueIndex('telegram_star_payments_charge_unique').on(table.telegramPaymentChargeId),
  })
);

export const userEntitlements = pgTable('user_entitlements', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
  plan: text('plan').$type<'vip' | 'plus' | 'prime'>().notNull(),
  source: text('source').$type<'stars'>().notNull(),
  status: text('status').$type<'active' | 'cancelled' | 'expired'>().default('active').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  telegramSubscriptionChargeId: text('telegram_subscription_charge_id'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userBoosts = pgTable('user_boosts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const gifts = pgTable('gifts', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromId: uuid('from_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  toId: uuid('to_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  sku: text('sku').notNull(),
  stars: integer('stars').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const swipes = pgTable(
  'swipes',
  {
    fromId: uuid('from_id').references(() => users.id).notNull(),
    toId: uuid('to_id').references(() => users.id).notNull(),
    kind: text('kind').$type<'spark' | 'super' | 'pass'>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fromId, table.toId] }),
    toKindIdx: index('swipes_to_kind_idx').on(table.toId, table.kind),
  })
);

export const dailyOrbitProfiles = pgTable(
  'daily_orbit_profiles',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    profileId: uuid('profile_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    orbitDate: date('orbit_date', { mode: 'string' }).notNull(),
    position: integer('position').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.profileId, table.orbitDate] }),
    uniquePosition: uniqueIndex('daily_orbit_user_date_position_unique').on(
      table.userId,
      table.orbitDate,
      table.position
    ),
  })
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userOneId: uuid('user_one_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    userTwoId: uuid('user_two_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex('matches_user_pair_unique').on(table.userOneId, table.userTwoId),
  })
);

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').$type<'text' | 'system' | 'contact' | 'gift' | 'voice' | 'call'>().default('text').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
});

export const contactShares = pgTable(
  'contact_shares',
  {
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    telegramUsername: text('telegram_username').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.matchId, table.userId] }),
  })
);

export const blockedUsers = pgTable(
  'blocked_users',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    blockedUserId: uuid('blocked_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.blockedUserId] }),
  })
);

export const reports = pgTable('reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
  reason: text('reason').$type<'spam' | 'harassment' | 'fake_profile' | 'underage' | 'other'>().notNull(),
  details: text('details'),
  status: text('status').default('open').notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  moderatorNote: text('moderator_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    reportId: bigint('report_id', { mode: 'number' }).references(() => reports.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorIdx: index('admin_audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    targetIdx: index('admin_audit_logs_target_idx').on(table.targetUserId, table.createdAt),
    createdIdx: index('admin_audit_logs_created_idx').on(table.createdAt),
  })
);

export const photoAssets = pgTable(
  'photo_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    originalKey: text('original_key').notNull(),
    imageKey: text('image_key').notNull(),
    publicUrl: text('public_url').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    moderationStatus: text('moderation_status').$type<'pending' | 'approved' | 'rejected'>().default('pending').notNull(),
    moderationScore: doublePrecision('moderation_score'),
    moderationProvider: text('moderation_provider'),
    moderatedByUserId: uuid('moderated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    moderationNote: text('moderation_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  },
  (table) => ({
    imageKeyUnique: uniqueIndex('photo_assets_image_key_unique').on(table.imageKey),
    userStatusIdx: index('photo_assets_user_status_idx').on(table.userId, table.moderationStatus),
    moderationQueueIdx: index('photo_assets_moderation_queue_idx').on(table.moderationStatus, table.createdAt),
  })
);

export const events = pgTable('events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id').references(() => users.id).notNull(),
    code: text('code').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.code] }),
  })
);

export const questProgress = pgTable(
  'quest_progress',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    code: text('code').notNull(),
    periodKey: text('period_key').notNull(),
    progress: integer('progress').default(0).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.code, table.periodKey] }),
  })
);


export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  subject: text('subject').notNull(),
  category: text('category').notNull().default('general'),
  status: text('status').$type<'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'>().default('open').notNull(),
  priority: text('priority').$type<'normal' | 'high'>().default('normal').notNull(),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => ({
  ownerIdx: index('support_tickets_user_updated_idx').on(table.userId, table.updatedAt),
  queueIdx: index('support_tickets_status_updated_idx').on(table.status, table.updatedAt),
}));

export const supportMessages = pgTable('support_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorRole: text('author_role').$type<'user' | 'support'>().notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  ticketIdx: index('support_messages_ticket_created_idx').on(table.ticketId, table.createdAt),
}));
