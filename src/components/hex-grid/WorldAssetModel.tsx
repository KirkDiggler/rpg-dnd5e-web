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
  aboveRestHeight: number;
  aboveRestScaleY: number;
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
  let aboveRestScaleY = 1;
  if (above) {
    const box = new THREE.Box3().setFromObject(above);
    aboveRestHeight = box.max.y - box.min.y;
    aboveRestScaleY = above.scale.y;
  }
  return {
    doors: [...doors.entries()].map(([id, group]) => ({
      id,
      position: group.position.toArray() as [number, number, number],
      leaves: group.leaves,
    })),
    above,
    aboveRestHeight,
    aboveRestScaleY,
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

  useLayoutEffect(() => {
    if (!resolved?.above) return;
    resolved.above.scale.y = resolved.aboveRestScaleY * heightScale;
  }, [heightScale, resolved]);

  const measuredBounds = useMemo<PropModelBounds>(() => {
    if (resolved?.above) {
      const totalHeight =
        boundsMeters[1] +
        resolved.aboveRestHeight * SYNTY_SCALE * (heightScale - 1);
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
    ? Math.min(4, Math.max(0.25, heightScale))
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
