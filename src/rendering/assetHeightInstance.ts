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
  const caps = roles.filter((role) => role.role === 'cap');
  if (caps.length > 1) throw Error('Height fitting permits one fixed top cap.');
  const cap = caps[0] ? root.getObjectByName(caps[0].node) : undefined;
  if (caps.length && !cap)
    throw Error('Height fitting requires its declared cap.');
  const capHeight = cap
    ? new THREE.Box3().setFromObject(cap, true).getSize(new THREE.Vector3()).y *
      SYNTY_SCALE
    : 0;
  return {
    mode: 'repeat-above',
    node: rows[0]!.node,
    baseHeight: nativeHeight - rowHeight - capHeight,
    rowHeight,
    ...(cap ? { capNode: caps[0]!.node, capHeight } : {}),
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
  let cap: THREE.Object3D | undefined;
  if (profile.capNode) {
    const matches: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.name === profile.capNode) matches.push(node);
    });
    if (matches.length !== 1 || !matches[0]!.parent)
      throw Error('Height profile requires one parented cap.');
    cap = matches[0]!;
    if (above.getObjectById(cap.id) || cap.getObjectById(above.id))
      throw Error('Cap and repeat part cannot contain each other.');
    if ((input.protectedNodes ?? []).some((name) => cap!.getObjectByName(name)))
      throw Error('Height cap includes a protected moving part.');
    const bounds = new THREE.Box3().setFromObject(cap, true);
    if (
      Math.abs(
        (bounds.max.y - bounds.min.y) * SYNTY_SCALE - profile.capHeight!
      ) > epsilon ||
      Math.abs((bounds.min.y - band.max.y) * SYNTY_SCALE) > epsilon ||
      Math.abs((bounds.max.y - whole.max.y) * SYNTY_SCALE) > epsilon
    )
      throw Error(
        'Loaded cap geometry disagrees with the declared height profile.'
      );
  }
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
    if (cap) {
      const parentUp = new THREE.Vector3(0, 1, 0).transformDirection(
        cap.parent!.matrixWorld
      );
      const scale = cap.parent!.getWorldScale(new THREE.Vector3()).y;
      if (
        parentUp.distanceTo(new THREE.Vector3(0, 1, 0)) > 1e-6 ||
        !(scale > 0)
      )
        throw Error('Height cap parent must preserve the vertical axis.');
      own(cap, true);
      cap.position.y += layout.capOffsetY! / (SYNTY_SCALE * scale);
    }
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
