import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { events, photoAssets, userAchievements, users } from '@constella/db';
import { ProfileOnboardingSchema } from '@constella/shared';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { socialRouter } from './social.js';
import { billingRouter } from '../payments/router.js';
import { adminRouter } from './admin.js';
import { supportRouter } from './support.js';
import { photosRouter } from './photos.js';

const getAgeFromBirthdate = (value: string | Date) => {
  const birthdate = new Date(value);
  if (Number.isNaN(birthdate.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid birthdate' });
  }

  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  const dayDiff = today.getDate() - birthdate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
};

export const appRouter = router({
  social: socialRouter,
  billing: billingRouter,
  admin: adminRouter,
  support: supportRouter,
  photos: photosRouter,

  healthcheck: publicProcedure.query(() => {
    return { status: 'ok' };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);

    return {
      userId: ctx.user.id,
      telegramId: ctx.user.telegramId,
      onboardingComplete: Boolean(user?.onboardingCompletedAt),
      profile: user
        ? {
            city: user.city,
            birthdate: user.birthdate,
            displayName: user.displayName,
            bio: user.bio,
            gender: user.gender,
            lookingFor: user.lookingFor,
            timeZone: user.timeZone,
            photos: user.photos ?? [],
            promptOne: user.promptOne,
            promptTwo: user.promptTwo,
            promptThree: user.promptThree,
            preferredRadiusKm: user.preferredRadiusKm,
          }
        : null,
    };
  }),

  completeProfile: protectedProcedure.input(ProfileOnboardingSchema).mutation(async ({ ctx, input }) => {
    const age = getAgeFromBirthdate(input.birthdate);
    if (age < 18) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'User must be at least 18 years old.' });
    }

    const [currentUser] = await ctx.db.select({ photos: users.photos }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const approvedAssets = await ctx.db.select({ publicUrl: photoAssets.publicUrl }).from(photoAssets)
      .where(and(eq(photoAssets.userId, ctx.user.id), eq(photoAssets.moderationStatus, 'approved')));
    const allowedPhotoUrls = new Set([...(currentUser?.photos ?? []), ...approvedAssets.map((asset: { publicUrl: string }) => asset.publicUrl)]);
    if (input.photos.some((url) => !allowedPhotoUrls.has(url))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Profile photos must be uploaded to this account and approved by moderation.' });
    }

    const [updatedUser] = await ctx.db
      .update(users)
      .set({
        birthdate: new Date(input.birthdate),
        displayName: input.displayName,
        gender: input.gender,
        lookingFor: input.lookingFor,
        city: input.city,
        timeZone: input.timeZone,
        ...(input.acceptedTerms ? { termsAcceptedAt: new Date() } : {}),
        bio: input.bio,
        promptOne: input.promptOne,
        promptTwo: input.promptTwo,
        promptThree: input.promptThree,
        photos: input.photos,
        preferredRadiusKm: input.radiusKm,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id))
      .returning();

    if (updatedUser?.onboardingCompletedAt) {
      const [firstLight] = await ctx.db
        .insert(userAchievements)
        .values({ userId: ctx.user.id, code: 'first-light' })
        .onConflictDoNothing()
        .returning({ code: userAchievements.code });

      if (firstLight) {
        await ctx.db
          .update(users)
          .set({
            xp: sql`${users.xp} + 50`,
            level: sql`GREATEST(1, floor((${users.xp} + 50) / 250.0)::int + 1)`,
          })
          .where(eq(users.id, ctx.user.id));
        await ctx.db.insert(events).values({
          userId: ctx.user.id,
          type: 'profile_completed',
          meta: { achievement: 'first-light' },
        });
      }
    }

    return {
      ok: true,
      onboardingComplete: Boolean(updatedUser?.onboardingCompletedAt),
      profile: {
        city: updatedUser?.city ?? input.city,
        bio: updatedUser?.bio ?? input.bio,
        gender: updatedUser?.gender ?? input.gender,
        lookingFor: updatedUser?.lookingFor ?? input.lookingFor,
        photos: updatedUser?.photos ?? input.photos,
        preferredRadiusKm: updatedUser?.preferredRadiusKm ?? input.radiusKm,
      },
    };
  }),
});

export type AppRouter = typeof appRouter;