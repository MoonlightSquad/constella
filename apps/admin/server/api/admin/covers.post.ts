import { adminProxy, readAdminBody } from '../../utils/admin-api';

const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Only the signing is server-side: the session token never leaves this origin and the
 * presigned URL is not kept in nitro state. The `PUT` itself goes from the browser
 * straight to object storage, so this origin has to be listed in the bucket CORS rules
 * (shape in scripts/r2-cors-lib.mjs); pasting a URL is the fallback when it is not.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  const contentType = String(body.contentType ?? '');
  if (!CONTENT_TYPES.has(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Дозволені JPEG, PNG або WebP.' });
  }
  return adminProxy(event, '/blog/admin/covers', { method: 'POST', body: { contentType } });
});
