/**
 * The procedures this console may reach, and what kind of call each one is.
 *
 * A URL-prefix allowlist is not enough here: tRPC puts procedure names in the path and joins a
 * batch with commas, so `/api/trpc/admin.users,anything.at.all` would sail past a prefix check.
 * Every name in every batch is looked up individually. Adding a procedure to the API and to this
 * table happens in the same commit — an unlisted name is a 403, never a silent pass.
 */
export const TRPC_PROCEDURES = {
  'admin.access': 'query',
  'admin.admins': 'query',
  'admin.createAdmin': 'mutation',
  'admin.revokeAdmin': 'mutation',
  'admin.overview': 'query',
  'admin.users': 'query',
  'admin.reports': 'query',
  'admin.reviewReport': 'mutation',
  'admin.setUserStatus': 'mutation',
  'admin.grantVip': 'mutation',
  'admin.photoQueue': 'query',
  'admin.reviewPhoto': 'mutation',
  'admin.payments': 'query',
  'admin.audit': 'query',
  'admin.subscription': 'query',
  'admin.userContent': 'query',
  'admin.setEntitlement': 'mutation',
  'admin.cancelEntitlement': 'mutation',
  'admin.forceLogout': 'mutation',
  'admin.updateUserProfile': 'mutation',
  'admin.metrics': 'query',
  'admin.pushRecipients': 'query',
  'admin.pushBroadcast': 'mutation',
  'support.adminQueue': 'query',
  'support.adminThread': 'query',
  'support.adminReply': 'mutation',
};

const NAME_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/i;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BATCH = 20;

/**
 * `admin.users,admin.overview` — the last path segment of `/api/trpc/…`, plus the verb it
 * arrived on. A mutation on a read method is refused: the CSRF gate only runs for POST, so
 * otherwise any `<img src>` on any page could fire it.
 */
export function evaluateTrpcCall({ method, segment }) {
  const verb = String(method ?? 'GET').toUpperCase();
  if (verb !== 'GET' && !READ_METHODS.has(verb) && verb !== 'POST') {
    return { ok: false, status: 405, error: `Unsupported method ${verb} for tRPC.` };
  }

  const names = String(segment ?? '').split('?')[0].split(',');
  if (names.length > MAX_BATCH) {
    return { ok: false, status: 413, error: `More than ${MAX_BATCH} procedures in one batch.` };
  }

  const problems = [];
  for (const name of names) {
    if (!NAME_SHAPE.test(name)) problems.push(`${name || '(empty)'}: not a procedure name`);
    else if (!Object.hasOwn(TRPC_PROCEDURES, name)) problems.push(`${name}: not allowed from this console`);
  }
  if (problems.length) return { ok: false, status: 403, error: problems.join('; ') };

  const hasMutation = names.some((name) => TRPC_PROCEDURES[name] === 'mutation');
  if (hasMutation && READ_METHODS.has(verb)) {
    return { ok: false, status: 403, error: 'A mutation cannot be called with a read method.' };
  }

  return { ok: true, names, hasMutation };
}
