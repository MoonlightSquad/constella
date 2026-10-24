import { adminPostId, adminProxy, readAdminBody } from '../../../../utils/admin-api';

const STATUSES = new Set(['draft', 'published', 'archived']);

/**
 * Publish/unpublish is the audited transition: the API refuses a `reason` shorter than
 * 8 characters, and it lands in `admin_audit_logs`, which the web admin already shows.
 */
export default eventHandler(async (event) => {
  const body = await readAdminBody(event);
  const status = String(body.status ?? '');
  if (!STATUSES.has(status)) throw createError({ statusCode: 400, statusMessage: 'Невідомий статус.' });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 8) throw createError({ statusCode: 400, statusMessage: 'Причина має бути щонайменше 8 символів.' });
  return adminProxy(event, `/blog/admin/posts/${adminPostId(event)}/status`, { method: 'POST', body: { status, reason } });
});
