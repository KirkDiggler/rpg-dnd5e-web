import type { Scene3D } from '@/components/session/atlasToScene3D';
import {
  DEFAULT_DIE_SCALE,
  localWorldDieDimensions,
} from '@/components/session/local-world-die/diceDials';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalWorldDieTile } from './LocalWorldDieTile';

// Not hardcoded — LocalWorldDieTile reads `?dieScale=` (diceDials.ts) and
// scales the held/lift heights by it (#906), so the expected heights below
// are computed from the SAME default the component itself resolves, rather
// than pinning a literal that drifts every time the default dial is tuned
// (round 3: 1 -> 2).
const DEFAULT_HOLD_HEIGHT =
  localWorldDieDimensions(DEFAULT_DIE_SCALE).holdHeightDefault;

function scene(): Scene3D {
  return {
    exits: [],
    floorTiles: new Map([['0,0,0', { x: 0, y: 0, z: 0, roomId: 'room-a' }]]),
    props: [],
    archetypes: [],
    lighting: {} as Scene3D['lighting'],
    wallRuns: [],
    doorGaps: [],
  };
}

function projection(): TrayPlaneProjection {
  return {
    screenToPlane: () => [0, 0],
    planeToScreen: () => [0, 0],
    planeToNormalized: () => [0.5, 0.5],
  };
}

function installCapture(button: HTMLElement) {
  let captured: number | undefined;
  Object.assign(button, {
    setPointerCapture: (pointerId: number) => {
      captured = pointerId;
    },
    hasPointerCapture: (pointerId: number) => captured === pointerId,
    releasePointerCapture: (pointerId: number) => {
      if (captured === pointerId) captured = undefined;
    },
  });
}

describe('LocalWorldDieTile pickup checkpoint', () => {
  it('does not expose a dead pickup target before the world body is ready', () => {
    render(<LocalWorldDieTile mode="ready" pickupReady={false} />);

    expect(screen.getByText('Preparing shared d20')).toBeTruthy();
    expect(screen.getByLabelText('Shared d20')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pick up d20' })).toBeNull();
  });

  it('offers one shared throw path without experimental playback controls', () => {
    render(<LocalWorldDieTile mode="ready" pickupReady />);

    expect(screen.getByText('Shared d20 ready')).toBeTruthy();
    expect(screen.getByLabelText('Shared d20')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /playback mode/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Direct' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Planned' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Published' })).toBeNull();
  });

  it('describes an in-progress throw as shared presentation', () => {
    render(<LocalWorldDieTile mode="status" />);

    expect(screen.getByText('Shared d20 presentation')).toBeTruthy();
    expect(screen.getByLabelText('Shared d20')).toBeTruthy();
    expect(screen.queryByText(/no witness playback/i)).toBeNull();
  });

  it('keeps fallback copy and labeling shared rather than Attack-specific', () => {
    render(<LocalWorldDieTile mode="fallback" />);

    expect(
      screen.getByText('Shared d20 presentation unavailable')
    ).toBeTruthy();
    expect(screen.getByLabelText('Shared d20')).toBeTruthy();
  });

  it('keeps an accessible neutral Roll action available before pickup is ready', () => {
    const onRoll = vi.fn();
    render(
      <LocalWorldDieTile mode="ready" pickupReady={false} onRoll={onRoll} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('keeps pointer capture through handoff and reports held world movement', () => {
    const projectionRef: { current: TrayPlaneProjection | undefined } = {
      current: projection(),
    };
    const onHeldChange = vi.fn();
    const parentMove = vi.fn();
    render(
      <div onPointerMove={parentMove}>
        <LocalWorldDieTile
          mode="ready"
          pickupReady
          scene={scene()}
          projectionRef={projectionRef}
          onHeldChange={onHeldChange}
        />
      </div>
    );
    const pickup = screen.getByRole('button', { name: 'Pick up d20' });
    installCapture(pickup);

    fireEvent.pointerDown(pickup, {
      pointerId: 7,
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(pickup, {
      pointerId: 7,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });

    expect(onHeldChange).toHaveBeenLastCalledWith({
      position: [0, 0],
      height: DEFAULT_HOLD_HEIGHT,
    });
    expect(parentMove).not.toHaveBeenCalled();
    expect(pickup.className).toContain('localWorldDieCaptureHidden');

    fireEvent.pointerUp(pickup, {
      pointerId: 7,
      button: 0,
      buttons: 0,
    });
    expect(onHeldChange).toHaveBeenLastCalledWith(undefined);
  });

  it('cancels instead of publishing when release leaves valid floor', () => {
    let point: readonly [number, number] = [0, 0];
    const projectionRef: { current: TrayPlaneProjection | undefined } = {
      current: {
        ...projection(),
        screenToPlane: () => point,
      },
    };
    const onHeldChange = vi.fn();
    const onRelease = vi.fn();
    render(
      <LocalWorldDieTile
        mode="ready"
        pickupReady
        scene={scene()}
        projectionRef={projectionRef}
        onHeldChange={onHeldChange}
        onRelease={onRelease}
      />
    );
    const pickup = screen.getByRole('button', { name: 'Pick up d20' });
    installCapture(pickup);
    fireEvent.pointerDown(pickup, {
      pointerId: 12,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerMove(pickup, {
      pointerId: 12,
      buttons: 1,
    });
    point = [50, 50];
    fireEvent.pointerMove(pickup, {
      pointerId: 12,
      buttons: 1,
    });
    fireEvent.pointerUp(pickup, {
      pointerId: 12,
      button: 0,
      buttons: 0,
    });

    expect(onRelease).not.toHaveBeenCalled();
    expect(onHeldChange).toHaveBeenLastCalledWith(undefined);
    expect(pickup.className).not.toContain('localWorldDieCaptureHidden');
  });

  it('freezes X/Z while left and right adjust lift height', () => {
    const projectionRef: { current: TrayPlaneProjection | undefined } = {
      current: projection(),
    };
    const onHeldChange = vi.fn();
    render(
      <LocalWorldDieTile
        mode="ready"
        pickupReady
        scene={scene()}
        projectionRef={projectionRef}
        onHeldChange={onHeldChange}
      />
    );
    const pickup = screen.getByRole('button', { name: 'Pick up d20' });
    installCapture(pickup);
    fireEvent.pointerDown(pickup, {
      pointerId: 9,
      button: 0,
      buttons: 1,
      clientY: 100,
    });
    fireEvent.pointerMove(pickup, {
      pointerId: 9,
      buttons: 1,
      clientY: 100,
    });
    fireEvent.pointerMove(pickup, {
      pointerId: 9,
      buttons: 3,
      clientY: 80,
    });

    // The lift delta itself (pointer pixels * 0.01) is NOT scaled by
    // dieScale — only the held-height default/min/max clamp are (see
    // diceDials.ts's own doc comment on what scales together).
    expect(onHeldChange).toHaveBeenLastCalledWith({
      position: [0, 0],
      height: DEFAULT_HOLD_HEIGHT + 0.2,
    });
  });
});
