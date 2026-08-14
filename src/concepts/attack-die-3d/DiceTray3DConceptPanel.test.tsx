import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AttackDie3DProps,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die">{props.fallback}</div>;
  },
}));

function observed(props: AttackDie3DProps): AttackDieTelemetry {
  return {
    presentationToken: props.presentationToken,
    requestedResult: 10,
    renderer: '3d',
    state: 'observed',
    exactTargetHeld: true,
  };
}

describe('DiceTray3DConceptPanel', () => {
  it('feeds a fixed result-10 request event into the shared normal-motion presentation', () => {
    localStorage.clear();
    attackDieProps.length = 0;
    const scene = {} as NonNullable<AttackDie3DProps['sceneOverride']>;
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;

    render(
      <DiceTray3DConceptPanel
        token={9}
        sceneOverride={scene}
        sidecarOverride={sidecar}
      />
    );

    expect(screen.getByText('Gameplay placement checkpoint')).toBeTruthy();
    expect(
      screen.getByText(
        /Dice presentation requested · waiting for release event/
      )
    ).toBeTruthy();
    expect(screen.getByTestId('dice-tray-encounter-preview')).toBeTruthy();
    expect(screen.getByTestId('dice-tray-left-drawer')).toBeTruthy();
    expect(screen.getByTestId('encounter-dock')).toBeTruthy();
    expect(screen.getByTestId('attack-die')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      phase: 'ready',
      reducedMotion: false,
      sceneOverride: scene,
      sidecarOverride: sidecar,
      calibrationPose: PROVISIONAL_RESULT_10_POSE,
    });
    expect(attackDieProps[0].presentationToken).not.toBe(9);
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
  });

  it('appends the requested event once and lets shared matching telemetry settle it', () => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
      attackDieProps.length = 0;
      const view = render(
        <DiceTray3DConceptPanel
          token={12}
          sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
          sidecarOverride={
            {} as NonNullable<AttackDie3DProps['sidecarOverride']>
          }
        />
      );

      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        phase: 'ready',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      const rolling = attackDieProps.at(-1)!;
      expect(rolling).toMatchObject({
        result: 10,
        phase: 'rolling',
        decorativeRelease: {
          presentationId: 'concept:attack:12',
          presetId: 'lightning',
          vector: [0, 0],
          shake: 0,
        },
      });
      expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
      expect(screen.getByText(/release delivered · rolling/)).toBeTruthy();
      expect(JSON.stringify(rolling.decorativeRelease)).not.toMatch(
        /presentationToken|renderer|result|hit|damage|target|https?:\/\//i
      );

      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(attackDieProps.at(-1)?.phase).toBe('rolling');

      act(() =>
        rolling.onTelemetry?.({
          ...observed(rolling),
          presentationToken: rolling.presentationToken - 1,
        })
      );
      expect(attackDieProps.at(-1)?.phase).toBe('rolling');

      act(() => rolling.onTelemetry?.(observed(rolling)));
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        presentationToken: rolling.presentationToken,
        phase: 'settled',
      });
      expect(screen.getByTestId('dice-face').textContent).toBe('10');
      expect(screen.getByText(/roll settled/)).toBeTruthy();

      view.rerender(
        <DiceTray3DConceptPanel
          token={13}
          sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
          sidecarOverride={
            {} as NonNullable<AttackDie3DProps['sidecarOverride']>
          }
        />
      );
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        phase: 'ready',
      });
      expect(attackDieProps.at(-1)?.presentationToken).not.toBe(
        rolling.presentationToken
      );
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
