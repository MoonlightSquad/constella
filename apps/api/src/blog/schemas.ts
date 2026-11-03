import { z } from 'zod';

export const BLOG_LOCALES = ['uk', 'en', 'de', 'fr'] as const;
export const BLOG_STATUSES = ['draft', 'published', 'archived'] as const;

// The admin UI transliterates Cyrillic before submitting; anything non-ASCII here is
// a client bug or an attempt to smuggle a URL segment, so it is rejected, not fixed.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;
const SLUG_RE = new RegExp(SLUG_PATTERN.source);

export const MAX_TITLE = 200;
export const MAX_EXCERPT = 500;
// The Fastify body limit is 1 MiB; Cyrillic prose costs 2 bytes per character, so the
// cap keeps a maximal body comfortably below the transport limit.
export const MAX_BODY_CHARACTERS = 120_000;
export const MAX_CATEGORIES = 3;
export const MAX_TAGS = 8;
export const MAX_CATEGORY_NAME = 120;
export const MAX_TAG_NAME = 32;
export const MAX_AUTHOR_NAME = 120;
export const MAX_AUTHOR_ROLE = 120;
export const MAX_AUTHOR_BIO = 1000;
export const MAX_SAME_AS = 8;

// `/blog/<slug>` is one segment, `/blog/category/…`, `/blog/tag/…`, `/blog/author/…` and
// `/blog/search` are two: a post carrying either of these slugs could never be reached at the
// bare archive root, so they are refused outright rather than shadowed.
export const RESERVED_POST_SLUGS = new Set(['category', 'tag', 'author', 'search']);

const markdown = z.string().min(1).max(MAX_BODY_CHARACTERS);
const entitySlug = z.string().trim().min(1).max(200).refine((value) => SLUG_RE.test(value), 'slug must match /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i');
const slug = entitySlug.refine((value) => !RESERVED_POST_SLUGS.has(value), 'slug is reserved for taxonomy archives');
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
// Patch variant: an empty string must survive the parse so `toNull` can clear the column.
const optionalPatchText = (max: number) => z.string().trim().max(max).optional();
/** Посилання на чужий рядок: uuid, або '' — «прибрати» (той самий жест, що й у текстових полях). */
const optionalId = z.union([z.literal(''), z.string().uuid()]).optional();
const httpUrl = (label: string) =>
  z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, `${label} must be an absolute http(s) URL`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Comma-separated ids in a single query parameter, which is what a URL can carry.
 */
const idList = (max: number) =>
  z
    .string()
    .transform((raw) => raw.split(',').map((id) => id.trim()).filter(Boolean))
    .refine((ids) => ids.length >= 1 && ids.length <= max, `expected 1-${max} comma-separated ids`)
    .refine((ids) => ids.every((id) => UUID.test(id)), 'every id must be a uuid');

/** `coverAlt` is enforced here rather than in the editor, so no client can skip it. */
export const requireAltForCover = <T extends { coverUrl?: string | null; coverAlt?: string | null }>(value: T, ctx: z.RefinementCtx) => {
  if (value.coverUrl && !value.coverAlt?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coverAlt'], message: 'coverAlt is required when coverUrl is set' });
  }
};

const mediaFields = {
  coverUrl: httpUrl('coverUrl').optional().or(z.literal('')),
  coverAlt: optionalText(200),
  ogImageUrl: httpUrl('ogImageUrl').optional().or(z.literal('')),
  canonicalUrl: httpUrl('canonicalUrl').optional().or(z.literal('')),
  noindex: z.boolean().optional(),
};

const contentFields = {
  slug,
  title: z.string().trim().min(1).max(MAX_TITLE),
  excerpt: z.string().trim().min(1).max(MAX_EXCERPT),
  bodyMarkdown: markdown,
  categoryIds: z.array(z.string().uuid()).max(MAX_CATEGORIES).optional(),
  tagIds: z.array(z.string().uuid()).max(MAX_TAGS).optional(),
  seoTitle: optionalText(MAX_TITLE),
  seoDescription: optionalText(MAX_EXCERPT),
  authorName: optionalText(80),
  // Автор-рядок (0016) і його підпис у тексті — різні речі: `authorId` ставлять людині,
  // `authorName` лишається вільним рядком для тих, кого не підписали. Немодифіковане
  // значення — `undefined`, зняття підпису — `''` (перетворюється на NULL у `toNull`).
  authorId: optionalId,
  ...mediaFields,
};

// A new post is always a draft: going public is a separate, audited transition.
export const createPostSchema = z
  .object({
    locale: z.enum(BLOG_LOCALES),
    groupId: z.string().uuid().optional(),
    ...contentFields,
  })
  .superRefine(requireAltForCover);

export const updatePostSchema = z
  .object(contentFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided')
  .superRefine(requireAltForCover);

export const publishStatusSchema = z.object({
  status: z.enum(BLOG_STATUSES),
  reason: z.string().trim().min(8).max(500),
});

export const translationSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
});

const noDuplicateLocales = <T extends { locale: string }>(items: readonly T[], ctx: z.RefinementCtx, path: string) => {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.locale)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path, index, 'locale'], message: `duplicate locale '${item.locale}'` });
    }
    seen.add(item.locale);
  }
};

// Категорія: одна сутність + переклад на мову. `translations` при створенні — додаткові
// мови окрім primary `locale`; при оновленні — upsert (вставиться, якщо мови ще немає).
const categoryTranslationSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug,
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME),
  description: optionalText(MAX_EXCERPT),
  seoTitle: optionalText(MAX_TITLE),
  seoDescription: optionalText(MAX_EXCERPT),
});

const categoryTranslationPatchSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug.optional(),
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME).optional(),
  description: optionalPatchText(MAX_EXCERPT),
  seoTitle: optionalPatchText(MAX_TITLE),
  seoDescription: optionalPatchText(MAX_EXCERPT),
});

const tagTranslationSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug,
  name: z.string().trim().min(1).max(MAX_TAG_NAME),
});

const tagTranslationPatchSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug.optional(),
  name: z.string().trim().min(1).max(MAX_TAG_NAME).optional(),
});

const termExtraTranslations = <T extends z.ZodTypeAny>(translation: T) =>
  z.array(translation).max(BLOG_LOCALES.length - 1).optional();

/**
 * Pillar категорії — id *групи* статті, не слага й не id рядка: група одна для чотирьох мов,
 * тому переклад архіву не може показати чужу «почати тут». `''` очищає pin (як `''` у полі
 * статті), відсутній ключ — без змін.
 */
const pinnedPostGroupId = optionalId;

export const createCategorySchema = z
  .object({
    locale: z.enum(BLOG_LOCALES),
    slug: entitySlug,
    name: z.string().trim().min(1).max(MAX_CATEGORY_NAME),
    description: optionalText(MAX_EXCERPT),
    seoTitle: optionalText(MAX_TITLE),
    seoDescription: optionalText(MAX_EXCERPT),
    pinnedPostGroupId,
    translations: termExtraTranslations(categoryTranslationSchema),
  })
  .superRefine((value, ctx) => {
    const extras = (value.translations ?? []).filter((t) => t.locale === value.locale);
    if (extras.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['translations'], message: `primary locale '${value.locale}' must not repeat in translations` });
    }
    noDuplicateLocales(value.translations ?? [], ctx, 'translations');
  });

export const updateCategorySchema = z
  .object({
    pinnedPostGroupId,
    translations: z.array(categoryTranslationPatchSchema).max(BLOG_LOCALES.length).optional(),
    removeLocales: z.array(z.enum(BLOG_LOCALES)).max(BLOG_LOCALES.length).optional(),
  })
  // Pin — не переклад: редактор має зберегти й лише його, інакше `{ pinnedPostGroupId: '<id>' }`
  // відбився б бідою «хоча б один переклад».
  .refine(
    (value) =>
      (value.translations?.length ?? 0) + (value.removeLocales?.length ?? 0) > 0 || value.pinnedPostGroupId !== undefined,
    'at least one translation or the pinned article must be provided',
  )
  .superRefine((value, ctx) => noDuplicateLocales(value.translations ?? [], ctx, 'translations'));

export const createTagSchema = z
  .object({
    locale: z.enum(BLOG_LOCALES),
    slug: entitySlug,
    name: z.string().trim().min(1).max(MAX_TAG_NAME),
    translations: termExtraTranslations(tagTranslationSchema),
  })
  .superRefine((value, ctx) => {
    const extras = (value.translations ?? []).filter((t) => t.locale === value.locale);
    if (extras.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['translations'], message: `primary locale '${value.locale}' must not repeat in translations` });
    }
    noDuplicateLocales(value.translations ?? [], ctx, 'translations');
  });

export const updateTagSchema = z
  .object({
    translations: z.array(tagTranslationPatchSchema).max(BLOG_LOCALES.length).optional(),
    removeLocales: z.array(z.enum(BLOG_LOCALES)).max(BLOG_LOCALES.length).optional(),
  })
  .refine((value) => (value.translations?.length ?? 0) + (value.removeLocales?.length ?? 0) > 0, 'at least one translation must be provided')
  .superRefine((value, ctx) => noDuplicateLocales(value.translations ?? [], ctx, 'translations'));

// Автор — ровно та сама форма, що категорія з 0015: одна сутність і переклад на мову.
// Роль і біо пишуться мовою архіву (людину перекладають, а не транслітерують), тоді як
// аватар і sameAs живуть на сутності: це одне фото й один набір профілів на всі чотири мови.
const authorTranslationSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug,
  name: z.string().trim().min(1).max(MAX_AUTHOR_NAME),
  role: optionalText(MAX_AUTHOR_ROLE),
  bio: optionalText(MAX_AUTHOR_BIO),
  seoTitle: optionalText(MAX_TITLE),
  seoDescription: optionalText(MAX_EXCERPT),
});

const authorTranslationPatchSchema = z.object({
  locale: z.enum(BLOG_LOCALES),
  slug: entitySlug.optional(),
  name: z.string().trim().min(1).max(MAX_AUTHOR_NAME).optional(),
  role: optionalPatchText(MAX_AUTHOR_ROLE),
  bio: optionalPatchText(MAX_AUTHOR_BIO),
  seoTitle: optionalPatchText(MAX_TITLE),
  seoDescription: optionalPatchText(MAX_EXCERPT),
});

/** Портрет автора — та сама вимога, що й обкладинка статті: картинка без опису мовчить. */
export const requireAltForAvatar = <T extends { avatarUrl?: string | null; avatarAlt?: string | null }>(value: T, ctx: z.RefinementCtx) => {
  if (value.avatarUrl && !value.avatarAlt?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['avatarAlt'], message: 'avatarAlt is required when avatarUrl is set' });
  }
};

const sameAsSchema = z.array(httpUrl('sameAs')).max(MAX_SAME_AS).optional();

export const createAuthorSchema = z
  .object({
    locale: z.enum(BLOG_LOCALES),
    slug: entitySlug,
    name: z.string().trim().min(1).max(MAX_AUTHOR_NAME),
    role: optionalText(MAX_AUTHOR_ROLE),
    bio: optionalText(MAX_AUTHOR_BIO),
    seoTitle: optionalText(MAX_TITLE),
    seoDescription: optionalText(MAX_EXCERPT),
    avatarUrl: httpUrl('avatarUrl').optional().or(z.literal('')),
    avatarAlt: optionalText(200),
    sameAs: sameAsSchema,
    translations: termExtraTranslations(authorTranslationSchema),
  })
  .superRefine((value, ctx) => {
    const extras = (value.translations ?? []).filter((t) => t.locale === value.locale);
    if (extras.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['translations'], message: `primary locale '${value.locale}' must not repeat in translations` });
    }
    noDuplicateLocales(value.translations ?? [], ctx, 'translations');
    requireAltForAvatar(value, ctx);
  });

export const updateAuthorSchema = z
  .object({
    avatarUrl: httpUrl('avatarUrl').optional().or(z.literal('')),
    avatarAlt: optionalPatchText(200),
    sameAs: sameAsSchema,
    translations: z.array(authorTranslationPatchSchema).max(BLOG_LOCALES.length).optional(),
    removeLocales: z.array(z.enum(BLOG_LOCALES)).max(BLOG_LOCALES.length).optional(),
  })
  // Аватар і профілі — не переклади: редактор має зберегти лише їх, інакше єдиний
  // завантажений файл відбився б бідою «хоча б один переклад».
  .refine(
    (value) =>
      (value.translations?.length ?? 0) + (value.removeLocales?.length ?? 0) > 0 ||
      value.avatarUrl !== undefined ||
      value.avatarAlt !== undefined ||
      value.sameAs !== undefined,
    'at least one translation or an author field must be provided',
  )
  .superRefine((value, ctx) => {
    noDuplicateLocales(value.translations ?? [], ctx, 'translations');
    requireAltForAvatar(value, ctx);
  });

export const publicListQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).default('uk'),
  category: entitySlug.optional(),
  tag: entitySlug.optional(),
  // Слаг автора з `blog_author_translations`, тобто локалізований — як у категорій і тегів.
  author: entitySlug.optional(),
  // Не менше двох символів: однієї літери на цьому архіві вистачить, щоб «знайти все», і
  // сторінка почне виглядати зламаною. Довше 80 — уже не пошуковий рядок, а цитата.
  search: z.string().trim().min(2).max(80).optional(),
  // Post *group* ids, not slugs: a group is language-independent, so an article already on
  // the page stays excluded whatever locale the caller asks for.
  exclude: idList(8).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().max(200).optional(),
});

export const publicPostQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).default('uk'),
});

export const adminListQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).optional(),
  status: z.enum(BLOG_STATUSES).optional(),
  // Адмінка оперує id, а не локалізованими слагами: редактор обирає статтю для pillar
  // так само, як категорія тримає свої зв'язки — за id групи.
  category: z.string().uuid().optional(),
  author: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const adminTermListQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const coverUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const coverConfirmSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const encodeCursor = (publishedAt: Date, id: string) =>
  Buffer.from(JSON.stringify({ t: publishedAt.getTime(), i: id }), 'utf8').toString('base64url');

/** Returns `null` for anything malformed instead of throwing: a bad cursor is a 400, not a 500. */
export const decodeCursor = (raw?: string | null): { publishedAt: Date; id: string } | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { t, i } = parsed as { t?: unknown; i?: unknown };
    if (typeof t !== 'number' || !Number.isFinite(t) || typeof i !== 'string' || !/^[0-9a-f-]{36}$/i.test(i)) return null;
    return { publishedAt: new Date(t), id: i };
  } catch {
    return null;
  }
};

const WORD_COUNT = /[\p{L}\p{N}]+/gu;

/**
 * Reading time is stored, not computed per request: it belongs to the editing loop
 * (the author sees the number they are writing towards) and keeps list SSR free of
 * full-body reads.
 */
export const estimateReadingMinutes = (bodyMarkdown: string) => {
  const words = (bodyMarkdown.replace(/```[\s\S]*?```/g, ' ').match(WORD_COUNT) ?? []).length;
  return Math.min(240, Math.max(1, Math.round(words / 180)));
};

/**
 * Маска для `ILIKE`, а не готовий взірець: без екранування `%` у рядку запитувача перетворював
 * пошук на «усі статті», а `_` — на «будь-який символ», тобто `cat_x` ловив би `catqx`.
 * Зворотний слеш подвоюється тим самим класом, що й решта, — інакше він екранував би власні
 * подвоєння. Postgres без `ESCAPE` вважає екраном саме backslash, тому додаткового клауза немає.
 */
export const likePattern = (term: string) => `%${term.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PublicListInput = z.infer<typeof publicListQuerySchema>;
export type AdminListInput = z.infer<typeof adminListQuerySchema>;
export type AdminTermListInput = z.infer<typeof adminTermListQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;
export type UpdateAuthorInput = z.infer<typeof updateAuthorSchema>;
