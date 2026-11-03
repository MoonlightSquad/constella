import { adminEntityId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

/**
 * The patch carries `translations[]` (only changed locales), `removeLocales[]` and the
 * `pinnedPostGroupId` pin ('' clears it); omitted keys stay untouched upstream.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  if (!Object.keys(body).length) throw createError({ statusCode: 400, statusMessage: 'Немає змін для збереження.' });
  return adminProxy(event, `/blog/admin/categories/${adminEntityId(event, 'категорію')}`, { method: 'PATCH', body });
});
