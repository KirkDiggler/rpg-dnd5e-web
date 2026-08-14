import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps } from '../../components/ui/dice/AttackDie3D';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die">{props.fallback}</div>;
  },
}));

describe('DiceTray3DConceptPanel', () => {
  it('arms the fixed result-10 die in the fixture gameplay placement', () => {
    localStorage.clear();
    attackDieProps.length = 0;
    const scene = {} as AttackDie3DProps['sceneOverride'];
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
      screen.getByText('Result 10 only · waiting for your roll')
    ).toBeTruthy();
    expect(screen.getByTestId('dice-tray-encounter-preview')).toBeTruthy();
    expect(screen.getByTestId('dice-tray-left-drawer')).toBeTruthy();
    expect(screen.getByTestId('encounter-dock')).toBeTruthy();
    expect(screen.getByTestId('attack-die')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      presentationToken: 9,
      phase: 'ready',
      reducedMotion: true,
      sceneOverride: scene,
      sidecarOverride: sidecar,
      calibrationPose: PROVISIONAL_RESULT_10_POSE,
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
  });

  it('waits indefinitely, releases explicitly, and settles only from matching observed telemetry', () => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
      attackDieProps.length = 0;
      const view = render(
        <DiceTray3DConceptPanel
          token={12}
          sceneOverride={{} as AttackDie3DProps['sceneOverride']}
          sidecarOverride={
            {} as NonNullable<AttackDie3DProps['sidecarOverride']>
          }
        />
      );

      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        presentationToken: 12,
        phase: 'ready',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        presentationToken: 12,
        phase: 'rolling',
        decorativeRelease: {
          presentationId: 'attack:12',
          variation: 12,
          vector: [0, 0],
          shake: 0,
        },
      });
      expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
      expect(
        JSON.stringify(attackDieProps.at(-1)?.decorativeRelease)
      ).not.toMatch(/result|hit|damage|target|https?:\/\//i);

      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(attackDieProps.at(-1)?.phase).toBe('rolling');

      act(() =>
        attackDieProps.at(-1)?.onTelemetry?.({
          presentationToken: 11,
          requestedResult: 10,
          renderer: '3d',
          state: 'observed',
          exactTargetHeld: true,
        })
      );
      expect(attackDieProps.at(-1)?.phase).toBe('rolling');

      act(() =>
        attackDieProps.at(-1)?.onTelemetry?.({
          presentationToken: 12,
          requestedResult: 10,
          renderer: '3d',
          state: 'held',
          exactTargetHeld: true,
        })
      );
      expect(attackDieProps.at(-1)?.phase).toBe('rolling');

      act(() =>
        attackDieProps.at(-1)?.onTelemetry?.({
          presentationToken: 12,
          requestedResult: 10,
          renderer: '3d',
          state: 'observed',
          exactTargetHeld: true,
        })
      );
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        presentationToken: 12,
        phase: 'settled',
      });
      expect(screen.getByTestId('dice-face').textContent).toBe('10');
      expect(
        screen.getByText('Result 10 observed · roll settled')
      ).toBeTruthy();

      view.rerender(
        <DiceTray3DConceptPanel
          token={13}
          sceneOverride={{} as AttackDie3DProps['sceneOverride']}
          sidecarOverride={
            {} as NonNullable<AttackDie3DProps['sidecarOverride']>
          }
        />
      );
      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        presentationToken: 13,
        phase: 'ready',
      });
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
