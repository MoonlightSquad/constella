import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
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
import { BLOG_LOCALES } from '@constella/db';
import type { BlogLocale } from '@constella/db';
import { audit, httpError, publishedOnly } from './queries.js';
import type { AdminTermListInput, CreateCategoryInput, CreateTagInput, UpdateCategoryInput, UpdateTagInput } from './schemas.js';

// Категорії й теґи керуються тут; публічні зчитування — у queries.ts. Останній переклад
// видалити не можна: без нього сутність стає недоступною жодному архівному URL.

const LOCALE_RANK = new Map<string, number>(BLOG_LOCALES.map((locale, index) => [locale, index]));
const sortTranslations = <T extends { locale: BlogLocale }>(rows: T[]) =>
  [...rows].sort((a, b) => (LOCALE_RANK.get(a.locale) ?? 9) - (LOCALE_RANK.get(b.locale) ?? 9));

const categoryColumns = {
  categoryId: blogCategoryTranslations.categoryId,
  locale: blogCategoryTranslations.locale,
  slug: blogCategoryTranslations.slug,
  name: blogCategoryTranslations.name,
  description: blogCategoryTranslations.description,
  seoTitle: blogCategoryTranslations.seoTitle,
  seoDescription: blogCategoryTranslations.seoDescription,
};

const tagColumns = {
  tagId: blogTagTranslations.tagId,
  locale: blogTagTranslations.locale,
  slug: blogTagTranslations.slug,
  name: blogTagTranslations.name,
};

const categoryPostCounts = async (ids: string[]) => {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: blogPostCategories.categoryId, postCount: sql<number>`count(distinct ${blogPostCategories.postGroupId})::int` })
    .from(blogPostCategories)
    .innerJoin(blogPosts, and(eq(blogPosts.groupId, blogPostCategories.postGroupId), publishedOnly))
    .where(inArray(blogPostCategories.categoryId, ids))
    .groupBy(blogPostCategories.categoryId);
  return new Map(rows.map((row) => [row.id, row.postCount]));
};

const tagPostCounts = async (ids: string[]) => {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: blogPostTags.tagId, postCount: sql<number>`count(distinct ${blogPostTags.postGroupId})::int` })
    .from(blogPostTags)
    .innerJoin(blogPosts, and(eq(blogPosts.groupId, blogPostTags.postGroupId), publishedOnly))
    .where(inArray(blogPostTags.tagId, ids))
    .groupBy(blogPostTags.tagId);
  return new Map(rows.map((row) => [row.id, row.postCount]));
};

type CategoryTranslationRow = {
  categoryId: string;
  locale: BlogLocale;
  slug: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

type TagTranslationRow = { tagId: string; locale: BlogLocale; slug: string; name: string };

export const listCategoriesForAdmin = async (input: AdminTermListInput) => {
  const filter = and(
    input.search ? or(ilike(blogCategoryTranslations.name, `%${input.search}%`), ilike(blogCategoryTranslations.slug, `%${input.search}%`)) : undefined,
    input.locale ? eq(blogCategoryTranslations.locale, input.locale) : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(distinct ${blogCategoryTranslations.categoryId})::int` })
    .from(blogCategoryTranslations)
    .where(filter);
  const entities = await db
    .selectDistinct({ id: blogCategories.id, createdAt: blogCategories.createdAt })
    .from(blogCategories)
    .innerJoin(blogCategoryTranslations, eq(blogCategoryTranslations.categoryId, blogCategories.id))
    .where(filter)
    .orderBy(desc(blogCategories.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  const ids = entities.map((entity) => entity.id);
  const counts = await categoryPostCounts(ids);
  const translations: CategoryTranslationRow[] = ids.length
    ? await db.select(categoryColumns).from(blogCategoryTranslations).where(inArray(blogCategoryTranslations.categoryId, ids))
    : [];
  const byCategory = new Map<string, CategoryTranslationRow[]>();
  for (const row of translations) {
    const list = byCategory.get(row.categoryId) ?? [];
    list.push(row);
    byCategory.set(row.categoryId, list);
  }
  return {
    total,
    items: entities.map((entity) => ({
      ...entity,
      postCount: counts.get(entity.id) ?? 0,
      translations: sortTranslations(byCategory.get(entity.id) ?? []),
    })),
  };
};

export const listTagsForAdmin = async (input: AdminTermListInput) => {
  const filter = and(
    input.search ? or(ilike(blogTagTranslations.name, `%${input.search}%`), ilike(blogTagTranslations.slug, `%${input.search}%`)) : undefined,
    input.locale ? eq(blogTagTranslations.locale, input.locale) : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(distinct ${blogTagTranslations.tagId})::int` })
    .from(blogTagTranslations)
    .where(filter);
  const entities = await db
    .selectDistinct({ id: blogTags.id, createdAt: blogTags.createdAt })
    .from(blogTags)
    .innerJoin(blogTagTranslations, eq(blogTagTranslations.tagId, blogTags.id))
    .where(filter)
    .orderBy(desc(blogTags.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  const ids = entities.map((entity) => entity.id);
  const counts = await tagPostCounts(ids);
  const translations: TagTranslationRow[] = ids.length
    ? await db.select(tagColumns).from(blogTagTranslations).where(inArray(blogTagTranslations.tagId, ids))
    : [];
  const byTag = new Map<string, TagTranslationRow[]>();
  for (const row of translations) {
    const list = byTag.get(row.tagId) ?? [];
    list.push(row);
    byTag.set(row.tagId, list);
  }
  return {
    total,
    items: entities.map((entity) => ({
      ...entity,
      postCount: counts.get(entity.id) ?? 0,
      translations: sortTranslations(byTag.get(entity.id) ?? []),
    })),
  };
};

export const getCategoryForAdmin = async (id: string) => {
  const [entity] = await db.select().from(blogCategories).where(eq(blogCategories.id, id)).limit(1);
  if (!entity) return null;
  const translations = sortTranslations(
    await db.select(categoryColumns).from(blogCategoryTranslations).where(eq(blogCategoryTranslations.categoryId, id)),
  );
  const counts = await categoryPostCounts([id]);
  return { ...entity, postCount: counts.get(id) ?? 0, translations };
};

export const getTagForAdmin = async (id: string) => {
  const [entity] = await db.select().from(blogTags).where(eq(blogTags.id, id)).limit(1);
  if (!entity) return null;
  const translations = sortTranslations(
    await db.select(tagColumns).from(blogTagTranslations).where(eq(blogTagTranslations.tagId, id)),
  );
  const counts = await tagPostCounts([id]);
  return { ...entity, postCount: counts.get(id) ?? 0, translations };
};

/**
 * Pin — це чужий id у тілі запиту, тому валідується до запису: група має існувати, а
 * категорія (коли вона вже створена) має мати цю групу серед своїх статей. Інакше редактор
 * побачив би збережену категорію з pillar, якого в ній немає, а лендінг би його мовчки
 * не рендерив — тобто тиша там, де має бути 400.
 */
const assertPinnedGroup = async (tx: any, groupId: string, categoryId: string | null) => {
  const [group] = await tx.select({ id: blogPostGroups.id }).from(blogPostGroups).where(eq(blogPostGroups.id, groupId)).limit(1);
  if (!group) throw httpError('Unknown pinnedPostGroupId.', 400);
  if (!categoryId) return;
  const [attached] = await tx
    .select({ postId: blogPostCategories.postGroupId })
    .from(blogPostCategories)
    .where(and(eq(blogPostCategories.categoryId, categoryId), eq(blogPostCategories.postGroupId, groupId)))
    .limit(1);
  if (!attached) throw httpError('The pinned article is not in this category.', 400);
};

export const createCategory = async (input: CreateCategoryInput, actorUserId: string) => {
  const { translations = [], pinnedPostGroupId, ...primary } = input;
  const id = await db.transaction(async (tx) => {
    // На створенні категорія ще не має статей, тому перевірка приналежності тут неможлива:
    // валідуємо існування групи, а лендінг і так не показує pillar, якого в категорії немає.
    if (pinnedPostGroupId) await assertPinnedGroup(tx, pinnedPostGroupId, null);
    const [entity] = await tx.insert(blogCategories).values({ pinnedPostGroupId: pinnedPostGroupId ?? null }).returning({ id: blogCategories.id });
    await tx.insert(blogCategoryTranslations).values([
      {
        categoryId: entity.id,
        locale: primary.locale,
        slug: primary.slug,
        name: primary.name,
        description: primary.description ?? null,
        seoTitle: primary.seoTitle ?? null,
        seoDescription: primary.seoDescription ?? null,
      },
      ...translations.map((t) => ({
        categoryId: entity.id,
        locale: t.locale,
        slug: t.slug,
        name: t.name,
        description: t.description ?? null,
        seoTitle: t.seoTitle ?? null,
        seoDescription: t.seoDescription ?? null,
      })),
    ]);
    await audit(tx, actorUserId, 'blog.category.create', null, { categoryId: entity.id, locale: primary.locale, slug: primary.slug });
    return entity.id;
  });
  return getCategoryForAdmin(id);
};

export const createTag = async (input: CreateTagInput, actorUserId: string) => {
  const { translations = [], ...primary } = input;
  const id = await db.transaction(async (tx) => {
    const [entity] = await tx.insert(blogTags).values({}).returning({ id: blogTags.id });
    await tx.insert(blogTagTranslations).values([
      { tagId: entity.id, locale: primary.locale, slug: primary.slug, name: primary.name },
      ...translations.map((t) => ({ tagId: entity.id, locale: t.locale, slug: t.slug, name: t.name })),
    ]);
    await audit(tx, actorUserId, 'blog.tag.create', null, { tagId: entity.id, locale: primary.locale, slug: primary.slug });
    return entity.id;
  });
  return getTagForAdmin(id);
};

// '' у patch-рядку очищає необов'язкове поле (як у патчі статті); відсутній ключ —
// без змін. Вставка нової мови вимагає slug і name одразу.
const applyCategoryPatch = (patch: { slug?: string; name?: string; description?: string; seoTitle?: string; seoDescription?: string }) => {
  const values: Record<string, string | null> = {};
  for (const key of ['slug', 'name', 'description', 'seoTitle', 'seoDescription'] as const) {
    if (patch[key] !== undefined) values[key] = patch[key] === '' ? null : patch[key]!;
  }
  return values;
};

const applyTagPatch = (patch: { slug?: string; name?: string }) => {
  const values: Record<string, string | null> = {};
  for (const key of ['slug', 'name'] as const) {
    if (patch[key] !== undefined) values[key] = patch[key] === '' ? null : patch[key]!;
  }
  return values;
};

export const updateCategory = async (id: string, patch: UpdateCategoryInput, actorUserId: string) => {
  await db.transaction(async (tx) => {
    const [entity] = await tx.select({ id: blogCategories.id }).from(blogCategories).where(eq(blogCategories.id, id)).limit(1);
    if (!entity) throw httpError('Category not found.', 404);

    // Pin — не переклад, тому ключ `''` очищає його, а відсутній ключ лишає як було.
    if (patch.pinnedPostGroupId !== undefined) {
      const groupId = patch.pinnedPostGroupId === '' ? null : patch.pinnedPostGroupId;
      if (groupId) await assertPinnedGroup(tx, groupId, id);
      await tx.update(blogCategories).set({ pinnedPostGroupId: groupId }).where(eq(blogCategories.id, id));
    }

    for (const translation of patch.translations ?? []) {
      const { locale, ...fields } = translation;
      const values = applyCategoryPatch(fields);
      const [existing] = await tx
        .select({ locale: blogCategoryTranslations.locale })
        .from(blogCategoryTranslations)
        .where(and(eq(blogCategoryTranslations.categoryId, id), eq(blogCategoryTranslations.locale, locale)))
        .limit(1);
      if (existing) {
        if (Object.keys(values).length) {
          await tx.update(blogCategoryTranslations).set(values).where(and(eq(blogCategoryTranslations.categoryId, id), eq(blogCategoryTranslations.locale, locale)));
        }
      } else {
        if (!fields.slug || !fields.name) throw httpError(`Translation for locale '${locale}' requires slug and name.`, 400);
        await tx.insert(blogCategoryTranslations).values({ categoryId: id, locale, slug: fields.slug, name: fields.name, description: fields.description ?? null, seoTitle: fields.seoTitle ?? null, seoDescription: fields.seoDescription ?? null });
      }
    }

    if (patch.removeLocales?.length) {
      await tx.delete(blogCategoryTranslations).where(and(eq(blogCategoryTranslations.categoryId, id), inArray(blogCategoryTranslations.locale, patch.removeLocales)));
    }
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(blogCategoryTranslations)
      .where(eq(blogCategoryTranslations.categoryId, id));
    if (!remaining) throw httpError('The last translation cannot be removed.', 400);

    await audit(tx, actorUserId, 'blog.category.update', null, {
      categoryId: id,
      locales: [...new Set([...(patch.translations ?? []).map((t) => t.locale), ...(patch.removeLocales ?? [])])].sort(),
      // Pin — єдине, що редактор зміг змінити без жодного рядка перекладу: без цього рядка
      // аудит показав би «нічого не змінено».
      ...(patch.pinnedPostGroupId === undefined ? {} : { pinned: patch.pinnedPostGroupId || null }),
    });
  });
  return getCategoryForAdmin(id);
};

export const updateTag = async (id: string, patch: UpdateTagInput, actorUserId: string) => {
  await db.transaction(async (tx) => {
    const [entity] = await tx.select({ id: blogTags.id }).from(blogTags).where(eq(blogTags.id, id)).limit(1);
    if (!entity) throw httpError('Tag not found.', 404);

    for (const translation of patch.translations ?? []) {
      const { locale, ...fields } = translation;
      const values = applyTagPatch(fields);
      const [existing] = await tx
        .select({ locale: blogTagTranslations.locale })
        .from(blogTagTranslations)
        .where(and(eq(blogTagTranslations.tagId, id), eq(blogTagTranslations.locale, locale)))
        .limit(1);
      if (existing) {
        if (Object.keys(values).length) {
          await tx.update(blogTagTranslations).set(values).where(and(eq(blogTagTranslations.tagId, id), eq(blogTagTranslations.locale, locale)));
        }
      } else {
        if (!fields.slug || !fields.name) throw httpError(`Translation for locale '${locale}' requires slug and name.`, 400);
        await tx.insert(blogTagTranslations).values({ tagId: id, locale, slug: fields.slug, name: fields.name });
      }
    }

    if (patch.removeLocales?.length) {
      await tx.delete(blogTagTranslations).where(and(eq(blogTagTranslations.tagId, id), inArray(blogTagTranslations.locale, patch.removeLocales)));
    }
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(blogTagTranslations)
      .where(eq(blogTagTranslations.tagId, id));
    if (!remaining) throw httpError('The last translation cannot be removed.', 400);

    await audit(tx, actorUserId, 'blog.tag.update', null, {
      tagId: id,
      locales: [...new Set([...(patch.translations ?? []).map((t) => t.locale), ...(patch.removeLocales ?? [])])].sort(),
    });
  });
  return getTagForAdmin(id);
};

export const deleteCategory = async (id: string, actorUserId: string) =>
  db.transaction(async (tx) => {
    const translations = await tx
      .select({ locale: blogCategoryTranslations.locale, slug: blogCategoryTranslations.slug })
      .from(blogCategoryTranslations)
      .where(eq(blogCategoryTranslations.categoryId, id));
    if (!translations.length) throw httpError('Category not found.', 404);
    await tx.delete(blogCategories).where(eq(blogCategories.id, id));
    await audit(tx, actorUserId, 'blog.category.delete', null, { categoryId: id, slugs: translations.map((t) => `${t.locale}:${t.slug}`) });
  });

export const deleteTag = async (id: string, actorUserId: string) =>
  db.transaction(async (tx) => {
    const translations = await tx
      .select({ locale: blogTagTranslations.locale, slug: blogTagTranslations.slug })
      .from(blogTagTranslations)
      .where(eq(blogTagTranslations.tagId, id));
    if (!translations.length) throw httpError('Tag not found.', 404);
    await tx.delete(blogTags).where(eq(blogTags.id, id));
    await audit(tx, actorUserId, 'blog.tag.delete', null, { tagId: id, slugs: translations.map((t) => `${t.locale}:${t.slug}`) });
  });
