/**
 * GlbInstance — shared GLB-instancing primitive, extracted from
 * SyntyHexWall.tsx (dungeon-walls redesign, rpg-project#133 design.md/
 * plan.md's W3 slice) so WallRunMesh.tsx's real Synty pieces (segment/
 * corner tiling) share the exact same load/clone/tint/dispose logic
 * instead of a second, easy-to-drift copy of GPU-leak-prone code.
 *
 * Non-uniform scale is baked into a per-(file, scale) CACHED geometry, not
 * applied as the Object3D's own `.scale` (W3 finding, live-verified
 * against the real reference-tomb dungeon): every wall/fitting/door-frame
 * piece this codebase places uses a markedly non-uniform per-axis scale
 * (`wallVariantScale`/`fittingScale`/`DOOR_FRAME_SCALE` all squeeze one
 * axis to fit a hex edge while holding height/thickness at a different
 * ratio). Placing these pieces with that scale on the Object3D itself
 * (the runtime normal matrix, recomputed by the renderer every frame from
 * the live model-view matrix) left every such piece rendering as a flat,
 * almost fully black silhouette under the game's actual (non-crypt)
 * default lighting (0.6 ambient / 0.8 directional): valid textured
 * MeshStandardMaterial, valid geometry, correctly positioned, but
 * visually unreadable. A/B'd live: switching the SAME instance to a
 * uniform scale immediately restored correct stone/brick shading. Baking
 * the scale into the geometry itself ONCE, ahead of time (see
 * `bakedGeometriesFor`'s own doc comment for exactly how normals are
 * transformed) sidesteps the runtime path entirely and fixes this for
 * every non-uniform-scale caller through this one shared component — not
 * just WallRunMesh's new tiled runs, but SyntyHexWall's existing wall/
 * fitting/door-frame pieces too, which were silently exposed to the same
 * defect (likely masked in crypt by its separately-tinted, deliberately-
 * dark mood lighting, where a too-dark wall reads as "moody" rather than
 * "broken").
 */

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { WorldPos } from './hexMath';
import { cloneCryptMaterials } from './sceneKnowledge';

export const ENV_BASE = '/models/synty/env/';

/**
 * Non-uniform-scale baked geometries, shared across every instance that
 * places the same file at the same scale — module-level, matching
 * useGLTF's own shared-cache convention (never disposed; a fixed, small
 * set of (file, scale) combinations lives for the app's lifetime, the
 * same way useGLTF's cached scenes/materials do). Many tiled wall-run
 * pieces within a single run place the exact same file at the exact same
 * scale (tileWallSegment computes one `pieceWidth` per run, shared by
 * every tile in it), so without this cache every one of those tiles would
 * redundantly clone + recompute normals for what is, byte-for-byte, the
 * same baked result.
 */
const bakedGeometryCache = new Map<string, THREE.BufferGeometry[]>();

/**
 * Baked (scaled, exact-normal-transformed) geometries for `file` at
 * `(sx, sy, sz)`, one per mesh in `scene`'s own traversal order — cached
 * by that exact key. Callers assign these onto a FRESH `scene.clone(true)`'s
 * own meshes (same traversal order, since clone(true) preserves structure
 * exactly), never mutate them in place.
 *
 * Review finding (walls-r, PR #608): the original version of this
 * function called `computeVertexNormals()` after `geometry.scale(...)`,
 * discarding the pack's AUTHORED normals in favor of ones recomputed from
 * the (now-scaled) triangle faces — a real risk of flattening intentional
 * smoothing groups, and a fair question about whether the black-wall fix
 * this file's own doc comment describes was masking the problem rather
 * than fixing it at the root. Checked against three.js's own source
 * (`BufferGeometry.applyMatrix4`, which `.scale()` calls internally):
 * when a `normal` attribute already exists, `.scale()` transforms it by
 * the matrix's own normal matrix (`Matrix3.getNormalMatrix` — exactly the
 * inverse-transpose walls-r described) and renormalizes
 * (`Vector3.applyNormalMatrix` calls `.normalize()`) — this is ALREADY
 * the mathematically exact bake, done automatically, using the pack's
 * real authored normals. `computeVertexNormals()` was pure redundant
 * (worse: destructive) work sitting on top of an already-correct result.
 * Removed; `computeVertexNormals()` now runs ONLY as a fallback for the
 * (unlikely, but not asserted-impossible) case of a mesh with no
 * authored normal attribute at all, where `.scale()` has nothing to
 * transform. Live-reverified against the real reference-tomb dungeon
 * after this change: the wall pieces still render with correct stone/
 * brick shading — the exact-normal path fixes the defect too, not just
 * the recompute path.
 */
function bakedGeometriesFor(
  scene: THREE.Object3D,
  file: string,
  sx: number,
  sy: number,
  sz: number
): THREE.BufferGeometry[] {
  const key = `${file}|${sx}|${sy}|${sz}`;
  const cached = bakedGeometryCache.get(key);
  if (cached) return cached;
  const baked: THREE.BufferGeometry[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry.clone();
      const hadAuthoredNormals = !!geometry.attributes.normal;
      geometry.scale(sx, sy, sz);
      if (!hadAuthoredNormals) {
        geometry.computeVertexNormals();
      }
      baked.push(geometry);
    }
  });
  bakedGeometryCache.set(key, baked);
  return baked;
}

export interface GlbInstanceProps {
  file: string;
  position: WorldPos;
  rotationY: number;
  scale: [number, number, number] | number;
  /** Multiplicative color tint for this instance only — clones each
   * mesh's material before tinting it, so the shared useGLTF cache (and
   * every OTHER instance of the same GLB) is never mutated. Undefined
   * (every existing caller) renders the GLB's original material,
   * unchanged. Ignored when `remembered` is true (see that prop's doc). */
  tint?: THREE.Color;
  /** Fog-of-war memory state (rpg-dnd5e-web#601/#602 scene-knowledge
   * contract): true renders this instance with the crypt-memory look
   * (`sceneKnowledge.cloneCryptMaterials` — desaturated color + faint
   * emissive) instead of `tint`, and takes precedence over it — a
   * remembered piece reads as "out of current sight, seen before" even
   * if it would otherwise carry a theme tint. Default false (every caller
   * before this prop existed) renders exactly as before. */
  remembered?: boolean;
}

/** Renders one instance of a GLB. useGLTF caches the loaded scene by URL,
 * so repeated placements of the same file must each clone the cached
 * Object3D — reusing the same instance across multiple `<primitive>`s
 * would just reparent it to the last placement (SyntyRoomDemo.tsx). */
export function GlbInstance({
  file,
  position,
  rotationY,
  scale,
  tint,
  remembered = false,
}: GlbInstanceProps) {
  const { scene } = useGLTF(ENV_BASE + file);

  // Normalize to per-axis numbers up front so useMemo below can depend on
  // plain numbers (stable across renders) rather than the `scale` prop's
  // array identity, which callers rarely memoize (a fresh `[a, b, c]`
  // literal every render is the norm here, e.g. WallRunMesh's per-tile
  // scale).
  const [sx, sy, sz] = Array.isArray(scale) ? scale : [scale, scale, scale];
  const isUniform = sx === sy && sy === sz;

  // Clone the Object3D hierarchy, then either apply a uniform Object3D
  // scale (the common case: characters/props/doors, cheap, unchanged from
  // before) or assign this (file, scale)'s CACHED baked geometries onto
  // the fresh clone's own meshes (see this file's own doc comment for why
  // baking beats a non-uniform Object3D.scale, and bakedGeometriesFor's
  // doc comment for why this is cached rather than cloned per instance).
  // Object3D.clone(true) does NOT deep-clone geometry/material (shared
  // references into useGLTF's URL-keyed cache) — assigning the cache's
  // baked geometries here is what makes sharing safe without mutating
  // that shared cache.
  const cloned = useMemo(() => {
    const obj = scene.clone(true);
    if (isUniform) {
      obj.scale.setScalar(sx);
      return obj;
    }
    const baked = bakedGeometriesFor(scene, file, sx, sy, sz);
    let i = 0;
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = baked[i]!;
        i += 1;
      }
    });
    obj.scale.setScalar(1);
    return obj;
  }, [scene, isUniform, sx, sy, sz, file]);

  // Snapshot each mesh's original (untinted) material once per `cloned`
  // identity, so the tint effect below always starts from a clean base —
  // matches ClassCharacterModel.tsx's identical pattern for the same
  // reason (never compound a tint onto a previously-tinted clone).
  const originalMaterials = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) map.set(child, child.material);
    });
    return map;
  }, [cloned]);

  // Copilot review (PR #566): cloned tint materials were never disposed —
  // a GPU-memory leak, since `<primitive>` objects aren't auto-disposed by
  // react-three-fiber (PropModel.tsx's own doc comment). Tinting now lives
  // in an effect (not the useMemo above) specifically so its cleanup can
  // dispose exactly the materials THIS run created — never the shared
  // `originalMaterials`, which are the same instances every other on-screen
  // copy of this GLB (via useGLTF's cache) still uses.
  //
  // `remembered` (rpg-dnd5e-web#601/#602) takes precedence over `tint`
  // entirely — `cloneCryptMaterials` replaces the normal tint-multiply
  // rather than composing with it, so a remembered piece always reads as
  // "seen before, not currently in sight" regardless of what theme tint
  // it would otherwise carry. Cleanup restores `originalMaterials` onto
  // the mesh BEFORE disposing the created ones (not just disposing) so a
  // prop change (remembered/tint flips as game state changes) never
  // leaves a mesh referencing an already-disposed material mid-transition.
  useEffect(() => {
    if (!tint && !remembered) {
      originalMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      return () => {};
    }
    const created: THREE.Material[] = [];
    originalMaterials.forEach((mat, mesh) => {
      const wasArray = Array.isArray(mat);
      const replacements = remembered
        ? cloneCryptMaterials(mat)
        : (Array.isArray(mat) ? mat : [mat]).map((m) => {
            const tintedMat = m.clone();
            if (
              'color' in tintedMat &&
              tintedMat.color instanceof THREE.Color
            ) {
              tintedMat.color = tintedMat.color.clone().multiply(tint!);
            }
            return tintedMat;
          });
      const replacementArray = Array.isArray(replacements)
        ? replacements
        : [replacements];
      created.push(...replacementArray);
      mesh.material = wasArray ? replacementArray : replacementArray[0]!;
    });
    return () => {
      originalMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      created.forEach((mat) => mat.dispose());
    };
  }, [originalMaterials, remembered, tint]);

  return (
    <primitive
      object={cloned}
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
    />
  );
}
