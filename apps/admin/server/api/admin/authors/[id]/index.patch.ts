import { adminEntityId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

/**
 * The patch carries `translations[]` (only changed locales), `removeLocales[]`, the entity-level
 * `avatarUrl`/`avatarAlt` and the whole `sameAs` list; omitted keys stay untouched upstream.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  if (!Object.keys(body).length) throw createError({ statusCode: 400, statusMessage: 'Немає змін для збереження.' });
  return adminProxy(event, `/blog/admin/authors/${adminEntityId(event, 'автора')}`, { method: 'PATCH', body });
});
