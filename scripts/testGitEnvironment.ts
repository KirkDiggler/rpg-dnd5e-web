const GIT_LOCAL_ENVIRONMENT = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

/** Git hooks export repository-local paths; temporary repos must not inherit them. */
export function withoutGitLocalEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const name of GIT_LOCAL_ENVIRONMENT) delete environment[name];
  return environment;
}
