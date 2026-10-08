import { getRequestURL, getRouterParam, proxyRequest } from 'h3';
import { getApiProxyTarget } from '../utils/api-proxy-target.mjs';

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const path = getRouterParam(event, 'path');
  const target = getApiProxyTarget(path, getRequestURL(event).search, config.apiInternalBase);
  if (!target) throw createError({ statusCode: 404, statusMessage: 'API route not found' });
  return proxyRequest(event, target);
});
