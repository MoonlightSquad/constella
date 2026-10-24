const LOCALES = new Set(['uk', 'en', 'de', 'fr']);

/** Tags are free text in any script ("орбіта", "product"), so only the shape is checked. */
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,31}$/u;

/** Only known parameters are forwarded: junk upstream would come back as an empty list. */
const pickListParams = (query: Record<string, unknown>) => ({
  locale: LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk',
  tag: typeof query.tag === 'string' && TAG.test(query.tag.trim()) ? query.tag.trim() : undefined,
  limit: Number.isInteger(Number(query.limit)) ? Math.min(50, Math.max(1, Number(query.limit))) : undefined,
  cursor: typeof query.cursor === 'string' && query.cursor.length <= 200 ? query.cursor : undefined,
});

export default eventHandler(async (event) => {
  const { data } = await fetchBlogOr(event, 'posts', pickListParams(getQuery(event)), { items: [], nextCursor: null });
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
