import { TRPCError } from '@trpc/server';
import { and, desc, eq, ne } from 'drizzle-orm';
import { photoAssets, users } from '@constella/db';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import {
  createPhotoUpload,
  createVoiceUpload,
  processPhotoUpload,
  processVoiceUpload,
  removePhotoObjects,
} from '../photos/storage.js';

const owned = (userId: string, photoId: string) => and(eq(photoAssets.userId, userId), eq(photoAssets.id, photoId));
const activePhotos = (ctx: any) => ctx.db.select({ id: photoAssets.id }).from(photoAssets)
  .where(and(eq(photoAssets.userId, ctx.user.id), ne(photoAssets.moderationStatus, 'rejected')));

export const photosRouter = router({
  mine: protectedProcedure.query(({ ctx }) => ctx.db.select({
    id: photoAssets.id, publicUrl: photoAssets.publicUrl, status: photoAssets.moderationStatus,
    note: photoAssets.moderationNote, createdAt: photoAssets.createdAt,
  }).from(photoAssets).where(eq(photoAssets.userId, ctx.user.id)).orderBy(desc(photoAssets.createdAt))),

  createUpload: protectedProcedure.input(z.object({ contentType: z.enum(['image/jpeg','image/png','image/webp']) }))
    .mutation(async ({ ctx, input }) => {
      if ((await activePhotos(ctx)).length >= 6) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum of 6 active photos.' });
      try { return await createPhotoUpload(ctx.user.id, input.contentType); }
      catch (e) { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: e instanceof Error ? e.message : 'Photo storage unavailable.' }); }
    }),

  confirmUpload: protectedProcedure.input(z.object({
    objectKey: z.string().min(1).max(512), contentType: z.enum(['image/jpeg','image/png','image/webp']),
  })).mutation(async ({ ctx, input }) => {
    if ((await activePhotos(ctx)).length >= 6) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum of 6 active photos.' });
    try {
      const processed = await processPhotoUpload(ctx.user.id, input.objectKey, input.contentType);
      const [asset] = await ctx.db.insert(photoAssets).values({
        userId: ctx.user.id, originalKey: input.objectKey, ...processed,
        moderationStatus: 'approved',
        moderationProvider: 'automatic',
        moderatedAt: new Date(),
      }).returning({ id: photoAssets.id, publicUrl: photoAssets.publicUrl, status: photoAssets.moderationStatus });
      const [user] = await ctx.db.select({ photos: users.photos }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      await ctx.db.update(users).set({ photos: [...(user?.photos ?? []), processed.publicUrl] }).where(eq(users.id, ctx.user.id));
      return asset;
    } catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Photo processing failed.' }); }
  }),

  createVoiceUpload: protectedProcedure.input(z.object({
    contentType: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']),
  })).mutation(async ({ ctx, input }) => {
    try {
      return await createVoiceUpload(ctx.user.id, input.contentType);
    } catch (e) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: e instanceof Error ? e.message : 'Voice storage unavailable.' });
    }
  }),

  confirmVoiceUpload: protectedProcedure.input(z.object({
    objectKey: z.string().min(1).max(512),
    contentType: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']),
  })).mutation(async ({ ctx, input }) => {
    try {
      return await processVoiceUpload(ctx.user.id, input.objectKey, input.contentType);
    } catch (e) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Voice processing failed.' });
    }
  }),

  remove: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [asset] = await ctx.db.select().from(photoAssets).where(owned(ctx.user.id, input.id)).limit(1);
    if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found.' });
    await removePhotoObjects([asset.imageKey]);
    await ctx.db.transaction(async (tx: any) => {
      await tx.delete(photoAssets).where(eq(photoAssets.id, asset.id));
      const [user] = await tx.select({ photos: users.photos }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      await tx.update(users).set({ photos: (user?.photos ?? []).filter((url: string) => url !== asset.publicUrl) }).where(eq(users.id, ctx.user.id));
    });
    return { ok: true };
  }),
});
