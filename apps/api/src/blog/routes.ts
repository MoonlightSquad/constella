import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createLogger } from '@constella/shared';
import { requireAdminAuth } from './guard.js';
import {
  createPost,
  createTranslation,
  deletePost,
  getPostForAdmin,
  getPublishedPost,
  isUniqueViolation,
  listPostsForAdmin,
  listPublishedForSitemap,
  listPublishedPosts,
  listTags,
  setPostStatus,
  updatePost,
} from './queries.js';
import { createCoverUpload, isBlogCoverStorageConfigured, processCoverUpload, removeCoverObjects } from './storage.js';
import {
  adminListQuerySchema,
  coverConfirmSchema,
  coverUploadSchema,
  createPostSchema,
  publishStatusSchema,
  publicListQuerySchema,
  publicPostQuerySchema,
  translationSchema,
  updatePostSchema,
} from './schemas.js';

const logger = createLogger('blog');

const SLUG_PARAM = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;
const UUID_PARAM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Public blog reads are served by the landing's server, never by a browser, so a short
// shared-cache TTL is enough to keep ISR cheap without stale drafts.
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const badRequest = (reply: FastifyReply, error: z.ZodError) => {
  const first = error.issues[0];
  return reply.status(400).send({ error: first?.message ?? 'Invalid request.', path: first?.path });
};

const fail = async (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
  const statusCode = (error as { statusCode?: number })?.statusCode ?? 0;
  if (statusCode >= 400 && statusCode < 500) return reply.status(statusCode).send({ error: (error as Error).message });
  if (isUniqueViolation(error)) {
    return reply.status(409).send({ error: 'A post with this slug already exists in that language.' });
  }
  request.log.error({ err: error }, 'Blog request failed.');
  return reply.status(500).send({ error: 'Blog storage is unavailable.' });
};

const parseParams = <T extends z.ZodTypeAny>(schema: T, value: unknown) => schema.parse(value) as z.infer<T>;

const routeParams = z.object({ slug: z.string().max(200) });
const postIdParams = z.object({ id: z.string() });

export const registerBlogRoutes = (fastify: FastifyInstance) => {
  const admin = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireAdminAuth(fastify, request);
    if (!auth.ok) {
      reply.status(auth.status).send({ error: auth.error });
      return null;
    }
    return auth.claims;
  };

  fastify.get(
    '/blog/posts',
    { schema: { tags: ['Blog'], summary: 'List published posts in one language', querystring: { type: 'object', properties: { locale: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] }, tag: { type: 'string' }, limit: { type: 'integer' }, cursor: { type: 'string' } } } } },
    async (request, reply) => {
      const parsed = publicListQuerySchema.safeParse(request.query);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        reply.headers({ 'cache-control': PUBLIC_CACHE });
        return await listPublishedPosts(parsed.data);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.get(
    '/blog/posts/:slug',
    { schema: { tags: ['Blog'], summary: 'Read one published post with its hreflang alternates', params: { type: 'object', properties: { slug: { type: 'string' } } }, querystring: { type: 'object', properties: { locale: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] } } } } },
    async (request, reply) => {
      const { slug } = parseParams(routeParams, request.params);
      const parsed = publicPostQuerySchema.safeParse(request.query);
      if (!parsed.success) return badRequest(reply, parsed.error);
      if (!SLUG_PARAM.test(slug)) return reply.status(404).send({ error: 'Post not found.' });
      try {
        const post = await getPublishedPost(slug, parsed.data.locale);
        if (!post) return reply.status(404).send({ error: 'Post not found.' });
        reply.headers({ 'cache-control': PUBLIC_CACHE });
        return post;
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.get(
    '/blog/tags',
    { schema: { tags: ['Blog'], summary: 'Tags used by published posts', querystring: { type: 'object', properties: { locale: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] } } } } },
    async (request, reply) => {
      const parsed = publicPostQuerySchema.safeParse(request.query);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        reply.headers({ 'cache-control': PUBLIC_CACHE });
        return await listTags(parsed.data.locale);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  // Consumed by the landing's sitemap and RSS generators, which need every locale at once.
  fastify.get(
    '/blog/sitemap',
    { schema: { tags: ['Blog'], summary: 'Every published post in every language', querystring: { type: 'object', properties: {} } } },
    async (request, reply) => {
      try {
        reply.headers({ 'cache-control': PUBLIC_CACHE });
        return { items: await listPublishedForSitemap() };
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.get(
    '/blog/admin/session',
    { schema: { tags: ['Blog'], summary: 'Confirm the admin session against the account row', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      return { userId: claims.id, email: claims.email ?? null };
    },
  );

  fastify.get(
    '/blog/admin/posts',
    { schema: { tags: ['Blog'], summary: 'List posts including drafts', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const parsed = adminListQuerySchema.safeParse(request.query);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        reply.headers({ 'cache-control': 'no-store' });
        return await listPostsForAdmin(parsed.data);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.get(
    '/blog/admin/posts/:id',
    { schema: { tags: ['Blog'], summary: 'Read one post with its body and translations', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const { id } = parseParams(postIdParams, request.params);
      if (!UUID_PARAM.test(id)) return reply.status(404).send({ error: 'Post not found.' });
      try {
        reply.headers({ 'cache-control': 'no-store' });
        const post = await getPostForAdmin(id);
        if (!post) return reply.status(404).send({ error: 'Post not found.' });
        return post;
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.post(
    '/blog/admin/posts',
    {
      schema: { tags: ['Blog'], summary: 'Create a draft post', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const parsed = createPostSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        const post = await createPost(parsed.data, claims.id);
        return reply.status(201).send(post);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.patch(
    '/blog/admin/posts/:id',
    {
      schema: { tags: ['Blog'], summary: 'Update post content or SEO fields', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const { id } = parseParams(postIdParams, request.params);
      if (!UUID_PARAM.test(id)) return reply.status(404).send({ error: 'Post not found.' });
      const parsed = updatePostSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        return await updatePost(id, parsed.data, claims.id);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.post(
    '/blog/admin/posts/:id/status',
    {
      schema: { tags: ['Blog'], summary: 'Publish, unpublish or archive with an audit reason', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const { id } = parseParams(postIdParams, request.params);
      if (!UUID_PARAM.test(id)) return reply.status(404).send({ error: 'Post not found.' });
      const parsed = publishStatusSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        return await setPostStatus(id, parsed.data.status, parsed.data.reason, claims.id);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.post(
    '/blog/admin/posts/:id/translations',
    {
      schema: { tags: ['Blog'], summary: 'Seed a translation of an existing post', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const { id } = parseParams(postIdParams, request.params);
      if (!UUID_PARAM.test(id)) return reply.status(404).send({ error: 'Post not found.' });
      const parsed = translationSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        const post = await createTranslation(id, parsed.data.locale, claims.id);
        return reply.status(201).send(post);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.delete(
    '/blog/admin/posts/:id',
    { schema: { tags: ['Blog'], summary: 'Delete a post and its cover object', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      const { id } = parseParams(postIdParams, request.params);
      if (!UUID_PARAM.test(id)) return reply.status(404).send({ error: 'Post not found.' });
      try {
        const post = await deletePost(id, claims.id);
        if (post.coverUrl && isBlogCoverStorageConfigured()) {
          await removeCoverObjects([coverKeyFromUrl(post.coverUrl)]);
        }
        return { ok: true };
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.post(
    '/blog/admin/covers',
    {
      schema: { tags: ['Blog'], summary: 'Signed PUT URL for a cover upload', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      if (!isBlogCoverStorageConfigured()) return reply.status(503).send({ error: 'Cover storage is not configured. Paste an image URL instead.' });
      const parsed = coverUploadSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        reply.headers({ 'cache-control': 'no-store' });
        return await createCoverUpload(claims.id, parsed.data.contentType);
      } catch (error) {
        return fail(request, reply, error);
      }
    },
  );

  fastify.post(
    '/blog/admin/covers/confirm',
    {
      schema: { tags: ['Blog'], summary: 'Normalise an uploaded cover and return its public URL', security: [{ bearerAuth: [] }] },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const claims = await admin(request, reply);
      if (!claims) return reply;
      if (!isBlogCoverStorageConfigured()) return reply.status(503).send({ error: 'Cover storage is not configured.' });
      const parsed = coverConfirmSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);
      try {
        reply.headers({ 'cache-control': 'no-store' });
        return await processCoverUpload(claims.id, parsed.data.objectKey, parsed.data.contentType);
      } catch (error) {
        logger.warn('Cover processing rejected.', { err: error, actorUserId: claims.id });
        return reply.status(400).send({ error: 'The uploaded file is not a usable image.' });
      }
    },
  );
};

/** Reverses the percent-encoding that `processCoverUpload` applied to the object key. */
const coverKeyFromUrl = (url: string) => {
  const base = (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  if (!base || !url.startsWith(`${base}/`)) return '';
  try {
    return decodeURIComponent(url.slice(base.length + 1));
  } catch {
    return '';
  }
};
