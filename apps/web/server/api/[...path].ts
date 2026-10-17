import { getRequestURL, getRouterParam, proxyRequest, createError } from 'h3';
import { getApiProxyTarget, resolveApiInternalSource } from '../utils/api-proxy-target.mjs';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = getRouterParam(event, 'path');
  // Resolve the upstream from live process env first (deployment-platform overrides),
  // falling back to the build-time runtimeConfig value.
  const { base: apiBase, source } = resolveApiInternalSource(process.env, config.apiInternalBase);
  const target = getApiProxyTarget(path, getRequestURL(event).search, apiBase);
  if (!target) throw createError({ statusCode: 404, statusMessage: 'API route not found' });
  try {
    return await proxyRequest(event, target);
  } catch (cause) {
    if (cause?.statusCode && cause.statusCode < 500) throw cause;
    const upstream = new URL(target).host;
    console.error(`[api-proxy] upstream ${upstream} (from ${source}) unreachable for /api/${path}:`, cause);
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream API Unreachable',
      message: `API proxy could not reach upstream "${target}" (resolved from ${source}). ` +
        `On Vercel, check that NUXT_API_INTERNAL_BASE / API_PROXY_TARGET is set for THIS deployment's environment ` +
        `(Production vs Preview) and redeploy after changing env vars.`,
    });
  }
});
