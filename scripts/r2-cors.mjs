import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { configureR2Cors } from './r2-cors-lib.mjs';
import { loadDeploymentConfig } from './deployment-config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(rootDir, 'apps/api/package.json'));
const { parse: parseDotenv } = require('dotenv');

function readEnv(relativePath) {
  try {
    return parseDotenv(fs.readFileSync(path.join(rootDir, relativePath)));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

const env = { ...readEnv('.env.vercel'), ...process.env };
const config = loadDeploymentConfig(rootDir);
const apiToken = configuredValue(config.cloudflare?.api_token) || env.CLOUDFLARE_API_TOKEN;
const bucketName = configuredValue(config.storage?.photo_bucket) || env.PHOTO_BUCKET;
const endpoint = configuredValue(config.storage?.s3_endpoint) || env.S3_ENDPOINT;
// Two browsers write into this bucket with presigned PUTs: the web app (photos) and the
// admin console (blog covers). Both origins must be listed or the second upload is blocked
// by CORS before it ever reaches storage.
const origins = [
  configuredValue(config.domains?.web_app_url)
    || configuredValue(config.urls?.app_url)
    || env.NUXT_PUBLIC_APP_URL
    || env.WEB_APP_URL,
  configuredValue(config.domains?.admin_url)
    || configuredValue(config.urls?.admin_url)
    || env.ADMIN_APP_URL
    || 'https://admin.constella.pp.ua',
];
const accountId = config.cloudflare?.account_id || env.CLOUDFLARE_ACCOUNT_ID || accountIdFromEndpoint(endpoint);

if (!apiToken) {
  throw new Error('cloudflare.api_token is missing. Set an Account API token with Workers R2 Storage Write permission in constella.deploy.config.local.json.');
}
if (!bucketName) throw new Error('PHOTO_BUCKET is missing.');
if (!accountId) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID is missing and could not be derived from S3_ENDPOINT.');
}
const invalid = origins.filter((value) => !isHttpsOrigin(value));
if (invalid.length) {
  throw new Error(`Each upload origin must be a valid HTTPS origin, got: ${invalid.map((value) => value || '(empty)').join(', ')}.`);
}
const normalized = [...new Set(origins.map((value) => new URL(value).origin))];

const result = await configureR2Cors({
  apiToken,
  accountId,
  bucketName,
  origins: normalized,
});

console.log(
  `R2 CORS ${result.changed ? 'updated' : 'already configured'} for ${bucketName} at ${normalized.join(', ')}.`,
);

function accountIdFromEndpoint(value) {
  if (!value) return null;
  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return null;
  }
  return hostname.match(/^([a-f0-9]{32})(?:\.(?:eu|us|fedramp|fedramp-high))?\.r2\.cloudflarestorage\.com$/i)?.[1] ?? null;
}

function isHttpsOrigin(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '');
  } catch {
    return false;
  }
}

function configuredValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return /YOUR_|replace-with|CHANGE_ME|placeholder|your[-_ ]|^<[^>]+>$/i.test(value) ? null : value;
}
