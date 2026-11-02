const LOCALES = new Set(['uk', 'en', 'de', 'fr']);
// Категорії й теґи тепер ідентифікуються локалізованим slug — той самий формат, що й у постів.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

/** Only known parameters are forwarded: junk upstream would come back as an empty list. */
const pickListParams = (query: Record<string, unknown>) => ({
  locale: LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk',
  category: typeof query.category === 'string' && SLUG.test(query.category) ? query.category : undefined,
  tag: typeof query.tag === 'string' && SLUG.test(query.tag) ? query.tag : undefined,
  limit: Number.isInteger(Number(query.limit)) ? Math.min(50, Math.max(1, Number(query.limit))) : undefined,
  cursor: typeof query.cursor === 'string' && query.cursor.length <= 200 ? query.cursor : undefined,
});

export default eventHandler(async (event) => {
  const { data } = await fetchBlogOr(event, 'posts', pickListParams(getQuery(event)), { items: [], nextCursor: null });
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
