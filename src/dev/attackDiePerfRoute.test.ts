import { describe, expect, it } from 'vitest';
import { selectAttackDieDevRoute } from './attackDiePerfRoute';
describe('attack die real-route gate', () => {
  it('selects actual GameView encounter + overlay only for flagged development route', () => {
    expect(
      selectAttackDieDevRoute(
        'development',
        '?encounterId=real&attackDiePerf=1'
      )
    ).toEqual({ kind: 'real-encounter-perf', encounterId: 'real' });
    expect(
      selectAttackDieDevRoute('development', '?encounterId=fixture')
    ).toEqual({ kind: 'playtest', encounterId: 'fixture' });
    expect(
      selectAttackDieDevRoute('production', '?encounterId=real&attackDiePerf=1')
    ).toEqual({ kind: 'normal' });
  });
});
