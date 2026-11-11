export function selectDeploymentProjects(projects, args) {
  const onlyFlags = ['--api-only', '--web-only', '--landing-only', '--admin-only'].filter((flag) => args.has(flag));
  if (onlyFlags.length > 1) {
    throw new Error(`Choose only one of ${onlyFlags.join(', ')}.`);
  }

  if (onlyFlags.length === 0) return projects;

  const selectedKey = onlyFlags[0].replace(/^--/, '').replace(/-only$/, '');
  const selectedKeys = selectedKey === 'web' ? new Set(['api', 'web']) : new Set([selectedKey]);
  return projects.filter(({ key }) => selectedKeys.has(key));
}
