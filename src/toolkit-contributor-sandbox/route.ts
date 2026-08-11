export function isToolkitContributorSandboxRoute(
  mode: string,
  search: string
): boolean {
  return (
    mode === 'development' &&
    new URLSearchParams(search).get('toolkitSandbox') === '1'
  );
}
