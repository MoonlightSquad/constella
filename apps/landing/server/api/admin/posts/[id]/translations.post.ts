import { adminPostId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

const LOCALES = new Set(['uk', 'en', 'de', 'fr']);

/**
 * Seeds the sibling row for another language, which is what keeps an hreflang cluster
 * complete instead of advertising a translation that does not exist.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  const locale = String(body.locale ?? '');
  if (!LOCALES.has(locale)) throw createError({ statusCode: 400, statusMessage: 'Невідома мова.' });
  return adminProxy(event, `/blog/admin/posts/${adminPostId(event)}/translations`, { method: 'POST', body: { locale } });
});
