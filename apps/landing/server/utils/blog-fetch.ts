import type { H3Event } from 'h3';
import { blogUpstreamUrl, resolveApiInternalSource } from './api-base.mjs';

export type BlogRoute = 'posts' | 'post' | 'tags' | 'sitemap';

export const upstreamBase = (event: H3Event) =>
  resolveApiInternalSource(process.env, useRuntimeConfig(event).apiInternalBase).base;

/**
 * Reads go server-to-server: the browser never talks to the API, so the production
 * CORS allowlist (a single origin) does not apply here and no token is exposed.
 */
export const fetchBlog = async <T>(event: H3Event, route: BlogRoute, params: Record<string, unknown> = {}) => {
  const url = blogUpstreamUrl(upstreamBase(event), route, params);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  return { url, status: response.status, ok: response.ok, data: response.ok ? (await response.json()) as T : null };
};

/** Returns `fallback` when the API is unreachable, so a marketing page never 500s on content. */
export const fetchBlogOr = async <T>(event: H3Event, route: BlogRoute, params: Record<string, unknown>, fallback: T) => {
  try {
    const result = await fetchBlog<T>(event, route, params);
    if (!result.ok) {
      console.warn(`[blog] upstream ${result.status} for ${result.url}`);
      return { data: fallback, ok: false };
    }
    return { data: result.data as T, ok: true };
  } catch (cause) {
    console.warn(`[blog] upstream unreachable (${upstreamBase(event)}):`, cause);
    return { data: fallback, ok: false };
  }
};
