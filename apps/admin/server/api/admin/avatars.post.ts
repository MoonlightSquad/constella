import { adminProxy, readAdminBody } from '../../utils/admin-api';

const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Avatars reuse the covers staging prefix and the same signed-PUT flow, so this is the cover
 * route with a different final spec (512×512, `attention` crop) upstream.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  const contentType = String(body.contentType ?? '');
  if (!CONTENT_TYPES.has(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Дозволені JPEG, PNG або WebP.' });
  }
  return adminProxy(event, '/blog/admin/avatars', { method: 'POST', body: { contentType } });
});
