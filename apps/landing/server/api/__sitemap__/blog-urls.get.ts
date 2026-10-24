import { blogPath } from '../../utils/feed.mjs';
import { fetchBlogOr } from '../../utils/blog-fetch';
import { LOCALE_LANGUAGE } from '../../utils/blog-locales';

type SitemapRow = {
  groupId: string;
  locale: 'uk' | 'en' | 'de' | 'fr';
  slug: string;
  updatedAt: string;
};

export default eventHandler(async (event) => {
  const { data } = await fetchBlogOr<{ items: SitemapRow[] }>(event, 'sitemap', {}, { items: [] });

  const groups = new Map<string, SitemapRow[]>();
  for (const row of data.items) {
    const siblings = groups.get(row.groupId) ?? [];
    siblings.push(row);
    groups.set(row.groupId, siblings);
  }

  // Paths, not absolute URLs: the module only resolves a locale (and therefore the
  // per-language sitemap child) for relative locs, and it owns the host + trailing slash.
  return [...groups.values()].flatMap((rows) => {
    const primary = rows.find((row) => row.locale === 'uk') ?? rows[0];
    // Spelled out per article: a translated post has a different slug in each
    // language, which is exactly the case a locale-prefix template gets wrong.
    const alternatives = [
      { hreflang: 'x-default', href: blogPath(primary.locale, primary.slug) },
      ...rows.map((row) => ({ hreflang: LOCALE_LANGUAGE[row.locale], href: blogPath(row.locale, row.slug) })),
    ];
    return rows.map((row) => ({
      loc: blogPath(row.locale, row.slug),
      // Each locale variant is edited on its own schedule, so it reports its own date.
      lastmod: new Date(Date.parse(row.updatedAt)).toISOString(),
      alternatives,
    }));
  });
});
