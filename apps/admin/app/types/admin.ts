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
  /** Рядок `blog_authors`; окремо від `authorName`, який лишається вільним підписом. */
  authorId: string | null;
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

/**
 * Одна мова автора: роль і біо перекладаються (людину перекладають, а не транслітерують),
 * аватар і `sameAs` — на всього автора одна пара, тому вони в `AdminAuthorRow`.
 */
export type AdminAuthorTranslation = {
  authorId: string;
  locale: BlogLocale;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type AdminAuthorRow = {
  id: string;
  createdAt: string;
  avatarUrl: string | null;
  avatarAlt: string | null;
  sameAs: string[] | null;
  postCount: number;
  translations: AdminAuthorTranslation[];
};

export type AdminAuthorList = { total: number; items: AdminAuthorRow[] };

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
  /** id автора з select; '' — «не підписано рядком», тоді працює `authorName`. */
  authorId: string;
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

/**
 * Confirm-відповідь сховища: ключ (`coverKey`/`avatarKey`) формі не потрібен, вона бере
 * лише `publicUrl`, тому один тип на обкладинку й на аватар.
 */
export type ImageConfirmation = { publicUrl: string; width: number; height: number; sizeBytes: number };
