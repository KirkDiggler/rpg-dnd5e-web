/**
 * GlbInstance — shared GLB-instancing primitive, extracted from
 * SyntyHexWall.tsx (dungeon-walls redesign, rpg-project#133 design.md/
 * plan.md's W3 slice) so WallRunMesh.tsx's real Synty pieces (segment/
 * corner tiling) share the exact same load/clone/tint/dispose logic
 * instead of a second, easy-to-drift copy of GPU-leak-prone code.
 *
 * Non-uniform scale is baked into a per-instance CLONED geometry, not
 * applied as the Object3D's own `.scale` (W3 finding, live-verified
 * against the real reference-tomb dungeon): every wall/fitting/door-frame
 * piece this codebase places uses a markedly non-uniform per-axis scale
 * (`wallVariantScale`/`fittingScale`/`DOOR_FRAME_SCALE` all squeeze one
 * axis to fit a hex edge while holding height/thickness at a different
 * ratio). Setting THREE.Object3D.scale to a non-uniform vector relies on
 * the renderer's runtime inverse-transpose normal matrix to keep lighting
 * correct — for this pack's wall/fitting GLBs specifically, that left
 * every such piece rendering as a flat, almost fully black silhouette
 * under the game's actual (non-crypt) default lighting (0.6 ambient / 0.8
 * directional): valid textured MeshStandardMaterial, valid geometry,
 * correctly positioned, but visually unreadable. A/B'd live: switching the
 * SAME instance to a uniform scale immediately restored correct stone/
 * brick shading. Baking the scale into the geometry itself (vertex
 * positions transformed once, normals recomputed from the transformed
 * geometry via `computeVertexNormals`) sidesteps the runtime normal-matrix
 * path entirely and fixes this for every non-uniform-scale caller through
 * this one shared component — not just WallRunMesh's new tiled runs, but
 * SyntyHexWall's existing wall/fitting/door-frame pieces too, which were
 * silently exposed to the same defect (likely masked in crypt by its
 * separately-tinted, deliberately-dark mood lighting, where a too-dark
 * wall reads as "moody" rather than "broken").
 */

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { WorldPos } from './hexMath';

export const ENV_BASE = '/models/synty/env/';

export interface GlbInstanceProps {
  file: string;
  position: WorldPos;
  rotationY: number;
  scale: [number, number, number] | number;
  /** Multiplicative color tint for this instance only — clones each
   * mesh's material before tinting it, so the shared useGLTF cache (and
   * every OTHER instance of the same GLB) is never mutated. Undefined
   * (every existing caller) renders the GLB's original material,
   * unchanged. */
  tint?: THREE.Color;
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
  // before) or bake a non-uniform scale into a per-instance CLONED
  // geometry with recomputed normals (see this file's own doc comment for
  // why — a non-uniform Object3D.scale left these pieces rendering
  // almost-black under this game's real lighting). Object3D.clone(true)
  // does NOT deep-clone geometry/material (shared references into
  // useGLTF's URL-keyed cache) — geometry.clone() below is what makes
  // baking safe per-instance without mutating that shared cache.
  const cloned = useMemo(() => {
    const obj = scene.clone(true);
    if (isUniform) {
      obj.scale.setScalar(sx);
      return obj;
    }
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry.clone();
        geometry.scale(sx, sy, sz);
        geometry.computeVertexNormals();
        child.geometry = geometry;
      }
    });
    obj.scale.setScalar(1);
    return obj;
  }, [scene, isUniform, sx, sy, sz]);

  // Dispose the per-instance BAKED geometries (never the shared cache's
  // originals — only geometry.clone()'d copies created above ever get
  // assigned onto `cloned`'s meshes) when this instance's baked geometry
  // is replaced or unmounted. Mirrors the tint effect's cleanup discipline
  // below: dispose exactly what THIS run created, nothing shared.
  useEffect(() => {
    if (isUniform) return undefined;
    return () => {
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
    };
  }, [cloned, isUniform]);

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
  useEffect(() => {
    if (!tint) {
      originalMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      return () => {};
    }
    const created: THREE.Material[] = [];
    originalMaterials.forEach((mat, mesh) => {
      const wasArray = Array.isArray(mat);
      const materials = wasArray ? mat : [mat];
      const tinted = materials.map((m) => {
        const tintedMat = m.clone();
        created.push(tintedMat);
        if ('color' in tintedMat && tintedMat.color instanceof THREE.Color) {
          tintedMat.color = tintedMat.color.clone().multiply(tint);
        }
        return tintedMat;
      });
      mesh.material = wasArray ? tinted : tinted[0]!;
    });
    return () => {
      created.forEach((mat) => mat.dispose());
    };
  }, [originalMaterials, tint]);

  return (
    <primitive
      object={cloned}
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
    />
  );
}
