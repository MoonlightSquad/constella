import type { BlogLocale } from './blog';

export type BlogStatus = 'draft' | 'published' | 'archived';

export type AdminPostRow = {
  id: string;
  groupId: string;
  locale: BlogLocale;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  publishedAt: string | null;
  readingMinutes: number;
  authorName: string;
  status: BlogStatus;
  noindex: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSibling = Pick<AdminPostRow, 'id' | 'locale' | 'slug' | 'status' | 'updatedAt'>;

/** `getPostForAdmin` adds the body and the rest of the language group. */
export type AdminPostDetail = Omit<AdminPostRow, 'excerpt'> & {
  excerpt: string;
  bodyMarkdown: string;
  siblings: AdminSibling[];
};

export type AdminSession = { userId: string; email: string | null };

export type AdminList = { total: number; items: AdminPostRow[] };

/** The editable projection: what the form holds and what a PATCH sends. */
export type PostDraft = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: string[];
  coverUrl: string;
  coverAlt: string;
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
  canonicalUrl: string;
  noindex: boolean;
};

export type CoverTicket = {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
  contentType: string;
};

export type CoverConfirmation = { coverKey: string; publicUrl: string; width: number; height: number; sizeBytes: number };
