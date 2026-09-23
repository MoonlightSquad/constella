import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigserial,
  jsonb,
  primaryKey,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

// Кастомний тип для гео-координат (PostGIS)
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

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  birthdate: timestamp('birthdate', { mode: 'date' }).notNull(),
  gender: text('gender').notNull(),
  lookingFor: text('looking_for').array().notNull(),
  city: text('city'),
  geo: geographyPoint('geo'),
  xp: integer('xp').default(0).notNull(),
  level: integer('level').default(1).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
});

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

export const swipes = pgTable(
  'swipes',
  {
    fromId: uuid('from_id').references(() => users.id).notNull(),
    toId: uuid('to_id').references(() => users.id).notNull(),
    kind: text('kind').$type<'spark' | 'super' | 'pass'>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fromId, table.toId] }),
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