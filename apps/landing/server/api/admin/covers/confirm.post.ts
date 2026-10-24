import { adminProxy, readAdminBody } from '../../../utils/admin-api';

const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * `objectKey` came from the signing response, but it arrives from the browser, so the shape
 * is re-checked here; ownership of the `blog/uploads/<userId>/` prefix is enforced upstream.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  const objectKey = String(body.objectKey ?? '');
  const contentType = String(body.contentType ?? '');
  if (!/^blog\/uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(objectKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Некоректний ключ файла.' });
  }
  if (!CONTENT_TYPES.has(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Дозволені JPEG, PNG або WebP.' });
  }
  return adminProxy(event, '/blog/admin/covers/confirm', { method: 'POST', body: { objectKey, contentType } });
});
