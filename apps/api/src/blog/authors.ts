import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { blogAuthors, blogAuthorTranslations, blogPosts, db } from '@constella/db';
import { BLOG_LOCALES } from '@constella/db';
import type { BlogLocale } from '@constella/db';
import { audit, httpError, publishedOnly } from './queries.js';
import type { AdminTermListInput, CreateAuthorInput, UpdateAuthorInput } from './schemas.js';

// Автори керуються тут; публічні зчитування — у queries.ts. Форма та сама, що в категорій
// (0015) і в таблицях blog_authors / blog_author_translations з 0016: роль і біо
// перекладаються, аватар і sameAs — одна пара на всю людину. Останній переклад видалити
// не можна: без нього профіль стає недоступний жодному /blog/author/… URL.

const LOCALE_RANK = new Map<string, number>(BLOG_LOCALES.map((locale, index) => [locale, index]));
const sortTranslations = <T extends { locale: BlogLocale }>(rows: T[]) =>
  [...rows].sort((a, b) => (LOCALE_RANK.get(a.locale) ?? 9) - (LOCALE_RANK.get(b.locale) ?? 9));

const authorColumns = {
  authorId: blogAuthorTranslations.authorId,
  locale: blogAuthorTranslations.locale,
  slug: blogAuthorTranslations.slug,
  name: blogAuthorTranslations.name,
  role: blogAuthorTranslations.role,
  bio: blogAuthorTranslations.bio,
  seoTitle: blogAuthorTranslations.seoTitle,
  seoDescription: blogAuthorTranslations.seoDescription,
};

type AuthorTranslationRow = {
  authorId: string;
  locale: BlogLocale;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

/** Рахуємо групи, не рядки: чотири мови однієї статті — це одна публікація автора. */
const authorPostCounts = async (ids: string[]) => {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: blogPosts.authorId, postCount: sql<number>`count(distinct ${blogPosts.groupId})::int` })
    .from(blogPosts)
    .where(and(publishedOnly, inArray(blogPosts.authorId, ids)))
    .groupBy(blogPosts.authorId);
  return new Map(rows.map((row) => [row.id, row.postCount]));
};

export const listAuthorsForAdmin = async (input: AdminTermListInput) => {
  const filter = and(
    input.search ? or(ilike(blogAuthorTranslations.name, `%${input.search}%`), ilike(blogAuthorTranslations.slug, `%${input.search}%`)) : undefined,
    input.locale ? eq(blogAuthorTranslations.locale, input.locale) : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(distinct ${blogAuthorTranslations.authorId})::int` })
    .from(blogAuthorTranslations)
    .where(filter);
  const entities = await db
    .selectDistinct({ id: blogAuthors.id, createdAt: blogAuthors.createdAt, avatarUrl: blogAuthors.avatarUrl, avatarAlt: blogAuthors.avatarAlt, sameAs: blogAuthors.sameAs })
    .from(blogAuthors)
    .innerJoin(blogAuthorTranslations, eq(blogAuthorTranslations.authorId, blogAuthors.id))
    .where(filter)
    .orderBy(desc(blogAuthors.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  const ids = entities.map((entity) => entity.id);
  const counts = await authorPostCounts(ids);
  const translations: AuthorTranslationRow[] = ids.length
    ? await db.select(authorColumns).from(blogAuthorTranslations).where(inArray(blogAuthorTranslations.authorId, ids))
    : [];
  const byAuthor = new Map<string, AuthorTranslationRow[]>();
  for (const row of translations) {
    const list = byAuthor.get(row.authorId) ?? [];
    list.push(row);
    byAuthor.set(row.authorId, list);
  }
  return {
    total,
    items: entities.map((entity) => ({ ...entity, postCount: counts.get(entity.id) ?? 0, translations: sortTranslations(byAuthor.get(entity.id) ?? []) })),
  };
};

export const getAuthorForAdmin = async (id: string) => {
  const [entity] = await db.select().from(blogAuthors).where(eq(blogAuthors.id, id)).limit(1);
  if (!entity) return null;
  const translations = sortTranslations(
    await db.select(authorColumns).from(blogAuthorTranslations).where(eq(blogAuthorTranslations.authorId, id)),
  );
  const counts = await authorPostCounts([id]);
  return { ...entity, postCount: counts.get(id) ?? 0, translations };
};

export const createAuthor = async (input: CreateAuthorInput, actorUserId: string) => {
  const { translations = [], sameAs = [], avatarUrl, avatarAlt, ...primary } = input;
  const id = await db.transaction(async (tx) => {
    const [entity] = await tx
      .insert(blogAuthors)
      .values({ avatarUrl: avatarUrl || null, avatarAlt: avatarAlt || null, sameAs })
      .returning({ id: blogAuthors.id });
    await tx.insert(blogAuthorTranslations).values([
      {
        authorId: entity.id,
        locale: primary.locale,
        slug: primary.slug,
        name: primary.name,
        role: primary.role ?? null,
        bio: primary.bio ?? null,
        seoTitle: primary.seoTitle ?? null,
        seoDescription: primary.seoDescription ?? null,
      },
      ...translations.map((translation) => ({
        authorId: entity.id,
        locale: translation.locale,
        slug: translation.slug,
        name: translation.name,
        role: translation.role ?? null,
        bio: translation.bio ?? null,
        seoTitle: translation.seoTitle ?? null,
        seoDescription: translation.seoDescription ?? null,
      })),
    ]);
    await audit(tx, actorUserId, 'blog.author.create', null, { authorId: entity.id, locale: primary.locale, slug: primary.slug });
    return entity.id;
  });
  return getAuthorForAdmin(id);
};

// '' у patch-рядку очищає необов'язкове поле (як у патчі статті); відсутній ключ —
// без змін. Вставка нової мови вимагає slug і name одразу.
const applyAuthorPatch = (patch: { slug?: string; name?: string; role?: string; bio?: string; seoTitle?: string; seoDescription?: string }) => {
  const values: Record<string, string | null> = {};
  for (const key of ['slug', 'name', 'role', 'bio', 'seoTitle', 'seoDescription'] as const) {
    if (patch[key] !== undefined) values[key] = patch[key] === '' ? null : patch[key]!;
  }
  return values;
};

export const updateAuthor = async (id: string, patch: UpdateAuthorInput, actorUserId: string) => {
  // Ключі сутності, яких торкнувся запит: аудит без них показав би «нічого не змінено»,
  // коли редактор лише завантажив аватар.
  const entityKeys = (['avatarUrl', 'avatarAlt', 'sameAs'] as const).filter((key) => patch[key] !== undefined);
  await db.transaction(async (tx) => {
    const [entity] = await tx.select({ id: blogAuthors.id }).from(blogAuthors).where(eq(blogAuthors.id, id)).limit(1);
    if (!entity) throw httpError('Author not found.', 404);

    // Аватар і профілі — не переклади: ключ `''` очищає поле, відсутній ключ лишає як було.
    if (patch.avatarUrl !== undefined || patch.avatarAlt !== undefined || patch.sameAs !== undefined) {
      const values: Record<string, unknown> = {};
      if (patch.avatarUrl !== undefined) values.avatarUrl = patch.avatarUrl === '' ? null : patch.avatarUrl;
      if (patch.avatarAlt !== undefined) values.avatarAlt = patch.avatarAlt === '' ? null : patch.avatarAlt;
      if (patch.sameAs !== undefined) values.sameAs = patch.sameAs;
      await tx.update(blogAuthors).set(values).where(eq(blogAuthors.id, id));
    }

    for (const translation of patch.translations ?? []) {
      const { locale, ...fields } = translation;
      const values = applyAuthorPatch(fields);
      const [existing] = await tx
        .select({ locale: blogAuthorTranslations.locale })
        .from(blogAuthorTranslations)
        .where(and(eq(blogAuthorTranslations.authorId, id), eq(blogAuthorTranslations.locale, locale)))
        .limit(1);
      if (existing) {
        if (Object.keys(values).length) {
          await tx
            .update(blogAuthorTranslations)
            .set(values)
            .where(and(eq(blogAuthorTranslations.authorId, id), eq(blogAuthorTranslations.locale, locale)));
        }
      } else {
        if (!fields.slug || !fields.name) throw httpError(`Translation for locale '${locale}' requires slug and name.`, 400);
        await tx.insert(blogAuthorTranslations).values({
          authorId: id,
          locale,
          slug: fields.slug,
          name: fields.name,
          role: fields.role ?? null,
          bio: fields.bio ?? null,
          seoTitle: fields.seoTitle ?? null,
          seoDescription: fields.seoDescription ?? null,
        });
      }
    }

    if (patch.removeLocales?.length) {
      await tx
        .delete(blogAuthorTranslations)
        .where(and(eq(blogAuthorTranslations.authorId, id), inArray(blogAuthorTranslations.locale, patch.removeLocales)));
    }
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(blogAuthorTranslations)
      .where(eq(blogAuthorTranslations.authorId, id));
    if (!remaining) throw httpError('The last translation cannot be removed.', 400);

    await audit(tx, actorUserId, 'blog.author.update', null, {
      authorId: id,
      locales: [...new Set([...(patch.translations ?? []).map((t) => t.locale), ...(patch.removeLocales ?? [])])].sort(),
      ...(entityKeys.length ? { entity: entityKeys } : {}),
    });
  });
  return getAuthorForAdmin(id);
};

/**
 * Видалення не чіпає статтей: `blog_posts.author_id` має ON DELETE SET NULL, тому рядки
 * лишаються з `authorName` (0010) і просто втрачають посилання на профіль. Аватар-файл
 * прибирається окремо — база про R2 не знає.
 */
export const deleteAuthor = async (id: string, actorUserId: string) =>
  db.transaction(async (tx) => {
    const [avatar] = await tx
      .select({ avatarUrl: blogAuthors.avatarUrl })
      .from(blogAuthors)
      .where(eq(blogAuthors.id, id))
      .limit(1);
    if (!avatar) throw httpError('Author not found.', 404);
    const translations = await tx
      .select({ locale: blogAuthorTranslations.locale, slug: blogAuthorTranslations.slug })
      .from(blogAuthorTranslations)
      .where(eq(blogAuthorTranslations.authorId, id));
    await tx.delete(blogAuthors).where(eq(blogAuthors.id, id));
    await audit(tx, actorUserId, 'blog.author.delete', null, {
      authorId: id,
      slugs: translations.map((t) => `${t.locale}:${t.slug}`),
    });
    return { avatarUrl: avatar.avatarUrl };
  });
