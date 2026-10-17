const validPath = /^[-a-zA-Z0-9._/,]+$/;

/**
 * Resolve the upstream API base at request time so environment variables set on the
 * deployment platform (Vercel dashboard, docker-compose, shell) take effect without a
 * rebuild. `fallback` is the build-time runtimeConfig value; the last resort is the
 * docker-compose service name in production or localhost in development — never
 * `undefined`, which would crash the proxy with a TypeError on every request.
 */
export function resolveApiInternalBase(env, fallback) {
  return resolveApiInternalSource(env, fallback).base;
}

/** Same as resolveApiInternalBase but also reports which input supplied the value. */
export function resolveApiInternalSource(env, fallback) {
  const chain = [
    ['NUXT_API_INTERNAL_BASE', env.NUXT_API_INTERNAL_BASE],
    ['API_INTERNAL_URL', env.API_INTERNAL_URL],
    ['API_PROXY_TARGET', env.API_PROXY_TARGET],
    ['NUXT_PUBLIC_API_URL', env.NUXT_PUBLIC_API_URL],
    ['runtimeConfig (build-time)', fallback],
  ];
  for (const [source, value] of chain) {
    if (value) return { base: value, source };
  }
  return {
    base: env.NODE_ENV === 'production' ? 'http://api:4000' : 'http://127.0.0.1:4000',
    source: 'built-in default',
  };
}

/** Build a safe upstream URL for the Nuxt API proxy, or return null for an invalid route. */
export function getApiProxyTarget(path, search, apiInternalBase) {
  const segments = path?.split('/');
  if (!segments?.length || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':')) || !validPath.test(path)) return null;
  const target = new URL(segments.map(encodeURIComponent).join('/'), apiInternalBase.replace(/\/$/, '') + '/');
  target.search = search;
  return target.toString();
}
