import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import type {
  DungeonShellArtifact,
  DungeonShellWallProfile,
  ShellVec3,
} from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import type { WorldPos } from './hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from './syntyHexWallHelpers';

export const SHELL_DOOR_COVER_MARGIN = 0.02;
// Provider measurements and runtime vertex buffers cross a float32 boundary.
// Keep the fitted target one seam-tolerance beyond the contract so measured
// rendered geometry remains >= 0.02 rather than rounding a few ulps below it.
const SHELL_DOOR_COVER_ROUNDING_GUARD = 1e-6;
export const SHELL_DOOR_FRAME_FOREGROUND_MARGIN = 0.01;

export interface ShellDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ShellOpening {
  min: readonly [number, number];
  max: readonly [number, number];
}

export interface ShellDoorGeometry {
  frameBounds: { min: ShellVec3; max: ShellVec3 };
  opening: ShellOpening;
  leafBounds: { min: ShellVec3; max: ShellVec3 };
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
  return value;
}

export function shellRawDimensions(
  bounds: DungeonShellArtifact['bounds']
): ShellDimensions {
  const dimensions = {
    width: bounds.max[0] - bounds.min[0],
    height: bounds.max[1] - bounds.min[1],
    depth: bounds.max[2] - bounds.min[2],
  };
  finitePositive(dimensions.width, 'bounds width');
  finitePositive(dimensions.height, 'bounds height');
  finitePositive(dimensions.depth, 'bounds depth');
  return dimensions;
}

function pieceWidth(value: number): number {
  return finitePositive(value, 'piece width');
}

export function shellVisibleWallTop(
  effectiveHeight: number,
  cap: DungeonShellArtifact
): number {
  return (
    finitePositive(effectiveHeight, 'effective wall height') +
    shellRawDimensions(cap.bounds).height * SYNTY_SCALE
  );
}

export function shellBodyScale(
  body: DungeonShellArtifact,
  width: number,
  effectiveHeight: number
): [number, number, number] {
  const raw = shellRawDimensions(body.bounds);
  return [
    pieceWidth(width) / raw.width,
    finitePositive(effectiveHeight, 'effective wall height') / raw.height,
    SYNTY_SCALE,
  ];
}

export function shellTrimScale(
  trim: DungeonShellArtifact,
  width: number
): [number, number, number] {
  const raw = shellRawDimensions(trim.bounds);
  return [pieceWidth(width) / raw.width, SYNTY_SCALE, SYNTY_SCALE];
}

export function shellDoorSurroundScale(
  surround: DungeonShellArtifact,
  visibleWallTop: number
): [number, number, number] {
  const raw = shellRawDimensions(surround.bounds);
  return [
    DOOR_FRAME_CALIBRATED_WIDTH / raw.width,
    finitePositive(visibleWallTop, 'visible wall top') / raw.height,
    SYNTY_SCALE,
  ];
}

export function shellComponentY(
  kind: 'body' | 'base' | 'cap' | 'doorSurround',
  effectiveHeight: number
): number {
  finitePositive(effectiveHeight, 'effective wall height');
  return kind === 'cap'
    ? DUNGEON_SURFACE_Y + effectiveHeight
    : DUNGEON_SURFACE_Y;
}

/** Convert an offset in a model's local X/Z plane into a world X/Z offset. */
export function shellLocalOffsetToWorld(
  offset: { x: number; z: number },
  rotationY: number
): WorldPos {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.z))
    throw new Error('local offset must be finite');
  if (!Number.isFinite(rotationY)) throw new Error('rotation must be finite');
  return {
    x: offset.x * Math.cos(rotationY) + offset.z * Math.sin(rotationY),
    z: -offset.x * Math.sin(rotationY) + offset.z * Math.cos(rotationY),
  };
}

function scenePoints(scene: THREE.Object3D): THREE.Vector3[] {
  scene.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      points.push(
        node.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i))
      );
    }
  });
  return points;
}

function boundsOf(points: readonly THREE.Vector3[]): {
  min: ShellVec3;
  max: ShellVec3;
} {
  if (points.length === 0)
    throw new Error('shell geometry contains no vertices');
  const box = new THREE.Box3().setFromPoints([...points]);
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

function openingAtFloor(
  points: readonly THREE.Vector3[],
  frameBounds: { min: ShellVec3; max: ShellVec3 }
): { left: number; right: number } {
  const center = (frameBounds.min[0] + frameBounds.max[0]) / 2;
  const tolerance = Math.max(
    1e-5,
    (frameBounds.max[1] - frameBounds.min[1]) * 0.025
  );
  const floorPoints = points.filter(
    (point) => point.y <= frameBounds.min[1] + tolerance
  );
  const left = floorPoints
    .map((point) => point.x)
    .filter((x) => x < center)
    .reduce((max, x) => Math.max(max, x), -Infinity);
  const right = floorPoints
    .map((point) => point.x)
    .filter((x) => x > center)
    .reduce((min, x) => Math.min(min, x), Infinity);
  if (!(left < right))
    throw new Error('shell door opening could not be derived');
  return { left, right };
}

export function deriveShellDoorGeometry(
  surroundScene: THREE.Object3D,
  leafScene: THREE.Object3D
): ShellDoorGeometry {
  const framePoints = scenePoints(surroundScene);
  const leafPoints = scenePoints(leafScene);
  const frameBounds = boundsOf(framePoints);
  const leafBounds = boundsOf(leafPoints);
  const { left, right } = openingAtFloor(framePoints, frameBounds);
  const center = (frameBounds.min[0] + frameBounds.max[0]) / 2;

  // A lintel's first occupied Y is the opening top. Mesh-level bounds handle
  // box-like fixtures; central vertices cover a single-mesh authored GLB.
  const openingInset = Math.min(0.1, (right - left) * 0.2);
  const pointTop = framePoints
    .filter(
      (point) =>
        point.x > left + openingInset &&
        point.x < right - openingInset &&
        point.y > frameBounds.min[1] + 1e-5
    )
    .reduce((min, point) => Math.min(min, point.y), Infinity);
  const meshTop = (() => {
    let top = Infinity;
    surroundScene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const box = boundsOf(scenePoints(node));
      if (
        box.min[1] > frameBounds.min[1] + 1e-5 &&
        box.min[0] < center &&
        box.max[0] > center
      )
        top = Math.min(top, box.min[1]);
    });
    return top;
  })();
  const openingTop = Math.min(pointTop, meshTop);
  if (!Number.isFinite(openingTop) || !(openingTop > frameBounds.min[1]))
    throw new Error('shell door opening top could not be derived');

  return {
    frameBounds,
    opening: { min: [left, frameBounds.min[1]], max: [right, openingTop] },
    leafBounds,
  };
}

export interface ShellDoorLeafFit {
  scale: [number, number, number];
  localTranslation: [number, number, number];
}

/** Fit the baked leaf geometry to the scaled frame aperture while leaving the
 * hinge group fixed. `hingeGroupLocalX` is gapStart expressed in the frame's
 * local X coordinates; the returned translation belongs only on the child. */
export function shellDoorLeafFit(
  leaf: { bounds: { min: ShellVec3; max: ShellVec3 } },
  opening: ShellOpening,
  frameScale: [number, number, number],
  hingeGroupLocalX: number
): ShellDoorLeafFit {
  const leafRaw = shellRawDimensions(leaf.bounds);
  const frameScaleX = finitePositive(frameScale[0], 'door frame X scale');
  const frameScaleY = finitePositive(frameScale[1], 'door frame Y scale');
  if (!Number.isFinite(hingeGroupLocalX))
    throw new Error('door hinge local X must be finite');

  const fittedCover = SHELL_DOOR_COVER_MARGIN + SHELL_DOOR_COVER_ROUNDING_GUARD;
  const targetMinX = opening.min[0] * frameScaleX - fittedCover;
  const targetMaxX = opening.max[0] * frameScaleX + fittedCover;
  const targetFloor = opening.min[1] * frameScaleY;
  const targetTop = opening.max[1] * frameScaleY + fittedCover;
  const scale: [number, number, number] = [
    finitePositive(targetMaxX - targetMinX, 'target opening width') /
      leafRaw.width,
    finitePositive(targetTop - targetFloor, 'target opening height') /
      leafRaw.height,
    SYNTY_SCALE,
  ];

  return {
    scale,
    localTranslation: [
      targetMinX - hingeGroupLocalX - leaf.bounds.min[0] * scale[0],
      // GlbInstance base-anchors baked non-uniform geometry before applying
      // this child translation, so its effective local minimum Y is zero.
      targetFloor,
      0,
    ],
  };
}

export function shellComponentPivotOffset(
  body: DungeonShellWallProfile['body'],
  component: DungeonShellArtifact,
  width: number,
  componentScale: [number, number, number]
): number {
  const bodyRaw = shellRawDimensions(body.bounds);
  shellRawDimensions(component.bounds);
  const bodyScaleX = pieceWidth(width) / bodyRaw.width;
  return (
    body.bounds.min[0] * bodyScaleX -
    component.bounds.min[0] * componentScale[0]
  );
}
