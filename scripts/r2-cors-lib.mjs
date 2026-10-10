const cloudflareApi = 'https://api.cloudflare.com/client/v4';

export const requiredCorsRule = (origin) => ({
  allowed: {
    origins: [origin],
    methods: ['PUT', 'GET', 'HEAD'],
    headers: ['Content-Type'],
  },
  exposeHeaders: ['ETag'],
  maxAgeSeconds: 3600,
});

export function mergeCorsRules(rules, origin) {
  const nextRules = structuredClone(Array.isArray(rules) ? rules : []);
  const rule = nextRules.find((item) => item.allowed?.origins?.includes(origin));

  if (!rule) {
    nextRules.push(requiredCorsRule(origin));
    return nextRules;
  }

  rule.allowed.methods = [...new Set([...(rule.allowed.methods ?? []), 'PUT', 'GET', 'HEAD'])];
  rule.allowed.headers = [...new Set([...(rule.allowed.headers ?? []), 'Content-Type'])];
  rule.exposeHeaders = [...new Set([...(rule.exposeHeaders ?? []), 'ETag'])];
  rule.maxAgeSeconds = Math.max(rule.maxAgeSeconds ?? 0, 3600);
  return nextRules;
}

export async function configureR2Cors({
  apiToken,
  accountId,
  bucketName,
  webOrigin,
  fetchImpl = fetch,
}) {
  const endpoint = `${cloudflareApi}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/cors`;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  const current = await requestJson(fetchImpl, endpoint, { headers });
  const currentRules = current.rules ?? [];
  const updatedRules = mergeCorsRules(currentRules, webOrigin);
  const changed = JSON.stringify(currentRules) !== JSON.stringify(updatedRules);

  if (changed) {
    await requestJson(fetchImpl, endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ rules: updatedRules }),
    });
  }

  const verified = await requestJson(fetchImpl, endpoint, { headers });
  if (!hasRequiredCorsRule(verified.rules ?? [], webOrigin)) {
    throw new Error('Cloudflare R2 CORS verification failed: the required origin, methods, or headers are missing.');
  }

  return { changed, rulesCount: verified.rules.length };
}

function hasRequiredCorsRule(rules, origin) {
  return rules.some((rule) =>
    rule.allowed?.origins?.includes(origin) &&
    ['PUT', 'GET', 'HEAD'].every((method) => rule.allowed.methods?.includes(method)) &&
    rule.allowed.headers?.includes('Content-Type') &&
    rule.exposeHeaders?.includes('ETag'),
  );
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    if (response.status === 403) {
      throw new Error('Cloudflare rejected the API token. Use an Account API token with Workers R2 Storage Write permission; Bucket Item Write only grants object access.');
    }
    const details = body?.errors?.map((item) => item.message).filter(Boolean).join('; ');
    throw new Error(`Cloudflare R2 CORS API request failed (${response.status})${details ? `: ${details}` : '.'}`);
  }
  if (!Array.isArray(body?.result?.rules)) {
    throw new Error('Cloudflare R2 CORS API returned an invalid policy response.');
  }
  return body.result;
}
