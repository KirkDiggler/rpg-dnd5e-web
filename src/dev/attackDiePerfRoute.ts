export type AttackDieDevRoute =
  | { kind: 'normal' }
  | { kind: 'playtest'; encounterId: string }
  | { kind: 'real-encounter-perf'; encounterId: string };
export function selectAttackDieDevRoute(
  mode: string,
  search: string
): AttackDieDevRoute {
  if (mode !== 'development') return { kind: 'normal' };
  const params = new URLSearchParams(search);
  const encounterId = params.get('encounterId');
  if (!encounterId) return { kind: 'normal' };
  return params.has('attackDiePerf')
    ? { kind: 'real-encounter-perf', encounterId }
    : { kind: 'playtest', encounterId };
}
export function shouldMountAttackDiePerf(
  mode: string,
  search: string
): boolean {
  return selectAttackDieDevRoute(mode, search).kind === 'real-encounter-perf';
}
