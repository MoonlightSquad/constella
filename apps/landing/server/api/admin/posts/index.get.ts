import { adminProxy } from '../../../utils/admin-api';

const LOCALES = new Set(['uk', 'en', 'de', 'fr']);
const STATUSES = new Set(['draft', 'published', 'archived']);

/** Only the parameters the API knows are forwarded; anything else would come back as a 400. */
const pickListParams = (query: Record<string, unknown>) => ({
  locale: LOCALES.has(String(query.locale)) ? String(query.locale) : undefined,
  status: STATUSES.has(String(query.status)) ? String(query.status) : undefined,
  search: typeof query.search === 'string' && query.search.trim() ? query.search.trim().slice(0, 100) : undefined,
  limit: Number.isInteger(Number(query.limit)) ? Math.min(100, Math.max(1, Number(query.limit))) : undefined,
  offset: Number.isInteger(Number(query.offset)) && Number(query.offset) >= 0 ? Number(query.offset) : undefined,
});

export default eventHandler((event) => adminProxy(event, '/blog/admin/posts', { query: pickListParams(getQuery(event)) }));
