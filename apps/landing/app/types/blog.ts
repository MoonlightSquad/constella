export type BlogLocale = 'uk' | 'en' | 'de' | 'fr';

/** Mirrors the public columns of `/blog/posts`; the body never reaches this side. */
export type BlogPostSummary = {
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
