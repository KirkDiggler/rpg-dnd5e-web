import { act, fireEvent, render, screen } from '@testing-library/react';
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
  kind: 'd20',
  presetId: 'lightning',
  authoritativeResult: 10,
};
const release: DicePresentationRelease = Object.freeze({
  schemaVersion: 1,
  presentationId: 'attack:7',
  presetId: 'lightning',
  variation: 7,
  vector: Object.freeze([0, 0] as const),
  shake: 0,
});
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
      presentationId="attack:7"
      rendererGeneration={-7}
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
      presentationToken: -7,
      phase: 'settled',
      reducedMotion: true,
      materialMode: 'magical',
      sceneOverride,
      sidecarOverride,
      calibrationPose,
    });
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
    expect(attackDieProps[0]).toMatchObject({ result: 10, phase: 'ready' });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('hides Roll without a host callback and preserves authority when one is installed later', () => {
    const view = renderTray([die], { phase: 'armed' });

    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();

    const onReleaseRequest = vi.fn();
    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        rollerRole="player"
        witnessRole="roller"
        phase="armed"
        dice={[die]}
        onReleaseRequest={onReleaseRequest}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('requests release once and does not synthesize delivery or settlement', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
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
      presentationToken: -7,
      phase: 'rolling',
      decorativeRelease: release,
    });
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('never automatically requests release for a monster roller', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], {
      phase: 'armed',
      rollerRole: 'monster',
      onReleaseRequest,
    });

    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(onReleaseRequest).not.toHaveBeenCalled();
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
      presentationToken: -7,
      requestedResult: 10,
      renderer: '3d' as const,
      state: 'observed' as const,
      exactTargetHeld: true,
    };

    attackDieProps[0].onTelemetry?.(event);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry).toHaveBeenCalledWith(event);
  });

  it('does not pass a release for another presentation or preset to the renderer', () => {
    renderTray([die], {
      phase: 'rolling',
      release: { ...release, presentationId: 'attack:8' },
    });
    expect(attackDieProps.at(-1)?.decorativeRelease).toBeUndefined();

    renderTray([die], {
      phase: 'rolling',
      release: { ...release, presetId: 'newer-safe-preset' },
    });
    expect(attackDieProps.at(-1)?.decorativeRelease).toBeUndefined();
  });

  it('renders an unknown safe preset as semantic SVG without invoking the allowlisted renderer', () => {
    vi.useFakeTimers();
    try {
      const unknown = { ...die, presetId: 'newer-safe-preset' };
      const onReleaseRequest = vi.fn();
      const onFallbackPresentationComplete = vi.fn();
      const view = renderTray([unknown], {
        phase: 'armed',
        reducedMotion: false,
        onReleaseRequest,
        onFallbackPresentationComplete,
      });

      expect(attackDieProps).toHaveLength(0);
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      expect(onReleaseRequest).toHaveBeenCalledTimes(1);

      view.rerender(
        <DiceTray3D
          label="Player attack tray"
          presentationId="attack:7"
          rendererGeneration={-7}
          rollerRole="player"
          witnessRole="roller"
          phase="rolling"
          dice={[unknown]}
          release={{ ...release, presetId: 'newer-safe-preset' }}
          reducedMotion={false}
          onFallbackPresentationComplete={onFallbackPresentationComplete}
        />
      );
      expect(screen.getByTestId('dice-tray').className).toContain(
        'dice-tray--rolling'
      );
      expect(screen.getByTestId('dice-face').textContent).not.toBe('10');
      act(() => vi.advanceTimersByTime(3000));
      expect(onFallbackPresentationComplete).toHaveBeenCalledTimes(1);
      expect(attackDieProps).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the truthful settled SVG result for an unknown safe preset', () => {
    renderTray([{ ...die, presetId: 'newer-safe-preset' }]);

    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(attackDieProps).toHaveLength(0);
  });

  it.each([
    ['empty', []],
    ['two items', [die, die]],
    ['non-d20', [{ ...die, kind: 'd12' }]],
    ['unsafe preset', [{ ...die, presetId: 'https://evil.test/die.glb' }]],
    ['result below range', [{ ...die, authoritativeResult: 0 }]],
    ['result above range', [{ ...die, authoritativeResult: 21 }]],
  ])('renders unavailable copy and no renderer for %s input', (_name, dice) => {
    renderTray(dice as DiceTray3DItem[]);

    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
    expect(screen.queryByTestId('attack-die-3d-mock')).toBeNull();
    expect(attackDieProps).toHaveLength(0);
  });

  it('fails closed for an invalid external presentation id or renderer generation', () => {
    const view = renderTray([die], { presentationId: '../attack' });
    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={Number.NaN}
        rollerRole="player"
        witnessRole="roller"
        phase="settled"
        dice={[die]}
      />
    );
    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
  });
});
