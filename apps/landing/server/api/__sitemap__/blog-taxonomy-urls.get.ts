import { blogArchivePath } from '../../utils/feed.mjs';
import { fetchBlogOr } from '../../utils/blog-fetch';
import { LOCALE_LANGUAGE } from '../../utils/blog-locales';

type TaxonomyRow = { id: string; locale: 'uk' | 'en' | 'de' | 'fr'; slug: string };
type TaxonomyPayload = { categories: TaxonomyRow[]; tags: TaxonomyRow[]; authors: TaxonomyRow[] };

/** Як і з постами: шляхи відносно хоста, альтернативи — прописані по мовах і slug-ах. */
const rowsFor = (rows: TaxonomyRow[], kind: 'category' | 'tag' | 'author') => {
  const byId = new Map<string, TaxonomyRow[]>();
  for (const row of rows) {
    const group = byId.get(row.id) ?? [];
    group.push(row);
    byId.set(row.id, group);
  }
  return [...byId.values()].flatMap((group) => {
    const primary = group.find((row) => row.locale === 'uk') ?? group[0];
    const alternatives = [
      { hreflang: 'x-default', href: blogArchivePath(kind, primary.locale, primary.slug) },
      ...group.map((row) => ({ hreflang: LOCALE_LANGUAGE[row.locale], href: blogArchivePath(kind, row.locale, row.slug) })),
    ];
    return group.map((row) => ({ loc: blogArchivePath(kind, row.locale, row.slug), alternatives }));
  });
};

export default eventHandler(async (event) => {
  const { data } = await fetchBlogOr(event, 'sitemapTaxonomy', {}, { categories: [], tags: [], authors: [] });
  return [...rowsFor(data.categories, 'category'), ...rowsFor(data.tags, 'tag'), ...rowsFor(data.authors, 'author')];
});
