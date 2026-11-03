import ukCopy from '../../../i18n/locales/uk.json';
import deCopy from '../../../i18n/locales/de.json';
import enCopy from '../../../i18n/locales/en.json';
import frCopy from '../../../i18n/locales/fr.json';
import { buildRss } from '../../utils/feed.mjs';
import { fetchBlog } from '../../utils/blog-fetch';
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
  //
  // `fetchBlog`, а не `fetchBlogOr`: фолбек із `{ items: [] }` перетворив би відмову бази
  // на «у блогу жодної статті» — чинний RSS-канал, який край тримає десять хвилин і який
  // кожна читалка запам'ятає як порожній. 502 з retry-after означає «спробуй пізніше».
  let feed: { items: FeedItem[] } | null = null;
  try {
    ({ data: feed } = await fetchBlog<{ items: FeedItem[] }>(event, 'posts', { locale, limit: 20 }));
  } catch (cause) {
    console.warn(`[feed] upstream unreachable for ${locale}:`, cause);
  }
  if (!feed) {
    setHeader(event, 'cache-control', 'no-store');
    setHeader(event, 'retry-after', '60');
    throw createError({ statusCode: 502, message: 'Feed unavailable' });
  }

  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
  return buildRss({
    locale,
    language: LOCALE_LANGUAGE[locale],
    siteUrl: useRuntimeConfig(event).public.siteUrl,
    title: COPY[locale].title,
    description: COPY[locale].desc,
    items: feed.items,
  });
});
