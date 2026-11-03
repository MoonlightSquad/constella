import type { AdminPostDetail, PostDraft } from '~/types/admin';

/** The DB stores NULL for a cleared field; the form uses '' so inputs stay controlled. */
export const emptyDraft = (): PostDraft => ({
  slug: '',
  title: '',
  excerpt: '',
  bodyMarkdown: '',
  categoryIds: [],
  tagIds: [],
  coverUrl: '',
  coverAlt: '',
  authorName: '',
  authorId: '',
  seoTitle: '',
  seoDescription: '',
  ogImageUrl: '',
  canonicalUrl: '',
  noindex: false,
});

export const draftFromPost = (post: AdminPostDetail | null): PostDraft => {
  if (!post) return emptyDraft();
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    categoryIds: post.categories.map((term) => term.id),
    tagIds: post.tags.map((term) => term.id),
    coverUrl: post.coverUrl ?? '',
    coverAlt: post.coverAlt ?? '',
    authorName: post.authorName ?? '',
    authorId: post.authorId ?? '',
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    ogImageUrl: post.ogImageUrl ?? '',
    canonicalUrl: post.canonicalUrl ?? '',
    noindex: post.noindex,
  };
};

const TEXT_FIELDS = [
  'slug', 'title', 'excerpt', 'bodyMarkdown', 'authorName', 'authorId', 'seoTitle', 'seoDescription',
  'coverUrl', 'coverAlt', 'ogImageUrl', 'canonicalUrl',
] as const;

/**
 * A PATCH carries only what changed, and an empty string means "clear this field"
 * upstream — so sending the whole draft would wipe untouched optional SEO rows.
 */
/** Чипи можна переставляти — порядок не значущий, тому порівнюємо як множини id. */
const sameIdSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

export const patchFromDraft = (post: AdminPostDetail, draft: PostDraft): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (draft[field] !== (post[field] ?? '')) patch[field] = draft[field];
  }

  if (!sameIdSet(draft.categoryIds, post.categories.map((term) => term.id))) patch.categoryIds = draft.categoryIds;
  if (!sameIdSet(draft.tagIds, post.tags.map((term) => term.id))) patch.tagIds = draft.tagIds;
  if (draft.noindex !== post.noindex) patch.noindex = draft.noindex;
  return patch;
};

/** A new post is a full create payload; empty optional strings become null for clarity. */
export const createFromDraft = (locale: string, draft: PostDraft, groupId?: string) => ({
  ...(groupId ? { groupId } : {}),
  locale,
  slug: draft.slug,
  title: draft.title,
  excerpt: draft.excerpt,
  bodyMarkdown: draft.bodyMarkdown,
  categoryIds: draft.categoryIds,
  tagIds: draft.tagIds,
  authorName: draft.authorName || undefined,
  authorId: draft.authorId || undefined,
  coverUrl: draft.coverUrl || undefined,
  coverAlt: draft.coverAlt || undefined,
  seoTitle: draft.seoTitle || undefined,
  seoDescription: draft.seoDescription || undefined,
  ogImageUrl: draft.ogImageUrl || undefined,
  canonicalUrl: draft.canonicalUrl || undefined,
  noindex: draft.noindex,
});
