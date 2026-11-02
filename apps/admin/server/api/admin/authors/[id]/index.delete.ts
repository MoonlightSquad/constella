import { adminEntityId, adminProxy } from '../../../../utils/admin-api';

export default eventHandler((event) =>
  adminProxy(event, `/blog/admin/authors/${adminEntityId(event, 'автора')}`, { method: 'DELETE' }));
