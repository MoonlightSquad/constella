import { adminProxy, readAdminBody } from '../../../utils/admin-api';

/** Field rules live in the API (`createAuthorSchema`); the primary locale names the entity. */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  return adminProxy(event, '/blog/admin/authors', { method: 'POST', body });
});
