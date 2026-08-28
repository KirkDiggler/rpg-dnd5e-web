import { PerspectiveCamera, Vector3, type Camera } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createTrayPlaneProjection,
  type TrayPlanePoint,
} from './trayPlaneProjection';

const viewport = Object.freeze({
  left: 17,
  top: 23,
  width: 440,
  height: 360,
});
const origin = [0, 0, 0] as const;
const xAxis = [1, 0, 0] as const;
const yAxis = [0, 0, 1] as const;

function makeCamera(view: 'top' | 'three-quarter'): Camera {
  const camera = new PerspectiveCamera(
    35,
    viewport.width / viewport.height,
    0.1,
    100
  );
  if (view === 'top') {
    camera.position.set(0, 4, 0);
    camera.up.set(0, 0, -1);
  } else {
    camera.position.set(0.7, 1.7146, 0.7);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(new Vector3(0, 0, 0));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function createProjection(
  view: 'top' | 'three-quarter' = 'three-quarter',
  overrides: Partial<Parameters<typeof createTrayPlaneProjection>[0]> = {}
) {
  return createTrayPlaneProjection({
    camera: makeCamera(view),
    viewport,
    origin,
    xAxis,
    yAxis,
    width: 2.2,
    height: 1.8,
    ...overrides,
  });
}

describe('createTrayPlaneProjection', () => {
  it.each([
    ['center', [0, 0] as const],
    ['quarter', [0.44, -0.36] as const],
    ['edge', [1.1, 0.9] as const],
  ] as const)(
    'round-trips the %s tray-plane point through the three-quarter camera',
    (_label, point) => {
      const projection = createProjection();
      expect(projection).toBeDefined();

      const screen = projection!.planeToScreen(point);
      expect(screen).toBeDefined();
      const roundTrip = projection!.screenToPlane(...screen!);
      expect(roundTrip).toBeDefined();
      expect(roundTrip![0]).toBeCloseTo(point[0], 6);
      expect(roundTrip![1]).toBeCloseTo(point[1], 6);
      expect(
        Math.hypot(roundTrip![0] - point[0], roundTrip![1] - point[1])
      ).toBeLessThanOrEqual(0.000001);
    }
  );

  it.each([
    ['center', [0, 0] as const, [0.5, 0.5] as const],
    ['left-top edge', [-1.1, 0.9] as const, [0, 1] as const],
    ['right-bottom edge', [1.1, -0.9] as const, [1, 0] as const],
  ] as const)(
    'maps %s to normalized tray coordinates',
    (_label, point, expected) => {
      expect(createProjection()!.planeToNormalized(point)).toEqual(expected);
    }
  );

  it('round-trips center, quarter, and edge points through the top camera too', () => {
    const projection = createProjection('top');
    const points: readonly TrayPlanePoint[] = [
      [0, 0],
      [-0.44, 0.36],
      [1.1, -0.9],
    ];

    for (const point of points) {
      const screen = projection!.planeToScreen(point);
      const roundTrip = projection!.screenToPlane(...screen!);
      expect(roundTrip![0]).toBeCloseTo(point[0], 6);
      expect(roundTrip![1]).toBeCloseTo(point[1], 6);
      expect(
        Math.hypot(roundTrip![0] - point[0], roundTrip![1] - point[1])
      ).toBeLessThanOrEqual(0.000001);
    }
  });

  it('rejects fixed screen-to-X/Z mapping that the three-quarter camera distorts', () => {
    const projection = createProjection();
    const planePoint = [0.66, -0.42] as const;
    const screen = projection!.planeToScreen(planePoint)!;
    const fixedMapping: TrayPlanePoint = [
      ((screen[0] - viewport.left) / viewport.width - 0.5) * 2.2,
      (0.5 - (screen[1] - viewport.top) / viewport.height) * 1.8,
    ];
    const rayPlaneMapping = projection!.screenToPlane(...screen)!;

    expect(
      Math.hypot(
        ...fixedMapping.map((value, index) => value - planePoint[index])
      )
    ).toBeGreaterThan(0.01);
    expect(
      Math.hypot(
        ...rayPlaneMapping.map((value, index) => value - planePoint[index])
      )
    ).toBeLessThanOrEqual(0.000001);
  });

  it.each([
    ['zero viewport width', { viewport: { ...viewport, width: 0 } }],
    ['zero viewport height', { viewport: { ...viewport, height: 0 } }],
    ['negative plane width', { width: 0 }],
    ['non-finite origin', { origin: [Number.NaN, 0, 0] as const }],
    ['non-unit x axis', { xAxis: [2, 0, 0] as const }],
    ['non-unit y axis', { yAxis: [0, 0, 2] as const }],
    ['parallel axes', { yAxis: [1, 0, 0] as const }],
    ['non-finite axis', { xAxis: [Number.POSITIVE_INFINITY, 0, 0] as const }],
  ] as const)('rejects invalid projection input: %s', (_label, overrides) => {
    expect(createProjection('three-quarter', overrides)).toBeUndefined();
  });

  it('rejects non-finite queries without producing serialized invalid coordinates', () => {
    const projection = createProjection()!;

    expect(projection.screenToPlane(Number.NaN, 10)).toBeUndefined();
    expect(
      projection.screenToPlane(10, Number.POSITIVE_INFINITY)
    ).toBeUndefined();
    expect(projection.planeToScreen([Number.NaN, 0])).toBeUndefined();
    expect(
      projection.planeToScreen([0, Number.NEGATIVE_INFINITY])
    ).toBeUndefined();
    expect(projection.planeToNormalized([Number.NaN, 0])).toBeUndefined();
  });

  it('rejects a ray-plane intersection behind the camera', () => {
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const projection = createTrayPlaneProjection({
      camera,
      viewport: { left: 0, top: 0, width: 200, height: 200 },
      origin: [0, 0, 10],
      xAxis: [1, 0, 0],
      yAxis: [0, 1, 0],
      width: 2,
      height: 2,
    });

    expect(projection).toBeDefined();
    expect(projection!.screenToPlane(100, 100)).toBeUndefined();
    expect(projection!.planeToScreen([0, 0])).toBeUndefined();
  });
});
