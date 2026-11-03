const LOCALES = new Set(['uk', 'en', 'de', 'fr']);
// Категорії й теґи тепер ідентифікуються локалізованим slug — той самий формат, що й у постів.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Список залишається рядком: API розбиває його сам, а тут лише відсіюємо сміття, щоб
 * один невалідний id не перетворив сторінку на 400.
 */
const pickExclude = (value) => {
  if (typeof value !== 'string') return undefined;
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID.test(id))
    .slice(0, 8);
  return ids.length ? ids.join(',') : undefined;
};

/** Only known parameters are forwarded: junk upstream would come back as an empty list. */
export const pickListParams = (query) => ({
  locale: LOCALES.has(String(query.locale)) ? String(query.locale) : 'uk',
  category: typeof query.category === 'string' && SLUG.test(query.category) ? query.category : undefined,
  tag: typeof query.tag === 'string' && SLUG.test(query.tag) ? query.tag : undefined,
  // Архів автора фільтрується саме тут, а не на сторінці: відсіяний параметр не дає
  // помилки — він просто показує «найновіше» замість статей людини, а на блозі з одним
  // автором це виглядає як справна сторінка.
  author: typeof query.author === 'string' && SLUG.test(query.author) ? query.author : undefined,
  exclude: pickExclude(query.exclude),
  limit: Number.isInteger(Number(query.limit)) ? Math.min(50, Math.max(1, Number(query.limit))) : undefined,
  cursor: typeof query.cursor === 'string' && query.cursor.length <= 200 ? query.cursor : undefined,
});
