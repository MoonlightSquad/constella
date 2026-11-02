import { pickListParams } from '../../utils/blog-params.mjs';

export default eventHandler(async (event) => {
  const { data } = await fetchBlogOr(event, 'posts', pickListParams(getQuery(event)), { items: [], nextCursor: null });
  setHeader(event, 'cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
