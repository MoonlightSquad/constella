import { getRequestURL, getRouterParam, proxyRequest, createError } from 'h3';
import { getApiProxyTarget, resolveApiInternalBase } from '../utils/api-proxy-target.mjs';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = getRouterParam(event, 'path');
  // Resolve the upstream from live process env first (deployment-platform overrides),
  // falling back to the build-time runtimeConfig value.
  const apiBase = resolveApiInternalBase(process.env, config.apiInternalBase);
  const target = getApiProxyTarget(path, getRequestURL(event).search, apiBase);
  if (!target) throw createError({ statusCode: 404, statusMessage: 'API route not found' });
  try {
    return await proxyRequest(event, target);
  } catch (cause) {
    if (cause?.statusCode && cause.statusCode < 500) throw cause;
    const upstream = new URL(target).host;
    console.error(`[api-proxy] upstream ${upstream} unreachable for /api/${path}:`, cause);
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream API Unreachable',
      message: `API proxy could not reach the upstream host "${upstream}". Set NUXT_API_INTERNAL_BASE (or API_PROXY_TARGET) to the public API URL, e.g. https://api-test.constella.pp.ua`,
    });
  }
});
