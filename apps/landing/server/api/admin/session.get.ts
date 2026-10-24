import { adminProxy } from '../../utils/admin-api';

/**
 * The page-load re-authorization: upstream verifies the signature and re-reads
 * `sessionVersion` / `bannedAt`, so a revoked account is logged out on the next navigation
 * instead of at token expiry.
 */
export default eventHandler((event) => adminProxy(event, '/blog/admin/session'));
