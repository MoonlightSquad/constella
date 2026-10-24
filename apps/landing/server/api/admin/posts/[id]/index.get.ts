import { adminPostId, adminProxy } from '../../../../utils/admin-api';

export default eventHandler((event) => adminProxy(event, `/blog/admin/posts/${adminPostId(event)}`));
