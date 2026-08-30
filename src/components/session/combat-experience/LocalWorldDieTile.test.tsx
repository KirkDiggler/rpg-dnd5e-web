import type { Scene3D } from '@/components/session/atlasToScene3D';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalWorldDieTile } from './LocalWorldDieTile';

function scene(): Scene3D {
  return {
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

    expect(screen.getByText('Preparing die')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pick up d20' })).toBeNull();
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
      height: 1.25,
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

    expect(onHeldChange).toHaveBeenLastCalledWith({
      position: [0, 0],
      height: 1.45,
    });
  });
});
