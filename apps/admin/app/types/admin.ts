import type { BlogLocale, TermRef } from './blog';

export type BlogStatus = 'draft' | 'published' | 'archived';

export type AdminPostRow = {
  id: string;
  groupId: string;
  locale: BlogLocale;
  slug: string;
  title: string;
  excerpt: string;
  categories: TermRef[];
  tags: TermRef[];
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

/** Returned once by `admin.createAdmin`; the plaintext password is never stored. */
export type CreatedAdmin = { id: string; email: string; password: string };

export type AdminList = { total: number; items: AdminPostRow[] };

/** One language of a category/tag as the API returns it: cleared optional fields are null. */
export type AdminCategoryTranslation = {
  categoryId: string;
  locale: BlogLocale;
  slug: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type AdminTagTranslation = { tagId: string; locale: BlogLocale; slug: string; name: string };

/**
 * `pinnedPostGroupId` — pillar «почати тут»; id *групи* статті, не рядка й не слага.
 * Список його не віддає, тому поле необовʼязкове: редактор читає його лише з деталі.
 */
export type AdminCategoryRow = {
  id: string;
  createdAt: string;
  pinnedPostGroupId?: string | null;
  postCount: number;
  translations: AdminCategoryTranslation[];
};

export type AdminTagRow = { id: string; createdAt: string; postCount: number; translations: AdminTagTranslation[] };

export type AdminCategoryList = { total: number; items: AdminCategoryRow[] };

export type AdminTagList = { total: number; items: AdminTagRow[] };

/** The editable projection: what the form holds and what a PATCH sends. */
export type PostDraft = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  categoryIds: string[];
  tagIds: string[];
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
