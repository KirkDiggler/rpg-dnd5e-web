import * as THREE from 'three';
import {
  planAssetHeight,
  type AssetHeightLayout,
  type AssetHeightProfile,
} from './assetHeightLayout';
import { SYNTY_SCALE } from './calibrationConstants';

/** Compatibility at the catalog boundary only; new catalogs carry this data.
 * Uses declared roles, never model-name or silhouette classification. */
export function legacyAssetHeightProfile(
  root: THREE.Object3D,
  roles: readonly { role: string; node: string }[] | undefined,
  nativeHeight: number
): AssetHeightProfile {
  if (!roles?.length) return { mode: 'scale' };
  const rows = roles.filter((role) => role.role === 'above');
  if (!rows.length) return { mode: 'fixed' };
  if (rows.length !== 1)
    throw Error('Height fitting requires one declared repeat part.');
  const matches: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === rows[0]!.node) matches.push(node);
  });
  if (matches.length !== 1)
    throw Error('Height fitting requires one loaded repeat part.');
  root.updateMatrixWorld(true);
  const rowHeight =
    new THREE.Box3()
      .setFromObject(matches[0]!, true)
      .getSize(new THREE.Vector3()).y * SYNTY_SCALE;
  return {
    mode: 'repeat-above',
    node: rows[0]!.node,
    baseHeight: nativeHeight - rowHeight,
    rowHeight,
  };
}

export interface AssetHeightInstanceInput {
  /** A fresh detached clone, never the cached or currently mounted hierarchy. */
  root: THREE.Object3D;
  nativeHeight: number;
  targetHeight: number;
  profile: AssetHeightProfile;
  protectedNodes?: readonly string[];
  ownedGeometry?: readonly THREE.BufferGeometry[];
}
export interface AssetHeightInstance {
  layout: AssetHeightLayout;
  owned: THREE.BufferGeometry[];
  /** Placement-local aliases for explicitly copied parts, never persisted. */
  nodeCopies: Map<string, string[]>;
}

export function assembleAssetHeightInstance(
  input: AssetHeightInstanceInput
): AssetHeightInstance {
  const { root, nativeHeight, targetHeight, profile } = input;
  if (root.parent)
    throw Error('Height assembly requires a fresh detached hierarchy.');
  const layout = planAssetHeight({ nativeHeight, targetHeight, profile });
  const result: AssetHeightInstance = {
    layout,
    owned: [],
    nodeCopies: new Map(),
  };
  if (profile.mode !== 'repeat-above') return result;
  root.updateMatrixWorld(true);
  const named: THREE.Object3D[] = [];
  const names = new Set<string>();
  root.traverse((node) => {
    names.add(node.name);
    if (node.name === profile.node) named.push(node);
  });
  if (named.length !== 1 || !named[0]!.parent)
    throw Error('Height profile requires one parented repeat part.');
  const above = named[0]!,
    parent = above.parent!;
  for (const name of input.protectedNodes ?? []) {
    if (above.getObjectByName(name))
      throw Error('Height repeat region includes a protected moving part.');
  }
  const whole = new THREE.Box3().setFromObject(root, true);
  const band = new THREE.Box3().setFromObject(above, true);
  const epsilon = 1e-6 * Math.max(1, nativeHeight);
  if (
    Math.abs((whole.max.y - whole.min.y) * SYNTY_SCALE - nativeHeight) >
      epsilon ||
    Math.abs((band.min.y - whole.min.y) * SYNTY_SCALE - profile.baseHeight) >
      epsilon ||
    Math.abs((band.max.y - band.min.y) * SYNTY_SCALE - profile.rowHeight) >
      epsilon
  )
    throw Error(
      'Loaded repeat geometry disagrees with the declared height profile.'
    );
  const up = new THREE.Vector3(0, 1, 0).transformDirection(parent.matrixWorld);
  const ownUp = new THREE.Vector3(0, 1, 0).transformDirection(
    above.matrixWorld
  );
  if (
    up.distanceTo(new THREE.Vector3(0, 1, 0)) > 1e-6 ||
    ownUp.distanceTo(up) > 1e-6
  )
    throw Error(
      'Height repeat parts must preserve the authored vertical axis.'
    );
  const parentScale = parent.getWorldScale(new THREE.Vector3()).y;
  if (!(parentScale > 0))
    throw Error('Height repeat parent has invalid vertical scale.');
  const bottom = new THREE.Vector3(0, band.min.y, 0).applyMatrix4(
    parent.matrixWorld.clone().invert()
  ).y;
  const restY = above.position.y,
    restScale = above.scale.y;
  let serial = 0;
  const own = (part: THREE.Object3D, reuse: boolean) =>
    part.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (
        (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
        mesh.geometry.morphAttributes.position?.length
      )
        throw Error('Height repeat parts must be static geometry.');
      if (reuse && input.ownedGeometry?.includes(mesh.geometry)) return;
      mesh.geometry = mesh.geometry.clone();
      result.owned.push(mesh.geometry);
    });
  try {
    own(above, true);
    above.visible = layout.rows.length > 0;
    for (let index = 0; index < layout.rows.length; index++) {
      const part = index === 0 ? above : above.clone(true);
      if (index > 0) {
        part.traverse((node) => {
          const original = node.name;
          let alias: string;
          do {
            alias = `__height_${index}_${serial++}`;
          } while (names.has(alias));
          names.add(alias);
          node.name = alias;
          if (original) {
            const copies = result.nodeCopies.get(original) ?? [];
            copies.push(alias);
            result.nodeCopies.set(original, copies);
          }
        });
        own(part, false);
        parent.add(part);
      }
      const row = layout.rows[index]!;
      part.visible = true;
      part.scale.y = restScale * row.scaleY;
      part.position.y =
        restY +
        row.offsetY / (SYNTY_SCALE * parentScale) +
        (restY - bottom) * (row.scaleY - 1);
    }
    root.updateMatrixWorld(true);
    return result;
  } catch (error) {
    result.owned.forEach((geometry) => geometry.dispose());
    throw error;
  }
}

/** Reuse the same explicit binding for each derived part. New identities exist
 * only inside this instance; saved material choices still name source slots. */
export function expandPartBindings<T extends { id: string; node: string }>(
  bindings: readonly T[],
  nodeCopies: ReadonlyMap<string, readonly string[]>
): { bindings: T[]; ids: Map<string, string[]> } {
  const expanded: T[] = [],
    ids = new Map<string, string[]>();
  const used = new Set(bindings.map((binding) => binding.id));
  let serial = 0;
  for (const binding of bindings) {
    expanded.push(binding);
    const copies: string[] = [];
    for (const node of nodeCopies.get(binding.node) ?? []) {
      let id: string;
      do {
        id = `__height_surface_${serial++}`;
      } while (used.has(id));
      used.add(id);
      copies.push(id);
      expanded.push({ ...binding, id, node });
    }
    ids.set(binding.id, copies);
  }
  return { bindings: expanded, ids };
}
export function expandPartSelections<T extends { surfaceId: string }>(
  selections: readonly T[],
  ids: ReadonlyMap<string, readonly string[]>
): T[] {
  return selections.flatMap((selection) => [
    selection,
    ...(ids.get(selection.surfaceId) ?? []).map((surfaceId) => ({
      ...selection,
      surfaceId,
    })),
  ]);
}
