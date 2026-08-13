import { describe, expect, it } from 'vitest';
import { shouldMountAttackDiePerf } from './attackDiePerfRoute';
describe('attack die real-route gate', () => {
  it('mounts only development encounter route with explicit flag', () => {
    expect(
      shouldMountAttackDiePerf('development', '?encounterId=e&attackDiePerf=1')
    ).toBe(true);
    expect(
      shouldMountAttackDiePerf('production', '?encounterId=e&attackDiePerf=1')
    ).toBe(false);
    expect(shouldMountAttackDiePerf('development', '?encounterId=e')).toBe(
      false
    );
    expect(shouldMountAttackDiePerf('development', '?attackDiePerf=1')).toBe(
      false
    );
  });
});
