import { clearAdminSession, requireWriteIntent } from '../../utils/admin-api';

/**
 * No upstream call: the JWT is stateless and short-lived, so dropping the cookie is the
 * logout. The write-intent gate still runs, otherwise any page could sign an editor out.
 */
export default eventHandler((event) => {
  requireWriteIntent(event);
  clearAdminSession(event);
  return { ok: true };
});
