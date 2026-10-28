import type { AdminPostDetail, PostDraft } from '~/types/admin';

/** The DB stores NULL for a cleared field; the form uses '' so inputs stay controlled. */
export const emptyDraft = (): PostDraft => ({
  slug: '',
  title: '',
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  coverUrl: '',
  coverAlt: '',
  authorName: '',
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
    tags: [...post.tags],
    coverUrl: post.coverUrl ?? '',
    coverAlt: post.coverAlt ?? '',
    authorName: post.authorName ?? '',
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    ogImageUrl: post.ogImageUrl ?? '',
    canonicalUrl: post.canonicalUrl ?? '',
    noindex: post.noindex,
  };
};

const TEXT_FIELDS = [
  'slug', 'title', 'excerpt', 'bodyMarkdown', 'authorName', 'seoTitle', 'seoDescription',
  'coverUrl', 'coverAlt', 'ogImageUrl', 'canonicalUrl',
] as const;

/**
 * A PATCH carries only what changed, and an empty string means "clear this field"
 * upstream — so sending the whole draft would wipe untouched optional SEO rows.
 */
export const patchFromDraft = (post: AdminPostDetail, draft: PostDraft): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (draft[field] !== (post[field] ?? '')) patch[field] = draft[field];
  }

  if (draft.tags.join('\u0000') !== post.tags.join('\u0000')) patch.tags = draft.tags;
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
  tags: draft.tags,
  authorName: draft.authorName || undefined,
  coverUrl: draft.coverUrl || undefined,
  coverAlt: draft.coverAlt || undefined,
  seoTitle: draft.seoTitle || undefined,
  seoDescription: draft.seoDescription || undefined,
  ogImageUrl: draft.ogImageUrl || undefined,
  canonicalUrl: draft.canonicalUrl || undefined,
  noindex: draft.noindex,
});
