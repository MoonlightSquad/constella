import { adminPostId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

/**
 * The patch is the field set the editor actually changed, sent whole: the API treats an
 * omitted key as "unchanged" and an empty string as "clear", so `""` is meaningful here.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  if (!Object.keys(body).length) throw createError({ statusCode: 400, statusMessage: 'Немає змін для збереження.' });
  return adminProxy(event, `/blog/admin/posts/${adminPostId(event)}`, { method: 'PATCH', body });
});
