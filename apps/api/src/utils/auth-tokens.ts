import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { authTokens } from '@constella/db';

export type AuthTokenPurpose = 'email_verification' | 'password_reset' | 'telegram_link';

/**
 * `auth_tokens.purpose` у SQL — `text` без CHECK (`0007_privacy_auth_photos.sql:11`),
 * обмеження живе лише в `$type`, тому новий purpose не потребує міграції.
 */
const TTL_MS: Record<AuthTokenPurpose, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  telegram_link: 10 * 60 * 1000,
};

export const hashOpaqueToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Видає одноразовий код і гасить попередні активні токени того самого призначення. */
export const issueAuthToken = async (db: any, userId: string, purpose: AuthTokenPurpose): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({
    userId,
    tokenHash: hashOpaqueToken(token),
    purpose,
    expiresAt: new Date(now.getTime() + TTL_MS[purpose]),
  });
  return token;
};

/**
 * Одноразове зняття кода. Рядок спершу читається, а потім перезапизується з умовою
 * `usedAt IS NULL` — два паралельні `/start link-<code>` ботом отримають користувача
 * лише один раз, другий просто не знаходить рядка.
 */
export const consumeAuthToken = async (
  db: any,
  token: string,
  purpose: AuthTokenPurpose,
): Promise<{ userId: string } | null> => {
  const now = new Date();
  const [row] = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashOpaqueToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [claimed] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
    .returning({ userId: authTokens.userId });
  return claimed ? { userId: claimed.userId as string } : null;
};
