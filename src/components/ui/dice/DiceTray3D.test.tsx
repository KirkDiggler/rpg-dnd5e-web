import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps } from './AttackDie3D';
import type { AttackDieRuntimeSidecar } from './attackDieContract';
import type { DicePresentationRelease } from './dicePresentationRelease';
import {
  DiceTray3D,
  type DiceTray3DItem,
  type DiceTray3DProps,
} from './DiceTray3D';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('./AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die-3d-mock">{props.fallback}</div>;
  },
}));

const die: DiceTray3DItem = {
  id: 'attack',
  kind: 'd20',
  presetId: 'lightning',
  authoritativeResult: 10,
  presentationToken: 7,
};
const sceneOverride = {} as AttackDie3DProps['sceneOverride'];
const sidecarOverride = {} as AttackDieRuntimeSidecar;
const calibrationPose = [0.1, 0.2, 0.3, 0.4] as const;

function renderTray(
  dice: readonly DiceTray3DItem[] = [die],
  overrides: Partial<DiceTray3DProps> = {}
) {
  attackDieProps.length = 0;
  return render(
    <DiceTray3D
      label="Player attack tray"
      rollerRole="player"
      witnessRole="roller"
      phase="settled"
      dice={dice}
      reducedMotion
      sceneOverride={sceneOverride}
      sidecarOverride={sidecarOverride}
      calibrationPose={calibrationPose}
      {...overrides}
    />
  );
}

describe('DiceTray3D', () => {
  it('renders exactly one allowlisted d20 and passes authoritative inputs unchanged', () => {
    renderTray();

    expect(screen.getByTestId('dice-tray-3d-renderer')).toBeTruthy();
    expect(screen.getByTestId('attack-die-3d-mock')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      presentationToken: 7,
      phase: 'settled',
      reducedMotion: true,
      materialMode: 'magical',
      sceneOverride,
      sidecarOverride,
      calibrationPose,
    });
    expect(screen.getByTestId('d20-die')).toBeTruthy();
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('arms a player roller without revealing the 3D or SVG result', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest });

    expect(
      screen
        .getByRole('button', { name: 'Roll d20' })
        .closest('.dice-tray-3d-shell--compact .dice-tray-3d-shell__controls')
    ).toBeTruthy();
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      phase: 'ready',
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('waits indefinitely for an explicit player release', () => {
    vi.useFakeTimers();
    try {
      const onReleaseRequest = vi.fn();
      renderTray([die], { phase: 'armed', onReleaseRequest });

      vi.advanceTimersByTime(60 * 60 * 1000);

      expect(onReleaseRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits one compact release and never changes the supplied result', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const release = onReleaseRequest.mock
      .calls[0][0] as DicePresentationRelease;
    expect(release).toMatchObject({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0, 0],
      shake: 0,
    });
    expect(JSON.stringify(release)).not.toContain('10');

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        rollerRole="player"
        witnessRole="roller"
        phase="rolling"
        dice={[die]}
        release={release}
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      phase: 'rolling',
      decorativeRelease: release,
    });
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('automatically emits one release for a monster roller', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], {
      phase: 'armed',
      rollerRole: 'monster',
      onReleaseRequest,
    });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest.mock.calls[0][0]).toMatchObject({
      presentationId: 'attack:7',
      variation: 7,
    });
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();

    view.rerender(
      <DiceTray3D
        label="Monster attack tray"
        rollerRole="monster"
        witnessRole="roller"
        phase="armed"
        dice={[die]}
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it.each(['player', 'monster'] as const)(
    'never gives a spectator control or release authority for a %s roll',
    (rollerRole) => {
      const onReleaseRequest = vi.fn();
      renderTray([die], {
        phase: 'armed',
        rollerRole,
        witnessRole: 'spectator',
        onReleaseRequest,
      });

      expect(screen.queryByRole('button', { name: /roll/i })).toBeNull();
      expect(onReleaseRequest).not.toHaveBeenCalled();
    }
  );

  it('passes renderer telemetry through without synthesizing settlement', () => {
    const onTelemetry = vi.fn();
    renderTray([die], { phase: 'rolling', onTelemetry });
    const event = {
      presentationToken: 7,
      requestedResult: 10,
      renderer: '3d' as const,
      state: 'observed' as const,
      exactTargetHeld: true,
    };

    attackDieProps[0].onTelemetry?.(event);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry).toHaveBeenCalledWith(event);
  });

  it.each([
    ['empty', []],
    ['two items', [die, { ...die, id: 'second' }]],
    ['non-d20', [{ ...die, kind: 'd12' }]],
    ['unknown preset', [{ ...die, presetId: 'unknown' }]],
    ['result below range', [{ ...die, authoritativeResult: 0 }]],
    ['result above range', [{ ...die, authoritativeResult: 21 }]],
  ])(
    'renders semantic fallback and no renderer for %s input',
    (_name, dice) => {
      renderTray(dice as DiceTray3DItem[]);

      expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
      expect(screen.queryByTestId('attack-die-3d-mock')).toBeNull();
      expect(attackDieProps).toHaveLength(0);
    }
  );
});
