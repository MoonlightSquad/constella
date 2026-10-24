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
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 32;

const markdown = z.string().min(1).max(MAX_BODY_CHARACTERS);
const slug = z.string().trim().min(1).max(200).refine((value) => SLUG_RE.test(value), 'slug must match /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i');
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);
const httpUrl = (label: string) =>
  z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, `${label} must be an absolute http(s) URL`);

/** Lowercases, deduplicates and caps tags; leading `#` and padding are dropped. */
export const normalizeTags = (input: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (tag && tag.length <= MAX_TAG_LENGTH) seen.add(tag);
    if (seen.size === MAX_TAGS) break;
  }
  return [...seen];
};

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
  tags: z.array(z.unknown()).max(40).optional().transform((value) => normalizeTags(value ?? [])),
  seoTitle: optionalText(MAX_TITLE),
  seoDescription: optionalText(MAX_EXCERPT),
  authorName: optionalText(80),
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

export const publicListQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).default('uk'),
  tag: z.string().trim().max(MAX_TAG_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().max(200).optional(),
});

export const publicPostQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).default('uk'),
});

export const adminListQuerySchema = z.object({
  locale: z.enum(BLOG_LOCALES).optional(),
  status: z.enum(BLOG_STATUSES).optional(),
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

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PublicListInput = z.infer<typeof publicListQuerySchema>;
export type AdminListInput = z.infer<typeof adminListQuerySchema>;
