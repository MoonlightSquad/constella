import { pickListParams } from '../../utils/blog-params.mjs';

/**
 * Список статей — не декоративний рядок на кшталт категорій у футері, тому тут немає
 * фолбека `{ items: [] }`: порожня головна блогу, згенерована під час відмові бази,
 * закрилась би в ISR на хвилину й потрапила б в індекс як «блог порожній», а JSON-LD
 * ItemList на тій самій сторінці став би пустим. Відмова — це 502 із retry-after і
 * без кешу: нею ми кажемо краулеру повернутися, а не переписати зміст.
 */
export default eventHandler(async (event) => {
  const params = pickListParams(getQuery(event));
  let status = 0;
  let data: unknown = null;
  try {
    ({ status, data } = await fetchBlog(event, 'posts', params));
  } catch (cause) {
    console.warn('[blog] list upstream unreachable:', cause);
  }
  if (!data) {
    setHeader(event, 'cache-control', 'no-store');
    setHeader(event, 'retry-after', '30');
    throw createError({
      statusCode: status === 429 ? 429 : 502,
      message: 'Список статей тимчасово недоступний',
    });
  }

  // Список найновішого кешується, видача пошуку — ні: це не той самий вміст, і тримати
  // чужий рядок в Edge хвилину ніхто не просив.
  setHeader(event, 'cache-control', params.search ? 'no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return data;
});
