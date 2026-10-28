/**
 * Resolve the upstream API base at request time so variables set on the deployment
 * platform take effect without a rebuild. `fallback` is the build-time runtimeConfig
 * value; the last resort mirrors apps/web so both Nuxt apps point at the same service.
 */
export function resolveApiInternalSource(env, fallback) {
  const chain = [
    ['NUXT_API_INTERNAL_BASE', env.NUXT_API_INTERNAL_BASE],
    ['API_INTERNAL_URL', env.API_INTERNAL_URL],
    ['runtimeConfig (build-time)', fallback],
  ];
  for (const [source, value] of chain) {
    if (value) return { base: String(value).replace(/\/+$/, ''), source };
  }
  return {
    base: env.NODE_ENV === 'production' ? 'http://api:4000' : 'http://127.0.0.1:4000',
    source: 'built-in default',
  };
}

/**
 * Upstream URL for a blog endpoint. The path is fixed by the caller, never by the client.
 * `slug` is a path parameter upstream (`/blog/posts/:slug`), everything else is a query string.
 */
export function blogUpstreamUrl(base, route, params = {}) {
  const { slug, ...query } = params;
  const path = route === 'post' ? `/blog/posts/${encodeURIComponent(String(slug ?? ''))}` : `/blog/${route}`;
  const url = new URL(path, `${base.replace(/\/+$/, '')}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}
