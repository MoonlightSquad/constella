import { adminProxy, readAdminBody } from '../../../utils/admin-api';

/** Field rules live in the API (`createPostSchema`); a new post is always a draft there. */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  return adminProxy(event, '/blog/admin/posts', { method: 'POST', body });
});
