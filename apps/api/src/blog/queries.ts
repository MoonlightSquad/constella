import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  adminAuditLogs,
  blogCategories,
  blogCategoryTranslations,
  blogPostCategories,
  blogPostGroups,
  blogPostTags,
  blogPosts,
  blogTagTranslations,
  blogTags,
  db,
} from '@constella/db';
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

export const publishedOnly = and(eq(blogPosts.status, 'published'), sql`${blogPosts.publishedAt} <= NOW()`);

export const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Empty strings come from cleared editor fields and are stored as NULL. */
export const toNull = <T extends Record<string, unknown>>(values: T): T =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])) as T;

export const audit = (tx: any, actorUserId: string, action: string, reason: string | null, metadata: Record<string, unknown>) =>
  tx.insert(adminAuditLogs).values({ actorUserId, action, reason, metadata });

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

export type TermRef = { id: string; slug: string; name: string };

type TermRow = { groupId: string; termId: string; locale: BlogLocale; slug: string; name: string };

const categoryRowsForGroups = async (groupIds: string[]): Promise<TermRow[]> =>
  db
    .select({
      groupId: blogPostCategories.postGroupId,
      termId: blogPostCategories.categoryId,
      locale: blogCategoryTranslations.locale,
      slug: blogCategoryTranslations.slug,
      name: blogCategoryTranslations.name,
    })
    .from(blogPostCategories)
    .innerJoin(blogCategoryTranslations, eq(blogCategoryTranslations.categoryId, blogPostCategories.categoryId))
    .where(inArray(blogPostCategories.postGroupId, groupIds));

const tagRowsForGroups = async (groupIds: string[]): Promise<TermRow[]> =>
  db
    .select({
      groupId: blogPostTags.postGroupId,
      termId: blogPostTags.tagId,
      locale: blogTagTranslations.locale,
      slug: blogTagTranslations.slug,
      name: blogTagTranslations.name,
    })
    .from(blogPostTags)
    .innerJoin(blogTagTranslations, eq(blogTagTranslations.tagId, blogPostTags.tagId))
    .where(inArray(blogPostTags.postGroupId, groupIds));

/**
 * Додає `categories` і `tags` з назвами мови рядка. Публічна проєкція пропускає
 * терміни без перекладу мовою рядка — посилання на архів без такого перекладу було б
 * 404. В адмінці термін лишається з fallback (uk → будь-який), щоб редактор бачив
 * прогалину перекладу.
 */
const attachTaxonomy = async <T extends { groupId: string; locale: BlogLocale }>(rows: T[], fallback: boolean) => {
  const groupIds = [...new Set(rows.map((row) => row.groupId))];
  if (!groupIds.length) {
    return rows.map((row) => ({ ...row, categories: [] as TermRef[], tags: [] as TermRef[] }));
  }
  const [categoryRows, tagRows] = await Promise.all([categoryRowsForGroups(groupIds), tagRowsForGroups(groupIds)]);
  const indexer = (entries: TermRow[]) => {
    const byGroup = new Map<string, Map<string, Map<string, TermRef>>>();
    for (const entry of entries) {
      const terms = byGroup.get(entry.groupId) ?? new Map<string, Map<string, TermRef>>();
      const locales = terms.get(entry.termId) ?? new Map<string, TermRef>();
      locales.set(entry.locale, { id: entry.termId, slug: entry.slug, name: entry.name });
      terms.set(entry.termId, locales);
      byGroup.set(entry.groupId, terms);
    }
    return (groupId: string, locale: BlogLocale): TermRef[] => {
      const items: TermRef[] = [];
      for (const locales of byGroup.get(groupId)?.values() ?? []) {
        const ref = locales.get(locale) ?? (fallback ? locales.get('uk') ?? locales.values().next().value : undefined);
        if (ref) items.push(ref);
      }
      return items.sort((a, b) => a.name.localeCompare(b.name));
    };
  };
  const categoryFor = indexer(categoryRows);
  const tagFor = indexer(tagRows);
  return rows.map((row) => ({
    ...row,
    categories: categoryFor(row.groupId, row.locale),
    tags: tagFor(row.groupId, row.locale),
  }));
};

const resolveCategoryId = async (slug: string, locale: BlogLocale) => {
  const [row] = await db
    .select({ id: blogCategoryTranslations.categoryId })
    .from(blogCategoryTranslations)
    .where(and(eq(blogCategoryTranslations.slug, slug), eq(blogCategoryTranslations.locale, locale)))
    .limit(1);
  return row?.id ?? null;
};

const resolveTagId = async (slug: string, locale: BlogLocale) => {
  const [row] = await db
    .select({ id: blogTagTranslations.tagId })
    .from(blogTagTranslations)
    .where(and(eq(blogTagTranslations.slug, slug), eq(blogTagTranslations.locale, locale)))
    .limit(1);
  return row?.id ?? null;
};

/** Опубліковані статті терміна по мовах: locale → кількість (для alternates і 404). */
const categoryCountsByLocale = async (categoryId: string) => {
  const rows = await db
    .select({ locale: blogPosts.locale, postCount: sql<number>`count(*)::int` })
    .from(blogPosts)
    .innerJoin(blogPostCategories, eq(blogPostCategories.postGroupId, blogPosts.groupId))
    .where(and(publishedOnly, eq(blogPostCategories.categoryId, categoryId)))
    .groupBy(blogPosts.locale);
  return new Map(rows.map((row) => [row.locale, row.postCount]));
};

const tagCountsByLocale = async (tagId: string) => {
  const rows = await db
    .select({ locale: blogPosts.locale, postCount: sql<number>`count(*)::int` })
    .from(blogPosts)
    .innerJoin(blogPostTags, eq(blogPostTags.postGroupId, blogPosts.groupId))
    .where(and(publishedOnly, eq(blogPostTags.tagId, tagId)))
    .groupBy(blogPosts.locale);
  return new Map(rows.map((row) => [row.locale, row.postCount]));
};

export const listPublishedPosts = async (input: PublicListInput) => {
  const cursor = decodeCursor(input.cursor);
  if (input.cursor && !cursor) throw httpError('Invalid cursor.', 400);

  const categoryId = input.category ? await resolveCategoryId(input.category, input.locale) : null;
  const tagId = input.tag ? await resolveTagId(input.tag, input.locale) : null;
  // Невідомий slug — порожня сторінка, а не 404: сам архів перевіряє термін окремо.
  if ((input.category && !categoryId) || (input.tag && !tagId)) return { items: [], nextCursor: null };

  const rows = await db
    .select(summaryColumns)
    .from(blogPosts)
    .where(
      and(
        publishedOnly,
        eq(blogPosts.locale, input.locale),
        categoryId
          ? sql`EXISTS (SELECT 1 FROM blog_post_categories pc WHERE pc.post_group_id = ${blogPosts.groupId} AND pc.category_id = ${categoryId})`
          : undefined,
        tagId
          ? sql`EXISTS (SELECT 1 FROM blog_post_tags pt WHERE pt.post_group_id = ${blogPosts.groupId} AND pt.tag_id = ${tagId})`
          : undefined,
        cursor
          ? sql`(${blogPosts.publishedAt}, ${blogPosts.id}) < (${cursor.publishedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
    .limit(input.limit + 1);

  const items = await attachTaxonomy(rows.slice(0, input.limit), false);
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

  const [withTerms] = await attachTaxonomy([post], false);
  return { ...withTerms, alternates: siblings };
};

/**
 * Фасети: лише терміни з перекладом мови `locale` і щонайменше однією опублікованою
 * статтею в цій мові. Порожній фасет не стає посиланням, тож не стає тонкою сторінкою.
 */
export const listPublicCategories = async (locale: BlogLocale) => {
  const items = await db
    .select({
      id: blogCategories.id,
      slug: blogCategoryTranslations.slug,
      name: blogCategoryTranslations.name,
      description: blogCategoryTranslations.description,
      postCount: sql<number>`count(distinct ${blogPosts.id})::int`,
    })
    .from(blogCategories)
    .innerJoin(blogCategoryTranslations, and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, locale)))
    .leftJoin(blogPostCategories, eq(blogPostCategories.categoryId, blogCategories.id))
    .leftJoin(blogPosts, and(eq(blogPosts.groupId, blogPostCategories.postGroupId), eq(blogPosts.locale, locale), publishedOnly))
    .groupBy(blogCategories.id, blogCategoryTranslations.slug, blogCategoryTranslations.name, blogCategoryTranslations.description)
    .having(sql`count(distinct ${blogPosts.id}) > 0`)
    .orderBy(desc(sql`count(distinct ${blogPosts.id})`), blogCategoryTranslations.name)
    .limit(60);
  return { items };
};

export const listPublicTags = async (locale: BlogLocale) => {
  const items = await db
    .select({
      id: blogTags.id,
      slug: blogTagTranslations.slug,
      name: blogTagTranslations.name,
      postCount: sql<number>`count(distinct ${blogPosts.id})::int`,
    })
    .from(blogTags)
    .innerJoin(blogTagTranslations, and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)))
    .leftJoin(blogPostTags, eq(blogPostTags.tagId, blogTags.id))
    .leftJoin(blogPosts, and(eq(blogPosts.groupId, blogPostTags.postGroupId), eq(blogPosts.locale, locale), publishedOnly))
    .groupBy(blogTags.id, blogTagTranslations.slug, blogTagTranslations.name)
    .having(sql`count(distinct ${blogPosts.id}) > 0`)
    .orderBy(desc(sql`count(distinct ${blogPosts.id})`), blogTagTranslations.name)
    .limit(60);
  return { items };
};

/** Один термін + hreflang-альтернативи; `null`, коли в цій мові немає чого показувати. */
export const getPublicCategory = async (slug: string, locale: BlogLocale) => {
  const [term] = await db
    .select()
    .from(blogCategoryTranslations)
    .where(and(eq(blogCategoryTranslations.slug, slug), eq(blogCategoryTranslations.locale, locale)))
    .limit(1);
  if (!term) return null;

  const counts = await categoryCountsByLocale(term.categoryId);
  const postCount = counts.get(locale) ?? 0;
  if (!postCount) return null;

  const translations = await db
    .select({ locale: blogCategoryTranslations.locale, slug: blogCategoryTranslations.slug })
    .from(blogCategoryTranslations)
    .where(eq(blogCategoryTranslations.categoryId, term.categoryId));

  return {
    id: term.categoryId,
    slug: term.slug,
    name: term.name,
    description: term.description,
    seoTitle: term.seoTitle,
    seoDescription: term.seoDescription,
    postCount,
    alternates: translations.filter((row) => (counts.get(row.locale) ?? 0) > 0).map((row) => ({ locale: row.locale, slug: row.slug })),
  };
};

export const getPublicTag = async (slug: string, locale: BlogLocale) => {
  const [term] = await db
    .select()
    .from(blogTagTranslations)
    .where(and(eq(blogTagTranslations.slug, slug), eq(blogTagTranslations.locale, locale)))
    .limit(1);
  if (!term) return null;

  const counts = await tagCountsByLocale(term.tagId);
  const postCount = counts.get(locale) ?? 0;
  if (!postCount) return null;

  const translations = await db
    .select({ locale: blogTagTranslations.locale, slug: blogTagTranslations.slug })
    .from(blogTagTranslations)
    .where(eq(blogTagTranslations.tagId, term.tagId));

  return {
    id: term.tagId,
    slug: term.slug,
    name: term.name,
    postCount,
    alternates: translations.filter((row) => (counts.get(row.locale) ?? 0) > 0).map((row) => ({ locale: row.locale, slug: row.slug })),
  };
};

/** Sitemap-рядки таксономії: одна на (термін, мову) з опублікованими статтями. */
export const listPublishedTaxonomyForSitemap = async () => {
  const [categories, tags] = await Promise.all([
    db
      .select({ id: blogCategoryTranslations.categoryId, locale: blogCategoryTranslations.locale, slug: blogCategoryTranslations.slug })
      .from(blogCategoryTranslations)
      .innerJoin(blogPostCategories, eq(blogPostCategories.categoryId, blogCategoryTranslations.categoryId))
      .innerJoin(blogPosts, and(eq(blogPosts.groupId, blogPostCategories.postGroupId), eq(blogPosts.locale, blogCategoryTranslations.locale), publishedOnly))
      .groupBy(blogCategoryTranslations.categoryId, blogCategoryTranslations.locale, blogCategoryTranslations.slug),
    db
      .select({ id: blogTagTranslations.tagId, locale: blogTagTranslations.locale, slug: blogTagTranslations.slug })
      .from(blogTagTranslations)
      .innerJoin(blogPostTags, eq(blogPostTags.tagId, blogTagTranslations.tagId))
      .innerJoin(blogPosts, and(eq(blogPosts.groupId, blogPostTags.postGroupId), eq(blogPosts.locale, blogTagTranslations.locale), publishedOnly))
      .groupBy(blogTagTranslations.tagId, blogTagTranslations.locale, blogTagTranslations.slug),
  ]);
  return { categories, tags };
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
  return { total, items: await attachTaxonomy(rows, true) };
};

export const getPostForAdmin = async (id: string) => {
  const [post] = await db.select({ ...adminColumns, bodyMarkdown: blogPosts.bodyMarkdown }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  if (!post) return null;
  const siblings = await db
    .select({ id: blogPosts.id, locale: blogPosts.locale, slug: blogPosts.slug, status: blogPosts.status, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(eq(blogPosts.groupId, post.groupId));
  const [withTerms] = await attachTaxonomy([post], true);
  return { ...withTerms, siblings };
};

/** Приналежність тримається на групі: заміна набору термінів одна для всіх мов статті. */
const replaceGroupTerms = async (tx: any, groupId: string, kind: 'category' | 'tag', ids: string[]) => {
  const unique = [...new Set(ids)];
  if (kind === 'category') {
    if (unique.length) {
      const known = await tx.select({ id: blogCategories.id }).from(blogCategories).where(inArray(blogCategories.id, unique));
      if (known.length !== unique.length) throw httpError('Unknown categoryIds.', 400);
    }
    await tx.delete(blogPostCategories).where(eq(blogPostCategories.postGroupId, groupId));
    if (unique.length) await tx.insert(blogPostCategories).values(unique.map((categoryId) => ({ postGroupId: groupId, categoryId })));
    return;
  }
  if (unique.length) {
    const known = await tx.select({ id: blogTags.id }).from(blogTags).where(inArray(blogTags.id, unique));
    if (known.length !== unique.length) throw httpError('Unknown tagIds.', 400);
  }
  await tx.delete(blogPostTags).where(eq(blogPostTags.postGroupId, groupId));
  if (unique.length) await tx.insert(blogPostTags).values(unique.map((tagId) => ({ postGroupId: groupId, tagId })));
};

export const createPost = async (input: CreatePostInput, actorUserId: string) =>
  db.transaction(async (tx) => {
    const { categoryIds, tagIds, ...fields } = input;
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
        ...toNull(fields),
        groupId,
        status: 'draft',
        authorUserId: actorUserId,
        readingMinutes: estimateReadingMinutes(input.bodyMarkdown),
      })
      .returning();
    if (categoryIds?.length) await replaceGroupTerms(tx, groupId, 'category', categoryIds);
    if (tagIds?.length) await replaceGroupTerms(tx, groupId, 'tag', tagIds);
    await audit(tx, actorUserId, 'blog.post.create', null, { postId: post.id, groupId, locale: post.locale, slug: post.slug });
    return post;
  });

export const updatePost = async (id: string, patch: UpdatePostInput, actorUserId: string) =>
  db.transaction(async (tx) => {
    const { categoryIds, tagIds, ...fields } = patch;
    const [post] = await tx
      .update(blogPosts)
      .set({
        ...toNull(fields),
        ...(patch.bodyMarkdown === undefined ? {} : { readingMinutes: estimateReadingMinutes(patch.bodyMarkdown) }),
        // drizzle does not emit `ON UPDATE CURRENT_TIMESTAMP`, so touch it explicitly.
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();
    if (!post) throw httpError('Post not found.', 404);
    if (categoryIds !== undefined) await replaceGroupTerms(tx, post.groupId, 'category', categoryIds);
    if (tagIds !== undefined) await replaceGroupTerms(tx, post.groupId, 'tag', tagIds);
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
 * Seeds a translation from its source so the hreflang cluster stays complete: title
 * and cover carry over, the body stays empty for the translator to fill in. Categories
 * and tags need no copying — membership hangs on the group and the new locale row
 * inherits it through the localized join.
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
