const validPath = /^[-a-zA-Z0-9._/,]+$/;

/**
 * Resolve the upstream API base at request time so environment variables set on the
 * deployment platform (Vercel dashboard, docker-compose, shell) take effect without a
 * rebuild. `fallback` is the build-time runtimeConfig value; the last resort is the
 * docker-compose service name in production or localhost in development — never
 * `undefined`, which would crash the proxy with a TypeError on every request.
 */
export function resolveApiInternalBase(env, fallback) {
  return env.NUXT_API_INTERNAL_BASE
    || env.API_INTERNAL_URL
    || env.API_PROXY_TARGET
    || env.NUXT_PUBLIC_API_URL
    || fallback
    || (env.NODE_ENV === 'production' ? 'http://api:4000' : 'http://127.0.0.1:4000');
}

/** Build a safe upstream URL for the Nuxt API proxy, or return null for an invalid route. */
export function getApiProxyTarget(path, search, apiInternalBase) {
  const segments = path?.split('/');
  if (!segments?.length || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':')) || !validPath.test(path)) return null;
  const target = new URL(segments.map(encodeURIComponent).join('/'), apiInternalBase.replace(/\/$/, '') + '/');
  target.search = search;
  return target.toString();
}
