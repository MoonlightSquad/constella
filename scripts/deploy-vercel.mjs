import { createRequire } from 'node:module';
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
const rootEnv = readEnv('.env');
const configEnv = readEnv('.env.vercel');
const apiEnv = readEnv('apps/api/.env');
const webEnv = readEnv('apps/web/.env');
const landingEnv = readEnv('apps/landing/.env');
const botEnv = readEnv('apps/bot/.env');
const deploymentConfig = loadDeploymentConfig(rootDir);
const env = { ...rootEnv, ...apiEnv, ...webEnv, ...landingEnv, ...botEnv, ...configEnv, ...process.env };
const configVercelToken = deploymentConfig.vercel?.api_token;
if (configVercelToken && !/YOUR_|replace-with|CHANGE_ME|placeholder|your[-_ ]|^<[^>]+>$/i.test(configVercelToken)) {
  env.VERCEL_TOKEN = configVercelToken;
}

function readEnv(relativePath) {
  try {
    return parseDotenv(fs.readFileSync(path.join(rootDir, relativePath)));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const commandText = [command, ...commandArgs].join(' ');
    const safeCommand = options.secret ? commandText.replaceAll(options.secret, '[REDACTED]') : commandText;
    throw new Error(`${safeCommand} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function validUrl(value) {
  if (!value || /YOUR_|replace-with|CHANGE_ME|placeholder|your[-_ ]/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function firstValid(...values) {
  return values.find(validUrl);
}

function domainFromUrl(value, override, label) {
  const domain = override || new URL(value).hostname;
  if (
    domain !== domain.toLowerCase() ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  ) {
    throw new Error(`${label} must be a hostname, without protocol, path, or port.`);
  }
  return domain;
}

const configuredWebUrl = firstValid(env.NUXT_PUBLIC_APP_URL, env.WEB_APP_URL) || 'https://app-test.constella.pp.ua';
const configuredApiUrl = firstValid(env.NUXT_PUBLIC_API_URL, env.API_PROXY_TARGET, env.API_INTERNAL_URL) || 'https://api-test.constella.pp.ua';
const configuredLandingUrl = firstValid(env.NUXT_PUBLIC_SITE_URL, env.SITE_URL) || 'https://constella.pp.ua';
const apiProject = env.VERCEL_API_PROJECT || 'constella-api';
const webProject = env.VERCEL_WEB_PROJECT || 'constella-web';
const landingProject = env.VERCEL_LANDING_PROJECT || 'constella-landing';
for (const [label, name] of [
  ['VERCEL_API_PROJECT', apiProject],
  ['VERCEL_WEB_PROJECT', webProject],
  ['VERCEL_LANDING_PROJECT', landingProject],
]) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(name)) {
    throw new Error(`${label} must be a lowercase Vercel project slug (letters, numbers, and hyphens).`);
  }
}
if (apiProject === webProject || apiProject === landingProject || webProject === landingProject) {
  throw new Error('VERCEL_API_PROJECT, VERCEL_WEB_PROJECT and VERCEL_LANDING_PROJECT must be different names.');
}
const webDomain = domainFromUrl(configuredWebUrl, env.VERCEL_WEB_DOMAIN, 'VERCEL_WEB_DOMAIN');
const apiDomain = domainFromUrl(configuredApiUrl, env.VERCEL_API_DOMAIN, 'VERCEL_API_DOMAIN');
const landingDomain = domainFromUrl(configuredLandingUrl, env.VERCEL_LANDING_DOMAIN, 'VERCEL_LANDING_DOMAIN');
const webUrl = env.VERCEL_WEB_DOMAIN ? `https://${webDomain}` : configuredWebUrl;
const apiUrl = env.VERCEL_API_DOMAIN ? `https://${apiDomain}` : configuredApiUrl;
const landingUrl = env.VERCEL_LANDING_DOMAIN ? `https://${landingDomain}` : configuredLandingUrl;
const webhookUrl = `${apiUrl.replace(/\/$/, '')}/telegram/webhook`;
const projects = [
  {
    key: 'api',
    name: apiProject,
    rootDirectory: 'apps/api',
    framework: 'fastify',
    domain: apiDomain,
    buildCommand: 'cd ../.. && pnpm exec turbo run build --filter=@constella/api...',
  },
  {
    key: 'web',
    name: webProject,
    rootDirectory: 'apps/web',
    framework: 'nuxtjs',
    domain: webDomain,
    buildCommand: 'cd ../.. && pnpm exec turbo run build --filter=@constella/web...',
  },
  {
    key: 'landing',
    name: landingProject,
    rootDirectory: 'apps/landing',
    framework: 'nuxtjs',
    domain: landingDomain,
    buildCommand: 'cd ../.. && pnpm exec turbo run build --filter=@constella/landing...',
  },
];
const onlyFlags = ['--api-only', '--web-only', '--landing-only'].filter((flag) => args.has(flag));
if (onlyFlags.length > 1) {
  throw new Error(`Choose only one of --api-only, --web-only and --landing-only, got ${onlyFlags.join(' and ')}.`);
}
const deploymentProjects = onlyFlags.length
  ? projects.filter(({ key }) => key === onlyFlags[0].replace(/^--/, '').replace(/-only$/, ''))
  : projects;

function logPlan() {
  console.log(`Vercel projects: ${projects.map(({ key, name, rootDirectory }) => `${key}=${name} (${rootDirectory})`).join(', ')}`);
  console.log(`Custom domains: ${webProject}=${webDomain}, ${apiProject}=${apiDomain}, ${landingProject}=${landingDomain}`);
}

const preflight = ['vercel:env', '--', '--dry-run'];
run('pnpm', preflight);
if (!args.has('--skip-build')) run('pnpm', ['build']);
logPlan();

if (dryRun) {
  console.log('Dry run complete. No Vercel account, project, domain, environment variable, deployment, or webhook was changed.');
  process.exit(0);
}

const token = env.VERCEL_TOKEN;
if (!token || /YOUR_|replace-with|CHANGE_ME|placeholder|your[-_ ]|^<[^>]+>$/i.test(token)) {
  throw new Error('vercel.api_token is required in the ignored constella.deploy.config.local.json.');
}

const apiBase = 'https://api.vercel.com';
const scopeQuery = new URLSearchParams();
if (env.VERCEL_TEAM_ID) scopeQuery.set('teamId', env.VERCEL_TEAM_ID);
else if (env.VERCEL_SCOPE) scopeQuery.set('slug', env.VERCEL_SCOPE);
const queryString = scopeQuery.size ? `?${scopeQuery}` : '';

async function vercelApi(endpoint, options = {}) {
  const response = await fetch(`${apiBase}${endpoint}${endpoint.includes('?') ? '&' : queryString ? queryString : ''}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || data.message || response.statusText;
    const error = new Error(`Vercel API ${options.method || 'GET'} ${endpoint} failed (${response.status}): ${message}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureProject(project) {
  const projectPath = `/v9/projects/${encodeURIComponent(project.name)}`;
  let existing;
  try {
    existing = await vercelApi(projectPath);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!existing) {
    console.log(`Creating Vercel project "${project.name}"...`);
    existing = await vercelApi('/v11/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: project.name,
        framework: project.framework,
        rootDirectory: project.rootDirectory,
        installCommand: 'cd ../.. && pnpm install --frozen-lockfile',
        buildCommand: project.buildCommand,
        includeFilesOutsideRootDirectory: true,
        skipGitConnectDuringLink: true,
      }),
    });
  } else {
    console.log(`Using existing Vercel project "${project.name}".`);
  }
  if (existing.rootDirectory !== project.rootDirectory) {
    throw new Error(`Vercel project "${project.name}" has root directory "${existing.rootDirectory || '(project root)'}"; expected "${project.rootDirectory}". Update it in Vercel or choose another project name.`);
  }
  return existing;
}

async function ensureDomain(project, domain) {
  const projectPath = `/v9/projects/${encodeURIComponent(project.name)}/domains/${encodeURIComponent(domain)}`;
  let assigned;
  try {
    assigned = await vercelApi(projectPath);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!assigned) {
    try {
      assigned = await vercelApi(`/v10/projects/${encodeURIComponent(project.name)}/domains`, {
        method: 'POST',
        body: JSON.stringify({ name: domain }),
      });
      console.log(`Assigned ${domain} to "${project.name}".`);
    } catch (error) {
      try {
        assigned = await vercelApi(projectPath);
      } catch {
        throw error;
      }
    }
  } else {
    console.log(`Domain ${domain} is already assigned to "${project.name}".`);
  }
  if ((assigned.verified === false || assigned.verified === 'false') && assigned.verification?.length) {
    for (const record of assigned.verification) {
      console.warn(`DNS verification required for ${domain}: add ${record.type} record ${record.domain} = ${record.value}`);
    }
  } else if (assigned.verified === false || assigned.verified === 'false') {
    console.warn(`Domain ${domain} is assigned but not verified. Check its DNS configuration in Vercel.`);
  }
}

const authEnv = {
  VERCEL_TOKEN: token,
  VERCEL_API_PROJECT: apiProject,
  VERCEL_WEB_PROJECT: webProject,
  VERCEL_LANDING_PROJECT: landingProject,
  WEB_APP_URL: webUrl,
  NUXT_PUBLIC_APP_URL: webUrl,
  API_INTERNAL_URL: apiUrl,
  API_PROXY_TARGET: apiUrl,
  NUXT_PUBLIC_API_URL: apiUrl,
  NUXT_API_INTERNAL_BASE: apiUrl,
  NUXT_PUBLIC_SITE_URL: landingUrl,
  ...(env.VERCEL_SCOPE || env.VERCEL_TEAM_ID
    ? { VERCEL_SCOPE: env.VERCEL_SCOPE || env.VERCEL_TEAM_ID }
    : {}),
  ...(env.VERCEL_TEAM_ID ? { VERCEL_TEAM_ID: env.VERCEL_TEAM_ID } : {}),
};

for (const project of deploymentProjects) {
  const createdProject = await ensureProject(project);
  await ensureDomain(createdProject, project.domain);
}

run('pnpm', ['vercel:env'], { env: authEnv });
for (const project of deploymentProjects) {
  run('pnpm', [
    'dlx',
    'vercel@latest',
    'deploy',
    '--prod',
    '--yes',
    '--token',
    token,
    '--cwd',
    rootDir,
    '--project',
    project.name,
  ], { env: authEnv, secret: token });
}

if (args.has('--skip-webhook')) {
  console.warn('Skipped Telegram webhook setup by request. Run `pnpm webhook:set` after the API domain DNS resolves.');
} else {
  run('pnpm', ['webhook:set'], {
    env: {
      ...authEnv,
      TELEGRAM_WEBHOOK_URL: webhookUrl,
      ...(env.BOT_TOKEN || botEnv.BOT_TOKEN ? { BOT_TOKEN: env.BOT_TOKEN || botEnv.BOT_TOKEN } : {}),
    },
  });
}
console.log(`Vercel deployment and environment sync completed${args.has('--skip-webhook') ? '; Telegram webhook setup pending.' : ', including Telegram webhook setup.'}`);
