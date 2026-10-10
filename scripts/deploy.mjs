import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(path.join(rootDir, 'apps/api/package.json'));

const readEnv = (relativePath) => {
  try {
    return require('dotenv').parse(fs.readFileSync(path.join(rootDir, relativePath)));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
};
const existingRuntimeEnv = { ...readEnv('.env'), ...readEnv('apps/api/.env') };
const existingDeploymentEnv = readEnv('.env.vercel');
const configPath = path.join(rootDir, 'constella.deploy.config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ Config file constella.deploy.config.json not found in project root!');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('❌ Invalid JSON in constella.deploy.config.json:', err.message);
  process.exit(1);
}

console.log('🚀 Running Constella Vercel All-in-One Preflight & Deployment Sync...');

// Helper to check for placeholder values
function isPlaceholder(value) {
  if (typeof value !== 'string') return false;
  return (
    value.includes('YOUR_') ||
    value.includes('GENERATE_RANDOM_') ||
    value.startsWith('re_YOUR_') ||
    value.includes('PUBLIC_KEY@')
  );
}

// 1. Auto-generate crypto secrets if missing or placeholder
let configModified = false;
if (!config.security) config.security = {};

if (!config.security.jwt_secret || isPlaceholder(config.security.jwt_secret)) {
  config.security.jwt_secret = crypto.randomBytes(32).toString('hex');
  console.log('🔑 Auto-generated secure 32-byte JWT_SECRET');
  configModified = true;
}

if (!config.security.payments_internal_token || isPlaceholder(config.security.payments_internal_token)) {
  config.security.payments_internal_token = crypto.randomBytes(32).toString('hex');
  console.log('🔑 Auto-generated secure 32-byte PAYMENTS_INTERNAL_TOKEN');
  configModified = true;
}

if (configModified) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('💾 Saved generated secrets to constella.deploy.config.json');
}

// 2. Preflight checks
const issues = [];
const warnings = [];

// Database check
const dbUrl = config.database?.database_url;
if (!dbUrl || isPlaceholder(dbUrl)) {
  issues.push('database.database_url is missing or placeholder (Aiven PostgreSQL URI with PostGIS required).');
} else if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
  issues.push('database.database_url must be a valid PostgreSQL connection URI.');
} else if (!dbUrl.includes('sslmode=') && dbUrl.includes('aivencloud.com')) {
  warnings.push('database.database_url for Aiven should include sslmode=require.');
}

// Telegram Bot check
const botToken = config.telegram?.bot_token;
if (!botToken || isPlaceholder(botToken)) {
  issues.push('telegram.bot_token is missing or placeholder (get token from @BotFather).');
} else if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
  warnings.push('telegram.bot_token does not match standard Telegram bot token pattern (<bot_id>:<token>).');
}

// Storage check
const s3Endpoint = config.storage?.s3_endpoint;
const s3AccessKey = config.storage?.s3_access_key_id;
const s3SecretKey = config.storage?.s3_secret_access_key;
const s3PublicUrl = config.storage?.s3_public_base_url;

if (!s3Endpoint || isPlaceholder(s3Endpoint)) {
  issues.push('storage.s3_endpoint is missing or placeholder (Cloudflare R2 endpoint required).');
}
if (!s3AccessKey || isPlaceholder(s3AccessKey)) {
  issues.push('storage.s3_access_key_id is missing or placeholder.');
}
if (!s3SecretKey || isPlaceholder(s3SecretKey)) {
  issues.push('storage.s3_secret_access_key is missing or placeholder.');
}
if (!s3PublicUrl || isPlaceholder(s3PublicUrl)) {
  issues.push('storage.s3_public_base_url is missing or placeholder.');
}

// URLs check
const appUrl = config.domains?.web_app_url || config.urls?.app_url || config.urls?.frontend_web_app_url || 'https://app-test.constella.pp.ua';
const apiUrl = config.domains?.api_url || config.urls?.backend_api_url || 'https://api-test.constella.pp.ua';

if (warnings.length > 0) {
  console.warn('\n⚠️  Preflight Warnings:');
  for (const w of warnings) console.warn(`   • ${w}`);
}

if (issues.length > 0) {
  console.warn('\n⚠️  Notice: The following configuration fields need real values before production launch:');
  for (const issue of issues) console.warn(`   • ${issue}`);
  console.warn('   (Update constella.deploy.config.json or pass environment variables)\n');
} else {
  console.log('\n✅ All preflight configuration checks passed successfully!');
}

// 3. Generate .env format
const envLines = [
  `# Generated from constella.deploy.config.json on ${new Date().toISOString()}`,
  `NODE_ENV=production`,
  `DATABASE_URL=${config.database?.database_url || ''}`,
  `BOT_TOKEN=${config.telegram?.bot_token || ''}`,
  `BOT_USERNAME=${config.telegram?.bot_username || ''}`,
  `ADMIN_TELEGRAM_IDS=${(config.telegram?.admin_telegram_ids || []).join(',')}`,
  `WEB_APP_URL=${appUrl}`,
  `NUXT_PUBLIC_BOT_USERNAME=${config.telegram?.bot_username || ''}`,
  `NUXT_PUBLIC_APP_URL=${appUrl}`,
  `NUXT_PUBLIC_API_URL=${apiUrl}`,
  `API_PROXY_TARGET=${apiUrl}`,
  `JWT_SECRET=${config.security?.jwt_secret || ''}`,
  `PAYMENTS_INTERNAL_TOKEN=${config.security?.payments_internal_token || ''}`,
  `PHOTO_BUCKET=${config.storage?.photo_bucket || 'constella-media'}`,
  `S3_ENDPOINT=${config.storage?.s3_endpoint || ''}`,
  `S3_REGION=${config.storage?.s3_region || 'auto'}`,
  `S3_ACCESS_KEY_ID=${config.storage?.s3_access_key_id || ''}`,
  `S3_SECRET_ACCESS_KEY=${config.storage?.s3_secret_access_key || ''}`,
  `S3_PUBLIC_BASE_URL=${config.storage?.s3_public_base_url || ''}`,
  `S3_FORCE_PATH_STYLE=${config.storage?.s3_force_path_style ? 'true' : 'false'}`,
  `SMTP_HOST=${config.email?.smtp_host || 'smtp.resend.com'}`,
  `SMTP_PORT=${config.email?.smtp_port || 587}`,
  `SMTP_SECURE=${config.email?.smtp_secure ? 'true' : 'false'}`,
  `SMTP_USER=${config.email?.smtp_user || 'resend'}`,
  `SMTP_PASSWORD=${config.email?.smtp_password || ''}`,
  `SMTP_FROM=${config.email?.smtp_from || 'Constella Support <support@test.constella.pp.ua>'}`,
  `SENTRY_DSN=${config.monitoring?.sentry_dsn_backend || ''}`,
  `NUXT_PUBLIC_SENTRY_DSN=${config.monitoring?.sentry_dsn_frontend || ''}`,
  `SENTRY_ENVIRONMENT=${config.monitoring?.environment || 'production'}`
].join('\n');
const adminCredentialsEnvLines = [
  `ADMIN_EMAIL=${existingRuntimeEnv.ADMIN_EMAIL || existingDeploymentEnv.ADMIN_EMAIL || ''}`,
  `ADMIN_PASSWORD=${existingRuntimeEnv.ADMIN_PASSWORD || existingDeploymentEnv.ADMIN_PASSWORD || ''}`,
];

// 4. Sync .env to root, apps/web, apps/api, apps/bot
const targetPaths = [
  { path: path.join(rootDir, '.env'), includeAdminCredentials: true },
  { path: path.join(rootDir, 'apps/web/.env'), includeAdminCredentials: false },
  { path: path.join(rootDir, 'apps/api/.env'), includeAdminCredentials: true },
  { path: path.join(rootDir, 'apps/bot/.env'), includeAdminCredentials: false }
];

for (const { path: targetPath, includeAdminCredentials } of targetPaths) {
  const targetEnvLines = includeAdminCredentials
    ? [envLines, ...adminCredentialsEnvLines].join('\n')
    : envLines;
  fs.writeFileSync(targetPath, targetEnvLines + '\n', 'utf8');
  console.log(`✅ Synced: ${path.relative(rootDir, targetPath)}`);
}

// 5. Generate vercel env helper file (.env.vercel)
const vercelEnvPath = path.join(rootDir, '.env.vercel');
fs.writeFileSync(vercelEnvPath, [envLines, ...adminCredentialsEnvLines].join('\n') + '\n', 'utf8');
console.log(`✅ Generated Vercel Environment file: .env.vercel`);

console.log('\n✨ Configuration synchronization complete!');
