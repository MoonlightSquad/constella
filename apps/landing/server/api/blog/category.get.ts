const LOCALES = new Set(['uk', 'en', 'de', 'fr']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

/** Те саме 404/502 розділення, що й у post.get.ts: порожній архів — 404, відмовлений апстрим — 502. */
export default eventHandler(async (event) => {
  const query = getQuery(event);
  const slug = typeof query.slug === 'string' && SLUG.test(query.slug) ? query.slug : '';
  const locale = LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk';
  if (!slug) throw createError({ statusCode: 404, statusMessage: 'Category not found' });

  let status: number;
  let data: unknown;
  try {
    ({ status, data } = await fetchBlog(event, 'category', { slug, locale }));
  } catch (cause) {
    console.warn(`[blog] taxonomy upstream unreachable for ${slug}/${locale}:`, cause);
    throw createError({ statusCode: 502, statusMessage: 'Blog upstream unreachable' });
  }
  if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Category not found' });
  if (!data) throw createError({ statusCode: 502, statusMessage: 'Blog upstream error' });

  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
