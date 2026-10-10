import fs from 'node:fs';
import path from 'node:path';

export function loadDeploymentConfig(rootDir) {
  const localBasePath = path.join(rootDir, 'constella.deploy.config.json');
  const examplePath = path.join(rootDir, 'constella.deploy.config.example.json');
  const basePath = fs.existsSync(localBasePath) ? localBasePath : examplePath;
  const base = readConfig(basePath);
  const local = readConfig(path.join(rootDir, 'constella.deploy.config.local.json'), { optional: true });
  return mergeConfig(base, local);
}

export function mergeConfig(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = mergeConfig(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function readConfig(filePath, { optional = false } = {}) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw error;
  }
  try {
    const value = JSON.parse(contents);
    if (!isRecord(value)) throw new Error('Configuration root must be a JSON object.');
    return value;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.basename(filePath)}: ${error.message}`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
