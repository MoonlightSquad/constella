import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { adminAuditLogs, blogPostGroups, blogPosts, db } from '@constella/db';
import type { BlogLocale } from '@constella/db';
import {
  decodeCursor,
  encodeCursor,
  estimateReadingMinutes,
  type AdminListInput,
  type CreatePostInput,
  type PublicListInput,
  type UpdatePostInput,
} from './schemas.js';

const publishedOnly = and(eq(blogPosts.status, 'published'), sql`${blogPosts.publishedAt} <= NOW()`);

/**
 * Every public projection goes through these columns, so a new endpoint cannot leak a
 * draft body by forgetting to drop a field: `bodyMarkdown` is only ever selected where
 * a published row has already been resolved.
 */
const summaryColumns = {
  id: blogPosts.id,
  groupId: blogPosts.groupId,
  locale: blogPosts.locale,
  slug: blogPosts.slug,
  title: blogPosts.title,
  excerpt: blogPosts.excerpt,
  tags: blogPosts.tags,
  coverUrl: blogPosts.coverUrl,
  coverAlt: blogPosts.coverAlt,
  publishedAt: blogPosts.publishedAt,
  readingMinutes: blogPosts.readingMinutes,
  authorName: blogPosts.authorName,
};

const adminColumns = {
  ...summaryColumns,
  status: blogPosts.status,
  noindex: blogPosts.noindex,
  seoTitle: blogPosts.seoTitle,
  seoDescription: blogPosts.seoDescription,
  ogImageUrl: blogPosts.ogImageUrl,
  canonicalUrl: blogPosts.canonicalUrl,
  createdAt: blogPosts.createdAt,
  updatedAt: blogPosts.updatedAt,
};

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Empty strings come from cleared editor fields and are stored as NULL. */
const toNull = <T extends Record<string, unknown>>(values: T): T =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])) as T;

export const listPublishedPosts = async (input: PublicListInput) => {
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw httpError('Invalid cursor.', 400);

  const rows = await db
    .select(summaryColumns)
    .from(blogPosts)
    .where(
      and(
        publishedOnly,
        eq(blogPosts.locale, input.locale),
        input.tag ? sql`${input.tag} = ANY(${blogPosts.tags})` : undefined,
        cursor
          ? sql`(${blogPosts.publishedAt}, ${blogPosts.id}) < (${cursor.publishedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
    .limit(input.limit + 1);

  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > input.limit && last?.publishedAt ? encodeCursor(last.publishedAt, last.id) : null,
  };
};

export const getPublishedPost = async (slug: string, locale: BlogLocale) => {
  const [post] = await db
    .select({ ...adminColumns, bodyMarkdown: blogPosts.bodyMarkdown })
    .from(blogPosts)
    .where(and(publishedOnly, eq(blogPosts.slug, slug), eq(blogPosts.locale, locale)))
    .limit(1);
  if (!post) return null;

  // A draft sibling must not appear in hreflang: it would point crawlers at a 404.
  const siblings = await db
    .select({ locale: blogPosts.locale, slug: blogPosts.slug })
    .from(blogPosts)
    .where(and(eq(blogPosts.groupId, post.groupId), publishedOnly));

  return { ...post, alternates: siblings };
};

export const listTags = async (locale: BlogLocale) => {
  const rows = await db
    .select({ tag: sql<string>`unnest(${blogPosts.tags})`, count: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(and(publishedOnly, eq(blogPosts.locale, locale)))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`), sql`1`)
    .limit(40);
  return { items: rows };
};

/** One row per published locale variant; the landing groups them by `groupId`. */
export const listPublishedForSitemap = async () =>
  db
    .select({ id: blogPosts.id, groupId: blogPosts.groupId, locale: blogPosts.locale, slug: blogPosts.slug, updatedAt: blogPosts.updatedAt, publishedAt: blogPosts.publishedAt, title: blogPosts.title, excerpt: blogPosts.excerpt, authorName: blogPosts.authorName })
    .from(blogPosts)
    .where(publishedOnly)
    .orderBy(desc(blogPosts.publishedAt));

export const listPostsForAdmin = async (input: AdminListInput) => {
  const where = and(
    input.locale ? eq(blogPosts.locale, input.locale) : undefined,
    input.status ? eq(blogPosts.status, input.status) : undefined,
    input.search
      ? or(
          ilike(blogPosts.title, `%${input.search}%`),
          ilike(blogPosts.slug, `%${input.search}%`),
          ilike(blogPosts.excerpt, `%${input.search}%`),
        )
      : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(where);
  const rows = await db
    .select(adminColumns)
    .from(blogPosts)
    .where(where)
    .orderBy(desc(blogPosts.updatedAt))
    .limit(input.limit)
    .offset(input.offset);
  return { total, items: rows };
};

export const getPostForAdmin = async (id: string) => {
  const [post] = await db.select({ ...adminColumns, bodyMarkdown: blogPosts.bodyMarkdown }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  if (!post) return null;
  const siblings = await db
    .select({ id: blogPosts.id, locale: blogPosts.locale, slug: blogPosts.slug, status: blogPosts.status, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(eq(blogPosts.groupId, post.groupId));
  return { ...post, siblings };
};

const audit = (tx: any, actorUserId: string, action: string, reason: string | null, metadata: Record<string, unknown>) =>
  tx.insert(adminAuditLogs).values({ actorUserId, action, reason, metadata });

export const createPost = async (input: CreatePostInput, actorUserId: string) =>
  db.transaction(async (tx) => {
    let groupId = input.groupId ?? null;
    if (groupId) {
      const [existing] = await tx.select({ id: blogPostGroups.id }).from(blogPostGroups).where(eq(blogPostGroups.id, groupId)).limit(1);
      if (!existing) throw httpError('Unknown groupId.', 400);
    } else {
      const [group] = await tx.insert(blogPostGroups).values({}).returning({ id: blogPostGroups.id });
      groupId = group.id;
    }

    const [post] = await tx
      .insert(blogPosts)
      .values({
        ...toNull(input),
        groupId,
        status: 'draft',
        authorUserId: actorUserId,
        readingMinutes: estimateReadingMinutes(input.bodyMarkdown),
      })
      .returning();
    await audit(tx, actorUserId, 'blog.post.create', null, { postId: post.id, groupId, locale: post.locale, slug: post.slug });
    return post;
  });

export const updatePost = async (id: string, patch: UpdatePostInput, actorUserId: string) =>
  db.transaction(async (tx) => {
    const [post] = await tx
      .update(blogPosts)
      .set({
        ...toNull(patch),
        ...(patch.bodyMarkdown === undefined ? {} : { readingMinutes: estimateReadingMinutes(patch.bodyMarkdown) }),
        // drizzle does not emit `ON UPDATE CURRENT_TIMESTAMP`, so touch it explicitly.
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();
    if (!post) throw httpError('Post not found.', 404);
    await audit(tx, actorUserId, 'blog.post.update', null, { postId: id, fields: Object.keys(patch).sort() });
    return post;
  });

export const setPostStatus = async (id: string, status: 'draft' | 'published' | 'archived', reason: string, actorUserId: string) =>
  db.transaction(async (tx) => {
    const [current] = await tx.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!current) throw httpError('Post not found.', 404);
    // Re-publishing must not move `datePublished`, which Google has already indexed;
    // `updatedAt` carries the change instead.
    const publishedAt = status === 'published' ? current.publishedAt ?? new Date() : current.publishedAt;
    const [post] = await tx
      .update(blogPosts)
      .set({ status, publishedAt, updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();
    await audit(tx, actorUserId, 'blog.post.status', reason, { postId: id, from: current.status, to: status, locale: post.locale, slug: post.slug });
    return post;
  });

export const deletePost = async (id: string, actorUserId: string) =>
  db.transaction(async (tx) => {
    const [post] = await tx.delete(blogPosts).where(eq(blogPosts.id, id)).returning();
    if (!post) throw httpError('Post not found.', 404);
    await audit(tx, actorUserId, 'blog.post.delete', null, { postId: id, locale: post.locale, slug: post.slug, title: post.title });
    return post;
  });

/**
 * Seeds a translation from its source so the hreflang cluster stays complete: title,
 * tags and cover carry over, the body stays empty for the translator to fill in.
 */
export const createTranslation = async (sourceId: string, locale: BlogLocale, actorUserId: string) =>
  db.transaction(async (tx) => {
    const [source] = await tx.select().from(blogPosts).where(eq(blogPosts.id, sourceId)).limit(1);
    if (!source) throw httpError('Post not found.', 404);
    const [existing] = await tx
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(and(eq(blogPosts.groupId, source.groupId), eq(blogPosts.locale, locale)))
      .limit(1);
    if (existing) throw httpError('This group already has a version in that language.', 409);

    const [post] = await tx
      .insert(blogPosts)
      .values({
        groupId: source.groupId,
        locale,
        slug: source.slug,
        title: source.title,
        excerpt: source.excerpt,
        bodyMarkdown: '',
        tags: source.tags,
        coverUrl: source.coverUrl,
        coverAlt: source.coverAlt,
        authorUserId: actorUserId,
        authorName: source.authorName,
        publishedAt: source.publishedAt,
        readingMinutes: 1,
      })
      .returning();
    await audit(tx, actorUserId, 'blog.post.create', null, { postId: post.id, groupId: post.groupId, locale, slug: post.slug, translationOf: sourceId });
    return post;
  });

export const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === '23505';
