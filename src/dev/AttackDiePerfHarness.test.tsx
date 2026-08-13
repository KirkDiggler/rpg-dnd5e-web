import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttackDiePerfHarness } from './AttackDiePerfHarness';
import {
  alternatingAttackDieModes,
  evaluateAttackDieBudgets,
} from './attackDiePerfProtocol';

vi.mock('../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (props: { result: number; fallback: React.ReactNode }) => (
    <div data-testid="perf-3d" data-result={props.result}>
      {props.fallback}
    </div>
  ),
}));
vi.mock('../components/ui/dice/DiceTray', () => ({
  DiceTray: ({ finalFace }: { finalFace: number }) => (
    <div data-testid="perf-svg">{finalFace}</div>
  ),
}));

afterEach(() => {
  delete window.__attackDiePerf;
});

describe('AttackDiePerfHarness', () => {
  it('mounts an independent development driver and never needs queue callbacks', () => {
    render(<AttackDiePerfHarness enabled />);
    expect(window.__attackDiePerf).toBeTruthy();
    act(() => {
      window.__attackDiePerf!.runSample({
        mode: '3d',
        result: 20,
        reducedMotion: false,
        token: 10,
      });
    });
    expect(screen.getByTestId('perf-3d').getAttribute('data-result')).toBe(
      '20'
    );
    expect(window.__attackDiePerf!.readCounters().mountedMode).toBe('3d');
    act(() => {
      window.__attackDiePerf!.unmountDie();
    });
    expect(screen.queryByTestId('perf-3d')).toBeNull();
  });

  it('does not expose the driver outside its development gate', () => {
    render(<AttackDiePerfHarness enabled={false} />);
    expect(window.__attackDiePerf).toBeUndefined();
  });

  it('alternates exactly 20 SVG and 20 3D samples', () => {
    const modes = alternatingAttackDieModes(20);
    expect(modes).toHaveLength(40);
    expect(modes.filter((mode) => mode === 'svg')).toHaveLength(20);
    expect(modes.filter((mode) => mode === '3d')).toHaveLength(20);
    expect(modes.slice(0, 4)).toEqual(['svg', '3d', 'svg', '3d']);
  });

  it('enforces frozen relative and long-task budgets', () => {
    expect(
      evaluateAttackDieBudgets({
        svgP95: 10,
        candidateP95: 11,
        svgPostUnmountP95: 10,
        candidatePostUnmountP95: 11,
        attributableLongTasks: 0,
      })
    ).toEqual({
      frameTime: true,
      longTasks: true,
      postUnmount: true,
      pass: true,
    });
    expect(
      evaluateAttackDieBudgets({
        svgP95: 10,
        candidateP95: 11.01,
        svgPostUnmountP95: 10,
        candidatePostUnmountP95: 11.01,
        attributableLongTasks: 1,
      }).pass
    ).toBe(false);
  });
});
