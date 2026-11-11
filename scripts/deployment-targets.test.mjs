import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDeploymentProjects } from './deployment-targets.mjs';

const projects = [
  { key: 'api', name: 'constella-api' },
  { key: 'web', name: 'constella-web' },
  { key: 'landing', name: 'constella-landing' },
  { key: 'admin', name: 'constella-admin' },
];

test('deploys the API before the web app when selecting web-only', () => {
  assert.deepEqual(selectDeploymentProjects(projects, new Set(['--web-only'])), projects.slice(0, 2));
});

test('keeps API-only and other isolated deployment targets unchanged', () => {
  assert.deepEqual(selectDeploymentProjects(projects, new Set(['--api-only'])), [projects[0]]);
  assert.deepEqual(selectDeploymentProjects(projects, new Set(['--landing-only'])), [projects[2]]);
});

test('rejects conflicting deployment targets', () => {
  assert.throws(
    () => selectDeploymentProjects(projects, new Set(['--api-only', '--web-only'])),
    /Choose only one/,
  );
});
