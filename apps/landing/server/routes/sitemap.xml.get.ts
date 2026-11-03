import { fetchBlog } from '../utils/blog-fetch';
import { buildSitemapXml, postSitemapEntries, staticSitemapEntries, taxonomySitemapEntries } from '../utils/sitemap.mjs';

type PostRow = { groupId: string; locale: 'uk' | 'en' | 'de' | 'fr'; slug: string; updatedAt: string };
type TermRow = { id: string; locale: 'uk' | 'en' | 'de' | 'fr'; slug: string };

/**
 * Файл зібраний тут, а не в `@nuxtjs/sitemap`: модуль пише `text/xml` власноруч і не
 * залишає важеля це змінити, а `application/xml; charset=utf-8` — той тип, для якого
 * sitemap і створений.
 *
 * Один файл, а не індекс із чотирма дитячими sitemap-ами: на цьому масштабі поділ не
 * купує нічого, зате кожний дитячий — це окремий пошук у Google і окремий шанс на
 * «Не вдалося отримати». `robots.txt` вказує сюди, тож подача в Search Console не змінюється.
 *
 * `fetchBlog`, а не `fetchBlogOr`: відмова бази не повинна перетворюватися на «сайту
 * раптом немає нічого, окрім головної» — Google перечитує цей файл і за кількістю URL
 * робить висновок про індекс. Помилка не кешується, тому наступний запит піде вгору.
 */
export default eventHandler(async (event) => {
  const { siteUrl } = useRuntimeConfig().public;
  let posts: { data: { items: PostRow[] } | null } | undefined;
  let taxonomy: { data: { categories: TermRow[]; tags: TermRow[]; authors: TermRow[] } | null } | undefined;
  try {
    // `fetchBlog` віддає відмову апстриму як зійнятий `fetch`, а не як `data: null` — без
    // цього `try` файл отримував би 500 від Nitro замість нашого 502.
    [posts, taxonomy] = await Promise.all([
      fetchBlog<{ items: PostRow[] }>(event, 'sitemap', {}),
      fetchBlog<{ categories: TermRow[]; tags: TermRow[]; authors: TermRow[] }>(event, 'sitemapTaxonomy', {}),
    ]);
  } catch (cause) {
    console.warn('[sitemap] upstream unreachable:', cause);
  }

  if (!posts?.data?.items || !taxonomy?.data) {
    setHeader(event, 'cache-control', 'no-store');
    setHeader(event, 'retry-after', '60');
    throw createError({ statusCode: 502, message: 'Sitemap unavailable' });
  }

  const xml = buildSitemapXml(siteUrl, [
    ...staticSitemapEntries(),
    ...postSitemapEntries(posts.data.items),
    ...taxonomySitemapEntries(taxonomy.data),
  ]);

  // One hour at the edge, always revalidated from the origin: the file is small, and a
  // stale copy is what makes a newly published article invisible for a day.
  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=3600');
  return xml;
});
