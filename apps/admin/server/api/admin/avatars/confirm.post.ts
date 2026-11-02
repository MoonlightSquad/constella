import { adminProxy, readAdminBody } from '../../../utils/admin-api';

const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Same `blog/uploads/<userId>/` guard as the covers confirm: the key came from the browser. */
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
  return adminProxy(event, '/blog/admin/avatars/confirm', { method: 'POST', body: { objectKey, contentType } });
});
