export function isCombatDebugEnabled(
  diagnosticsEnabled: boolean,
  development: boolean
): boolean {
  return diagnosticsEnabled || development;
}
