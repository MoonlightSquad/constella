import ukCopy from '../../../i18n/locales/uk.json';
import deCopy from '../../../i18n/locales/de.json';
import enCopy from '../../../i18n/locales/en.json';
import frCopy from '../../../i18n/locales/fr.json';
import { buildRss } from '../../utils/feed.mjs';
import { fetchBlogOr } from '../../utils/blog-fetch';
import { LOCALE_LANGUAGE } from '../../utils/blog-locales';

// The feed channel reuses the blog page's own title and description, so there is
// one string to translate per site rather than two that drift apart.
const COPY: Record<string, { title: string, desc: string }> = {
  uk: ukCopy.meta.blog,
  en: enCopy.meta.blog,
  de: deCopy.meta.blog,
  fr: frCopy.meta.blog,
};

type FeedItem = {
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  publishedAt: string | null;
};

export default eventHandler(async (event) => {
  // Nitro turns `[locale].xml` into one loose parameter (`/feed/uk.atom` reaches this
  // handler too), so the accepted shape is checked against the request path itself.
  const match = /^\/feed\/(uk|en|de|fr)\.xml$/.exec(getRequestURL(event).pathname);
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Feed not found' });
  const locale = match[1] as keyof typeof LOCALE_LANGUAGE;

  // The public list already caps to published posts, newest first.
  const { data } = await fetchBlogOr<{ items: FeedItem[] }>(event, 'posts', { locale, limit: 20 }, { items: [] });

  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
  return buildRss({
    locale,
    language: LOCALE_LANGUAGE[locale],
    siteUrl: useRuntimeConfig(event).public.siteUrl,
    title: COPY[locale].title,
    description: COPY[locale].desc,
    items: data.items,
  });
});
