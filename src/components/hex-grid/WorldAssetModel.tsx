import {
  resolveWorldAsset,
  type GeneratedWorldAsset,
  type WorldAssetResolutionDiagnostic,
} from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PropModelBounds } from './PropModel';

export type WorldAssetRole = NonNullable<
  GeneratedWorldAsset['roles']
>[number]['role'];

/** One declared opening: the asset-local id and its leaf pivot in asset space. */
export interface WorldAssetDoor {
  id: string;
  /** Leaf pivot in the asset's local frame; the placement transform is the consumer's. */
  position: [number, number, number];
}

export interface WorldAssetRoleDiagnostic {
  ref: string;
  reason: 'missing-role-node';
  role: WorldAssetRole;
  node: string;
}

/** The height-scale range every call site clamps to. */
const MIN_HEIGHT_SCALE = 0.25;
const MAX_HEIGHT_SCALE = 4;

/** Upper bound on tiled `above` rows, so an asset whose row is a tiny
 * fraction of its body cannot mint unbounded clones. Past this the residual
 * scale absorbs the difference, which only happens near the top of the clamp
 * and only on such an asset. */
const MAX_ABOVE_ROWS = 64;

export type WorldAssetModelDiagnostic =
  | WorldAssetResolutionDiagnostic
  | WorldAssetRoleDiagnostic;

export interface WorldAssetModelProps {
  /** A promoted exact ref. Family refs and unknown exact refs never fall back. */
  assetRef: string;
  position: [number, number, number];
  rotationY?: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onDiagnostic?: (diagnostic: WorldAssetModelDiagnostic) => void;
  heightScale?: number;
  /** Asset-local door ids rendered OPEN: every `leaf` in the group swings about its own hinge. */
  openDoors?: readonly string[];
  /** Called once per instance with every declared door group and its leaf pivot. */
  onDoorsResolved?: (doors: readonly WorldAssetDoor[]) => void;
}

interface ResolvedLeaf {
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
}

interface ResolvedDoor {
  id: string;
  position: [number, number, number];
  leaves: ResolvedLeaf[];
}

interface ResolvedRoles {
  doors: ResolvedDoor[];
  above?: THREE.Object3D;
  /** The authored row's height IN WORLD UNITS — the same unit the assembly's
   * own `boundsMeters[1]` is measured in. */
  aboveRestHeight: number;
  /** The same row's height in its PARENT's frame, which is the frame
   * `position.y` is expressed in and therefore the distance between rows. */
  aboveLocalRowHeight: number;
  aboveRestScaleY: number;
  /** The row's authored `position.y`, restored on every layout rather than
   * compounded onto the last one. */
  aboveRestY: number;
}

interface MissingRoleNode {
  role: WorldAssetRole;
  node: string;
}

const OPEN_ANGLE = Math.PI / 2;

/** Bounding box of a node's geometry expressed in its parent's frame. */
function parentFrameBounds(node: THREE.Object3D): THREE.Box3 {
  const parent = node.parent;
  if (!parent) return new THREE.Box3().setFromObject(node);
  parent.updateWorldMatrix(true, false);
  const toParent = parent.matrixWorld.clone().invert();
  const world = new THREE.Box3().setFromObject(node);
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const x of [world.min.x, world.max.x]) {
    for (const y of [world.min.y, world.max.y]) {
      for (const z of [world.min.z, world.max.z]) {
        box.expandByPoint(corner.set(x, y, z).applyMatrix4(toParent));
      }
    }
  }
  return box;
}

/**
 * Derive a leaf's hinge axis from its own hierarchy: the panel's thinnest
 * dimension is its normal, and the hinge is the remaining principal axis the
 * pivot does not sit on as a boundary — or the longer one when the pivot sits
 * at a corner (an upright door's hinge edge meets the floor there). This is
 * what lets a horizontal-hinged asset (drawbridge) swing without a new role.
 */
function deriveHingeAxis(
  node: THREE.Object3D,
  parent: THREE.Object3D
): THREE.Vector3 {
  const box = parentFrameBounds(node);
  const size = box.getSize(new THREE.Vector3());
  parent.updateWorldMatrix(true, false);
  const pivot = node
    .getWorldPosition(new THREE.Vector3())
    .applyMatrix4(parent.matrixWorld.clone().invert());
  const dimensions = [size.x, size.y, size.z];
  const thin = dimensions.reduce(
    (best, value, index) => (value < dimensions[best]! ? index : best),
    0
  );
  const principal = [0, 1, 2].filter((axis) => axis !== thin);
  const epsilon = Math.max(1e-6, size.length() * 1e-4);
  const onBoundary = (axis: number) =>
    pivot.getComponent(axis) - box.min.getComponent(axis) <= epsilon ||
    box.max.getComponent(axis) - pivot.getComponent(axis) <= epsilon;
  const interior = principal.filter((axis) => !onBoundary(axis));
  const chosen =
    interior.length === 1
      ? interior[0]!
      : principal.reduce(
          (best, axis) =>
            dimensions[axis]! >= dimensions[best]! ? axis : best,
          principal[0]!
        );
  return new THREE.Vector3().setComponent(chosen, 1);
}

/**
 * Bind declared role names to the loaded hierarchy. Never falls back: a
 * declared node that is absent is reported by asset, role, and node.
 */
function resolveRoles(
  root: THREE.Object3D,
  roles: NonNullable<GeneratedWorldAsset['roles']>
): ResolvedRoles | MissingRoleNode {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const doors = new Map<
    string,
    { position: THREE.Vector3; leaves: ResolvedLeaf[] }
  >();
  let above: THREE.Object3D | undefined;
  for (const binding of roles) {
    const node = root.getObjectByName(binding.node);
    if (!node) return { role: binding.role, node: binding.node };
    if (binding.role === 'above') {
      above = node;
      continue;
    }
    if (binding.role === 'leaf' && binding.door) {
      const group = doors.get(binding.door) ?? {
        position: new THREE.Vector3(),
        leaves: [],
      };
      if (group.leaves.length === 0) {
        group.position.copy(
          node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot)
        );
      }
      group.leaves.push({ node, restQuaternion: node.quaternion.clone() });
      doors.set(binding.door, group);
    }
    // `frame` is static by contract: binding it only proves the node exists.
  }
  let aboveRestHeight = 0;
  let aboveLocalRowHeight = 0;
  let aboveRestScaleY = 1;
  let aboveRestY = 0;
  if (above) {
    const box = new THREE.Box3().setFromObject(above);
    aboveRestHeight = box.max.y - box.min.y;
    aboveRestScaleY = above.scale.y;
    aboveRestY = above.position.y;
    // `position.y` is in the PARENT's frame, so the gap between tiled rows is
    // the row's parent-frame height rather than its world one. A promoted
    // authored asset's root is unscaled, which makes the two equal; dividing
    // keeps a nested `above` honest anyway.
    const parentScaleY = above.parent
      ? above.parent.getWorldScale(new THREE.Vector3()).y
      : 1;
    aboveLocalRowHeight =
      parentScaleY === 0 ? 0 : aboveRestHeight / parentScaleY;
  }
  return {
    doors: [...doors.entries()].map(([id, group]) => ({
      id,
      position: group.position.toArray() as [number, number, number],
      leaves: group.leaves,
    })),
    above,
    aboveRestHeight,
    aboveLocalRowHeight,
    aboveRestScaleY,
    aboveRestY,
  };
}

/**
 * Swing every leaf of a group about its own derived hinge, restoring the
 * authored rest pose first so repeated renders are idempotent. Directions
 * alternate along the leaves' hinge spread, which is what a split pair needs;
 * the doorway binding owns whether a group is a door and which way it faces.
 */
function applyLeafSwing(leaves: ResolvedLeaf[], open: boolean) {
  const ordered = [...leaves].sort(
    (left, right) => left.node.position.x - right.node.position.x
  );
  const signs = new Map(
    ordered.map((leaf, index) => [leaf, index % 2 === 0 ? 1 : -1])
  );
  for (const leaf of leaves) {
    leaf.node.quaternion.copy(leaf.restQuaternion);
    if (!open) continue;
    const parent = leaf.node.parent;
    if (!parent) continue;
    parent.updateWorldMatrix(true, true);
    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
    const hingeInParent = deriveHingeAxis(leaf.node, parent);
    const localAxis = hingeInParent
      .clone()
      .applyQuaternion(parentQuaternion.invert())
      .normalize();
    leaf.node.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        localAxis,
        (signs.get(leaf) ?? 1) * OPEN_ANGLE
      )
    );
  }
}

function LoadedWorldAssetModel({
  assetRef,
  url,
  boundsMeters,
  roles,
  position,
  rotationY,
  onBoundsMeasured,
  onDiagnostic,
  onDoorsResolved,
  openDoors,
  heightScale,
}: {
  assetRef: string;
  url: string;
  boundsMeters: [number, number, number];
  roles: NonNullable<GeneratedWorldAsset['roles']> | undefined;
  position: [number, number, number];
  rotationY: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onDiagnostic?: (diagnostic: WorldAssetModelDiagnostic) => void;
  onDoorsResolved?: (doors: readonly WorldAssetDoor[]) => void;
  openDoors: readonly string[];
  heightScale: number;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const parts = useMemo(
    () => (roles && roles.length > 0 ? resolveRoles(cloned, roles) : undefined),
    [cloned, roles]
  );
  const missing = parts && 'node' in parts ? parts : undefined;
  const resolved = parts && !('node' in parts) ? parts : undefined;

  useEffect(() => {
    if (missing) {
      onDiagnostic?.({
        ref: assetRef,
        reason: 'missing-role-node',
        role: missing.role,
        node: missing.node,
      });
    }
  }, [assetRef, missing, onDiagnostic]);

  useEffect(() => {
    if (resolved) {
      onDoorsResolved?.(
        resolved.doors.map(({ id, position: pivot }) => ({
          id,
          position: pivot,
        }))
      );
    }
  }, [onDoorsResolved, resolved]);

  useLayoutEffect(() => {
    if (!resolved) return;
    for (const door of resolved.doors) {
      applyLeafSwing(door.leaves, openDoors.includes(door.id));
    }
  }, [openDoors, resolved]);

  /**
   * The authored `above` row, plus the clones that tile it upward. Row 0 IS
   * the authored node, so a door at its rest height grows no extra objects
   * and the rest pose stays the GLB's own.
   *
   * A door's extra height is the wall section over its opening, and the
   * authored asset supplies that section as ONE course of bricks — this
   * door's is 0.156 of a 3.006-unit body. Stretching one course to absorb a
   * wall's worth of height turns bricks into vertical streaks, which is
   * neither what the asset does when it is grown in the tool that authored it
   * nor what setting a door and a wall to the same height is asking for.
   * Repeating the course keeps every brick at its authored proportions.
   *
   * The clones are built DETACHED here and attached by the layout effect
   * below, because ATTACHING THEM HERE IS THE BUG. This factory runs during
   * render, and React discards render passes; a discarded pass's clones stay
   * in the scene graph while the effect lays out the retained pass's array,
   * so the live clones keep the `visible = false` they were built with. The
   * result measured in the running app was a bounding box that grew to the
   * right height above a door that never moved — only the authored course,
   * the one object no pass ever detaches, was ever shown. Scene-graph
   * mutation belongs in the commit phase, which is where the layout effect
   * is, so that is where the attach now happens.
   */
  const aboveTiles = useMemo(() => {
    if (!resolved?.above) return undefined;
    const above = resolved.above;
    const parent = above.parent;
    const tiles = [above];
    if (!parent) return tiles;
    const rowWorld = resolved.aboveRestHeight * SYNTY_SCALE;
    if (!(rowWorld > 0) || !(boundsMeters[1] > 0)) return tiles;
    const openingWorld = Math.max(0, boundsMeters[1] - rowWorld);
    const most = Math.min(
      MAX_ABOVE_ROWS,
      Math.max(
        1,
        Math.ceil(
          (boundsMeters[1] * MAX_HEIGHT_SCALE - openingWorld) / rowWorld
        )
      )
    );
    for (let index = 1; index < most; index += 1) {
      const tile = above.clone(true);
      tile.visible = false;
      tiles.push(tile);
    }
    return tiles;
  }, [boundsMeters, resolved]);

  /**
   * Grow the `above` section until the assembly reaches its authored height
   * times `heightScale` — the same rule `PropModel` applies to a wall, and
   * the reason a door and a wall set to one number end at one height instead
   * of at two unrelated ones. The two are authored to match at rest (2.255
   * against 2.259 world units).
   *
   * The opening never grows: everything past it is `above`. Rows are rounded
   * to the nearest whole course and the small residual is shared by all of
   * them, so the stack lands on the exact target while each course keeps its
   * authored thickness to within half a course.
   *
   * Below the point where `above` would vanish the assembly stops shrinking,
   * because a door cannot be shorter than the opening it is a door for.
   */
  useLayoutEffect(() => {
    if (!resolved?.above || !aboveTiles) return;
    const above = resolved.above;
    const parent = above.parent;
    if (!parent) return;
    // Commit-phase attach: see the note on `aboveTiles`. Idempotent, so a
    // re-run re-uses the clones already in the tree rather than stacking
    // another set.
    for (const tile of aboveTiles) {
      if (tile !== above && tile.parent !== parent) parent.add(tile);
    }
    const {
      aboveLocalRowHeight,
      aboveRestHeight,
      aboveRestScaleY,
      aboveRestY,
    } = resolved;
    const rowWorld = aboveRestHeight * SYNTY_SCALE;
    if (!(rowWorld > 0)) return;
    const openingWorld = Math.max(0, boundsMeters[1] - rowWorld);
    const targetWorld = Math.max(openingWorld, boundsMeters[1] * heightScale);
    const aboveWorld = Math.max(0, targetWorld - openingWorld);
    const rows =
      aboveWorld > 0 ? Math.max(1, Math.round(aboveWorld / rowWorld)) : 0;
    const residual = rows > 0 ? aboveWorld / (rows * rowWorld) : 1;
    for (let index = 0; index < aboveTiles.length; index += 1) {
      const tile = aboveTiles[index]!;
      const shown = index < rows;
      tile.visible = shown;
      if (!shown) continue;
      tile.scale.y = aboveRestScaleY * residual;
      tile.position.y = aboveRestY + index * aboveLocalRowHeight * residual;
    }
  }, [aboveTiles, boundsMeters, heightScale, resolved]);

  const measuredBounds = useMemo<PropModelBounds>(() => {
    if (resolved?.above) {
      // The assembly's own height scales, and the opening is the floor: a
      // door cannot report less than the doorway it is a door for.
      const rowWorld = resolved.aboveRestHeight * SYNTY_SCALE;
      const openingWorld = Math.max(0, boundsMeters[1] - rowWorld);
      const totalHeight = Math.max(openingWorld, boundsMeters[1] * heightScale);
      return {
        minY: 0,
        maxY: totalHeight,
        width: boundsMeters[0],
        height: totalHeight,
        depth: boundsMeters[2],
      };
    }
    if (resolved) {
      // Roles without an `above` part do not grow: the group stays unscaled.
      return {
        minY: 0,
        maxY: boundsMeters[1],
        width: boundsMeters[0],
        height: boundsMeters[1],
        depth: boundsMeters[2],
      };
    }
    return {
      minY: 0,
      maxY: boundsMeters[1] * heightScale,
      width: boundsMeters[0],
      height: boundsMeters[1] * heightScale,
      depth: boundsMeters[2],
    };
  }, [boundsMeters, heightScale, resolved]);
  useEffect(
    () => onBoundsMeasured?.(measuredBounds),
    [measuredBounds, onBoundsMeasured]
  );

  if (missing) return null;

  return (
    <group
      name="world-asset-model"
      position={[position[0], position[1] + DUNGEON_SURFACE_Y, position[2]]}
      rotation={[0, rotationY, 0]}
      scale={[
        SYNTY_SCALE,
        SYNTY_SCALE * (resolved ? 1 : heightScale),
        SYNTY_SCALE,
      ]}
    >
      <primitive object={cloned as THREE.Object3D} />
    </group>
  );
}

/**
 * Generic renderer for provider-normalized world assets. The provider has
 * already baked scale correction, yaw, centering, and grounding into the GLB;
 * the consumer adds only authored position/yaw and the shared Synty scale.
 * Declared role names are bound per instance; no door node name appears here.
 */
export function WorldAssetModel({
  assetRef,
  position,
  rotationY = 0,
  onBoundsMeasured,
  onDiagnostic,
  heightScale = 1,
  openDoors = [],
  onDoorsResolved,
}: WorldAssetModelProps) {
  const safeHeightScale = Number.isFinite(heightScale)
    ? Math.min(MAX_HEIGHT_SCALE, Math.max(MIN_HEIGHT_SCALE, heightScale))
    : 1;
  const asset = resolveWorldAsset(assetRef, (diagnostic) =>
    onDiagnostic?.(diagnostic)
  );
  if (!asset) return null;
  return (
    <LoadedWorldAssetModel
      assetRef={assetRef}
      url={asset.url}
      boundsMeters={asset.boundsMeters}
      roles={asset.roles}
      position={position}
      rotationY={rotationY}
      onBoundsMeasured={onBoundsMeasured}
      onDiagnostic={onDiagnostic}
      onDoorsResolved={onDoorsResolved}
      openDoors={openDoors}
      heightScale={safeHeightScale}
    />
  );
}
