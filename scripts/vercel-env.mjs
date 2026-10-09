import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeploymentConfig } from './deployment-config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(rootDir, 'apps/api/package.json'));
const { parse: parseDotenv } = require('dotenv');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const selectedProject = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'all';

const readEnv = (relativePaths) => {
  const env = {};
  for (const relativePath of relativePaths) {
    const fullPath = path.join(rootDir, relativePath);
    try {
      Object.assign(env, parseDotenv(fs.readFileSync(fullPath)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return env;
};

const rootEnv = readEnv(['.env']);
const deploymentEnv = readEnv(['.env.vercel']);
const apiFileEnv = readEnv(['apps/api/.env']);
const webFileEnv = readEnv(['apps/web/.env']);
const botFileEnv = readEnv(['apps/bot/.env']);
const deploymentConfig = loadDeploymentConfig(rootDir);
const webhookSecrets = [rootEnv, apiFileEnv, botFileEnv, process.env]
  .map((env) => env.TELEGRAM_WEBHOOK_SECRET)
  .filter((value) => value && /^[A-Za-z0-9_-]{32,256}$/.test(value));
if (new Set(webhookSecrets).size > 1) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET differs between local env files; use the same value in root, API, and bot env files.');
}
const generatedWebhookSecret = webhookSecrets.length === 0;
const webhookSecret = webhookSecrets[0] || randomBytes(32).toString('base64url');
const isPlaceholder = (value) =>
  /YOUR_|replace-with|CHANGE_ME|placeholder|your[-_ ]|^<[^>]+>$/i.test(value) ||
  value === 'https://your-public-https-domain.example';

const writeEnvValue = (relativePath, name, value) => {
  const fullPath = path.join(rootDir, relativePath);
  let contents = '';
  try {
    contents = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const lines = contents ? contents.split(/\r?\n/) : [];
  if (lines.at(-1) === '') lines.pop();
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const index = lines.findIndex((line) => assignment.test(line));
  if (index === -1) lines.push(`${name}=${value}`);
  else lines[index] = `${name}=${value}`;
  const updated = `${lines.join('\n')}\n`;
  fs.writeFileSync(fullPath, updated, { mode: 0o600 });
  fs.chmodSync(fullPath, 0o600);
};

const apiEnv = { ...rootEnv, ...apiFileEnv, ...deploymentEnv, ...process.env, TELEGRAM_WEBHOOK_SECRET: webhookSecret };
const webEnv = { ...rootEnv, ...webFileEnv, ...deploymentEnv, ...process.env };
const configVercelToken = deploymentConfig.vercel?.api_token;

const webUrl = [webEnv.NUXT_PUBLIC_APP_URL, webEnv.WEB_APP_URL]
  .find((value) => value && !isPlaceholder(value)) || 'https://app-test.constella.pp.ua';
const configuredApiUrl = [
  apiEnv.NUXT_PUBLIC_API_URL,
  apiEnv.API_PROXY_TARGET,
  apiEnv.API_INTERNAL_URL,
].find((value) => value && !isPlaceholder(value)) || 'https://api-test.constella.pp.ua';
const apiUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiUrl)
  ? 'https://api-test.constella.pp.ua'
  : configuredApiUrl;

const projects = {
  api: {
    name: process.env.VERCEL_API_PROJECT || rootEnv.VERCEL_API_PROJECT || 'constella-api',
    cwd: path.join(rootDir, 'apps/api'),
    env: apiEnv,
    variables: {
      DATABASE_URL: { required: true },
      BOT_TOKEN: { value: apiEnv.BOT_TOKEN || botFileEnv.BOT_TOKEN, required: true },
      TELEGRAM_WEBHOOK_SECRET: { required: true },
      JWT_SECRET: { required: true },
      PAYMENTS_INTERNAL_TOKEN: { required: true },
      WEB_APP_URL: { value: webUrl, required: true },
      API_INTERNAL_URL: { value: apiUrl, required: true },
      API_PUBLIC_URL: { value: apiUrl },
      ADMIN_TELEGRAM_IDS: {},
      PHOTO_BUCKET: { required: true },
      S3_REGION: { required: true },
      S3_ENDPOINT: { required: true },
      S3_ACCESS_KEY_ID: { required: true },
      S3_SECRET_ACCESS_KEY: { required: true },
      S3_PUBLIC_BASE_URL: { required: true },
      S3_FORCE_PATH_STYLE: {},
      SMTP_HOST: { required: true },
      SMTP_PORT: { required: true },
      SMTP_SECURE: {},
      SMTP_USER: { required: true },
      SMTP_PASSWORD: { required: true },
      SMTP_FROM: { required: true },
      SENTRY_DSN: {},
      SENTRY_ENVIRONMENT: {},
    },
  },
  web: {
    name: process.env.VERCEL_WEB_PROJECT || rootEnv.VERCEL_WEB_PROJECT || 'constella-web',
    cwd: path.join(rootDir, 'apps/web'),
    env: webEnv,
    variables: {
      WEB_APP_URL: { value: webUrl, required: true },
      API_PROXY_TARGET: { value: apiUrl, required: true },
      NUXT_PUBLIC_API_URL: { value: apiUrl, required: true },
      NUXT_PUBLIC_APP_URL: { value: webUrl, required: true },
      NUXT_PUBLIC_BOT_USERNAME: {
        value: [webEnv.NUXT_PUBLIC_BOT_USERNAME, webEnv.BOT_USERNAME]
          .concat(botFileEnv.BOT_USERNAME)
          .find((value) => value && !isPlaceholder(value)),
        required: true,
      },
      NUXT_PUBLIC_SENTRY_DSN: {},
    },
  },
};

const projectKeys = selectedProject === 'all' ? ['api', 'web'] : [selectedProject];
if (projectKeys.some((key) => !Object.hasOwn(projects, key))) {
  console.error('Usage: pnpm vercel:env [all|api|web] [--dry-run]');
  process.exit(2);
}

const preparedProjects = projectKeys.map((key) => {
  const project = projects[key];
  const entries = Object.entries(project.variables)
    .map(([name, config]) => [name, config, config.value ?? project.env[name]])
    .filter(([, config, value]) => value !== undefined && value !== '' && (config.required || !isPlaceholder(value)));
  const missing = Object.entries(project.variables)
    .filter(([name, config]) => config.required && (!project.variables[name].value && !project.env[name]))
    .map(([name]) => name);
  const placeholders = entries
    .filter(([, , value]) => isPlaceholder(value))
    .map(([name]) => name);
  if (missing.length || placeholders.length) {
    const problems = [
      missing.length ? `missing: ${missing.join(', ')}` : '',
      placeholders.length ? `replace placeholders: ${placeholders.join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(`${key} (${project.name}) is not ready: ${problems.join('; ')}`);
  }
  return { key, project, entries };
});

const configuredVercelToken = [deploymentConfig.vercel?.api_token, process.env.VERCEL_TOKEN, deploymentEnv.VERCEL_TOKEN]
  .find((value) => value && !isPlaceholder(value));
if (!dryRun && !configuredVercelToken) {
  throw new Error('vercel.api_token is required in the ignored constella.deploy.config.local.json.');
}

if (!dryRun) {
  for (const file of ['.env', 'apps/api/.env', 'apps/bot/.env']) {
    writeEnvValue(file, 'TELEGRAM_WEBHOOK_SECRET', webhookSecret);
  }
  writeEnvValue('apps/bot/.env', 'TELEGRAM_WEBHOOK_URL', `${apiUrl.replace(/\/$/, '')}/telegram/webhook`);
  writeEnvValue('apps/bot/.env', 'WEB_APP_URL', webUrl);
  if (generatedWebhookSecret) {
    console.log('Generated one Telegram webhook secret and saved it to the ignored local env files.');
  }
}

const runVercel = (project, command, input) => {
  const vercelArgs = [];
  const token = configuredVercelToken;
  if (token) vercelArgs.push('--token', token);
  const scope = process.env.VERCEL_SCOPE || deploymentEnv.VERCEL_SCOPE || rootEnv.VERCEL_SCOPE;
  const teamId = process.env.VERCEL_TEAM_ID || deploymentEnv.VERCEL_TEAM_ID || rootEnv.VERCEL_TEAM_ID;
  if (scope || teamId) vercelArgs.push('--scope', scope || teamId);
  if (command === 'link') {
    vercelArgs.push(command);
    vercelArgs.push('--yes', '--project', project.name);
  } else {
    vercelArgs.push(...command);
  }

  const result = spawnSync('pnpm', ['dlx', 'vercel@latest', ...vercelArgs], {
    cwd: project.cwd,
    env: {
      ...rootEnv,
      ...deploymentEnv,
      ...process.env,
      VERCEL_API_PROJECT: process.env.VERCEL_API_PROJECT || deploymentEnv.VERCEL_API_PROJECT || rootEnv.VERCEL_API_PROJECT || projects.api.name,
      VERCEL_WEB_PROJECT: process.env.VERCEL_WEB_PROJECT || deploymentEnv.VERCEL_WEB_PROJECT || rootEnv.VERCEL_WEB_PROJECT || projects.web.name,
      ...(!process.env.VERCEL_TOKEN && deploymentEnv.VERCEL_TOKEN ? { VERCEL_TOKEN: deploymentEnv.VERCEL_TOKEN } : {}),
    },
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vercel CLI failed for ${project.name} (exit ${result.status ?? 'unknown'}). Check Vercel login, project access, and CLI output locally.`);
  }
};

for (const { key, project, entries } of preparedProjects) {
  console.log(`${dryRun ? 'Would sync' : 'Syncing'} ${entries.length} Production Config variables to ${key} project "${project.name}": ${entries.map(([name]) => name).join(', ')}`);
  if (dryRun) continue;

  runVercel(project, 'link');
  for (const [name, config, value] of entries) {
    const addArgs = ['env', 'add', name, 'production', '--yes', '--force', '--no-sensitive'];
    runVercel(project, addArgs, `${value}\n`);
  }
  console.log(`Production environment variables synced for ${project.name}.`);
}

if (dryRun) console.log('Dry run only; no Vercel account or project was changed.');
