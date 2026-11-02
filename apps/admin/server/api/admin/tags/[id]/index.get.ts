import { adminEntityId, adminProxy } from '../../../../utils/admin-api';

export default eventHandler((event) => adminProxy(event, `/blog/admin/tags/${adminEntityId(event, 'тег')}`));
