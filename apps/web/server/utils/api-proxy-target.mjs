const validPath = /^[-a-zA-Z0-9._/,]+$/;

export function resolveApiInternalBase(env) {
  return env.NUXT_API_INTERNAL_BASE || env.API_INTERNAL_URL || (env.NODE_ENV === 'production' ? 'http://api:4000' : 'http://127.0.0.1:4000');
}

/** Build a safe upstream URL for the Nuxt API proxy, or return null for an invalid route. */
export function getApiProxyTarget(path, search, apiInternalBase) {
  const segments = path?.split('/');
  if (!segments?.length || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':')) || !validPath.test(path)) return null;
  const target = new URL(segments.map(encodeURIComponent).join('/'), apiInternalBase.replace(/\/$/, '') + '/');
  target.search = search;
  return target.toString();
}
