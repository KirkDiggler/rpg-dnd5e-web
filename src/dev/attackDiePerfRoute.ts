export function shouldMountAttackDiePerf(
  mode: string,
  search: string
): boolean {
  const params = new URLSearchParams(search);
  return (
    mode === 'development' &&
    params.has('attackDiePerf') &&
    params.has('encounterId')
  );
}
