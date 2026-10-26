const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// `@constella/shared` постачає зібраний `dist/`, тому Metro мусить бачити все дерево
// monorepo; воно й шанає `exports`-мапу паку через package exports нижче.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enablePackageExports = true;

// Сторонні Nuxt/Fastify-пакуети ніколи не резолвляться з бандла, а їхні величезні
// збірки (.nuxt/.output/node_modules) лише перевантажують file-watcher.
const foreignApps = ['web', 'landing', 'api', 'bot', 'worker', 'tma'];
config.resolver.blockList = foreignApps.map((app) => {
  const dir = path.join(workspaceRoot, 'apps', app);
  return new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\\\].*$`);
});

module.exports = config;
