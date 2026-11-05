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
 * `slug` is a path parameter for the single-term routes (`/blog/posts/:slug`,
 * `/blog/categories/:slug`, `/blog/tags/:slug`), everything else is a query string.
 */
const BLOG_ROUTES = {
  posts: () => '/blog/posts',
  post: (slug) => `/blog/posts/${encodeURIComponent(String(slug ?? ''))}`,
  categories: () => '/blog/categories',
  category: (slug) => `/blog/categories/${encodeURIComponent(String(slug ?? ''))}`,
  tags: () => '/blog/tags',
  tag: (slug) => `/blog/tags/${encodeURIComponent(String(slug ?? ''))}`,
  authors: () => '/blog/authors',
  author: (slug) => `/blog/authors/${encodeURIComponent(String(slug ?? ''))}`,
  sitemap: () => '/blog/sitemap',
  sitemapTaxonomy: () => '/blog/sitemap/taxonomy',
};

export function blogUpstreamUrl(base, route, params = {}) {
  const { slug, ...query } = params;
  const build = BLOG_ROUTES[route];
  if (!build) throw new Error(`Unknown blog route: ${route}`);
  const url = new URL(build(slug), `${base.replace(/\/+$/, '')}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}
