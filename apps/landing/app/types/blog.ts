export type BlogLocale = 'uk' | 'en' | 'de' | 'fr';

/** Категорія/теґ, прикріплені до рядка статті — вже перекладені мовою цього рядка. */
export type TermRef = { id: string; slug: string; name: string };

export type BlogCategory = { id: string; slug: string; name: string; description: string | null; postCount: number };

export type BlogTag = { id: string; slug: string; name: string; postCount: number };

/** Підпис-row: `{id, slug, name}` — профіль повністю тягне окрему URL-сторінку. */
export type AuthorRef = { id: string; slug: string; name: string };

export type BlogAuthorRow = {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  avatarUrl: string | null;
  avatarAlt: string | null;
  postCount: number;
};

/** `/blog/authors/:slug` — payload сторінки профілю. */
export type BlogAuthorArchive = {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  avatarUrl: string | null;
  avatarAlt: string | null;
  sameAs: string[] | null;
  postCount: number;
  alternates: TermAlternate[];
};

/** One language in which this term has published posts — an hreflang entry point. */
export type TermAlternate = { locale: BlogLocale; slug: string };

/**
 * Pillar-стаття категорії: той самий публічний профиль рядка, без таксономії — архів її
 * уже показує навколо. `null`, коли pin не прикріплений або не має рядка цієї мови.
 */
export type BlogPinnedPost = Omit<BlogPostSummary, 'categories' | 'tags'>;

/** `/blog/categories/:slug` — the archive page payload. */
export type BlogCategoryArchive = BlogCategory & {
  seoTitle: string | null;
  seoDescription: string | null;
  pinnedPost?: BlogPinnedPost | null;
  alternates: TermAlternate[];
};

/** `/blog/tags/:slug` — tags carry no SEO extras; the name is the description. */
export type BlogTagArchive = BlogTag & {
  /** Тонкий тег (одна стаття) — парний сигнал із sitemap: api каже, сторінка показує. */
  noindex?: boolean;
  alternates: TermAlternate[];
};

/** Mirrors the public columns of `/blog/posts`; the body never reaches this side. */
export type BlogPostSummary = {
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
  /** Рядок-автор, коли статтю підписано людиною; `authorName` лишається fallback'ом. */
  author?: AuthorRef | null;
};

export type BlogPost = BlogPostSummary & {
  /** Rendered by nitro: markdown-it never enters the client bundle. */
  html: string;
  toc: { level: number; id: string; text: string }[];
  status: 'draft' | 'published' | 'archived';
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  createdAt: string;
  updatedAt: string;
  alternates: { locale: BlogLocale; slug: string }[];
};
