const LOCALES = new Set(['uk', 'en', 'de', 'fr']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

export default eventHandler(async (event) => {
  const query = getQuery(event);
  const slug = typeof query.slug === 'string' && SLUG.test(query.slug) ? query.slug : '';
  const locale = LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk';
  if (!slug) throw createError({ statusCode: 404, statusMessage: 'Tag not found' });

  let status: number;
  let data: unknown;
  try {
    ({ status, data } = await fetchBlog(event, 'tag', { slug, locale }));
  } catch (cause) {
    console.warn(`[blog] taxonomy upstream unreachable for ${slug}/${locale}:`, cause);
    throw createError({ statusCode: 502, statusMessage: 'Blog upstream unreachable' });
  }
  if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Tag not found' });
  if (!data) throw createError({ statusCode: 502, statusMessage: 'Blog upstream error' });

  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
