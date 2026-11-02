import { adminEntityId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  if (!Object.keys(body).length) throw createError({ statusCode: 400, statusMessage: 'Немає змін для збереження.' });
  return adminProxy(event, `/blog/admin/tags/${adminEntityId(event, 'тег')}`, { method: 'PATCH', body });
});
