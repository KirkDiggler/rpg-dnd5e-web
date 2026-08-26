import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createPhaseElapsedClock } from './phaseElapsedClock';
import { projectRollGroupHitTarget } from './rollGroupHitTarget';
import type { RollGroupMemberLayout } from './rollGroupLayout';
import {
  configureRollGroupTrayCamera,
  ROLL_GROUP_HELD_PLANE_HEIGHT,
  ROLL_GROUP_HELD_PLANE_WIDTH,
} from './rollGroupTrayGeometry';
import { createRuntimeDiceSurfaceHandle } from './runtimeDiceSurfaceGrab';
import { createTrayPlaneProjection } from './trayPlaneProjection';

const viewport = Object.freeze({
  left: 12,
  top: 24,
  width: 720,
  height: 520,
});

function projectWorld(camera: PerspectiveCamera, point: Vector3) {
  const projected = point.clone().project(camera);
  return [
    viewport.left + ((projected.x + 1) / 2) * viewport.width,
    viewport.top + ((1 - projected.y) / 2) * viewport.height,
  ] as const;
}

describe('roll group tray runtime seams', () => {
  it('configures a real perspective camera to look at the tray plane', () => {
    const camera = new PerspectiveCamera();

    configureRollGroupTrayCamera(camera);

    const direction = camera.getWorldDirection(new Vector3());
    expect(direction.x).toBeCloseTo(0, 12);
    expect(direction.y).toBeCloseTo(-1, 12);
    expect(direction.z).toBeCloseTo(0, 12);
    expect(camera.up.toArray()).toEqual([0, 0, -1]);
  });

  it('projects overlay bounds from the same real tray plane used by held motion', () => {
    const camera = new PerspectiveCamera();
    camera.aspect = viewport.width / viewport.height;
    configureRollGroupTrayCamera(camera);
    camera.updateProjectionMatrix();
    const projection = createTrayPlaneProjection({
      camera,
      viewport,
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      yAxis: [0, 0, 1],
      width: ROLL_GROUP_HELD_PLANE_WIDTH,
      height: ROLL_GROUP_HELD_PLANE_HEIGHT,
    })!;
    const layout: RollGroupMemberLayout = {
      dieId: 'die:projected',
      center: [0.14, -0.08],
      radius: 0.11,
    };

    const style = projectRollGroupHitTarget(layout, projection, viewport);
    const projectedCenter = projection.planeToScreen(layout.center)!;
    expect(Number.parseFloat(String(style.left))).toBeCloseTo(
      projectedCenter[0] - viewport.left,
      8
    );
    expect(Number.parseFloat(String(style.top))).toBeCloseTo(
      projectedCenter[1] - viewport.top,
      8
    );
    expect(Number.parseFloat(String(style.width))).toBeGreaterThan(0);
    expect(Number.parseFloat(String(style.height))).toBeGreaterThan(0);
    expect(style.position).toBe('absolute');
  });

  it('measures each animated phase from its first rendered frame', () => {
    const clock = createPhaseElapsedClock();

    expect(clock.elapsed('rolling-originals:2', 18_000)).toBe(0);
    expect(clock.elapsed('rolling-originals:2', 18_125)).toBe(125);
    expect(clock.elapsed('rerolling:4', 41_000)).toBe(0);
    expect(clock.elapsed('rerolling:4', 41_075)).toBe(75);
  });

  it('retains an actual raycast mesh-surface point through normalization and full world transforms', () => {
    const camera = new PerspectiveCamera(45, viewport.width / viewport.height);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const root = new Group();
    root.position.set(0.35, 0.1, 0);
    const normalization = new Group();
    normalization.scale.setScalar(0.55);
    const recenter = new Group();
    recenter.position.set(0.25, -0.1, 0);
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: '#ffffff' })
    );
    recenter.add(mesh);
    normalization.add(recenter);
    root.add(normalization);
    root.updateWorldMatrix(true, true);

    const meshCenter = mesh.getWorldPosition(new Vector3());
    const client = projectWorld(camera, meshCenter);
    const handle = createRuntimeDiceSurfaceHandle(root, 44);
    const grab = handle.captureSurface({
      clientX: client[0],
      clientY: client[1],
      camera,
      viewport,
    })!;

    expect(grab.object).toBe(mesh);
    expect(grab.runtimeCloneId).toBe(44);
    expect(grab.localPoint[2]).toBeCloseTo(0.5, 6);
    expect(grab.localPoint).not.toEqual([0, 0, 0]);

    root.position.x += 0.4;
    root.rotation.y = 0.25;
    root.updateWorldMatrix(true, true);
    const expectedWorld = mesh.localToWorld(new Vector3(...grab.localPoint));
    const expectedClient = projectWorld(camera, expectedWorld);
    const projected = handle.projectSurface({ grab, camera, viewport })!;
    expect(projected[0]).toBeCloseTo(expectedClient[0], 8);
    expect(projected[1]).toBeCloseTo(expectedClient[1], 8);
  });
});
