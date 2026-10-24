const LOCALES = new Set(['uk', 'en', 'de', 'fr']);

export default eventHandler(async (event) => {
  const query = getQuery(event);
  const locale = LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk';
  const { data } = await fetchBlogOr(event, 'tags', { locale }, { items: [] });
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
