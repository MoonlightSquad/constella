import { adminProxy, readAdminBody } from '../../../utils/admin-api';

export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  return adminProxy(event, '/blog/admin/tags', { method: 'POST', body });
});
