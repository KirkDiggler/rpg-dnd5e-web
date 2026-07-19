/**
 * ClassCharacterModel — renders a class-named Synty GLB for a player entity
 * (rpg-dnd5e-web#501). Sibling alternative to MediumHumanoid inside
 * HexEntity's existing position/rotation wrapper — HexEntity decides which
 * of the two to mount per entity (resolveClassCharacterModelUrl's
 * undefined-for-unmapped return is the fallback signal), not this
 * component; this one only knows how to render a GIVEN GLB url.
 *
 * Selection/ghost treatment is a simple material tint (emissive glow /
 * opacity), not MediumHumanoid's cel-shaded outline shader
 * (AdvancedCharacterShader/OutlineShader) — those are built for the OBJ
 * marker-color pipeline these Synty GLBs don't use. Matching that shader
 * exactly is future visual-polish scope, not this slice's ask (render the
 * class model, honestly, with the same interaction affordances).
 *
 * Cloning: every class GLB is a skinned/rigged mesh (a THREE.SkinnedMesh
 * driven by a THREE.Skeleton of bones). Plain `Object3D.clone()` does NOT
 * correctly re-parent a SkinnedMesh's skeleton onto the cloned bone
 * hierarchy — it's a well-known Three.js gotcha, and it is NOT limited to
 * animated rendering: a SkinnedMesh's vertex positions are always computed
 * via GPU skinning against its skeleton, even for an unanimated bind pose,
 * so a broken clone can fail to render at all rather than just glitching
 * once something moves the bones (rpg-dnd5e-web#510 — confirmed live on
 * the real game screen: correct classRefId/position/isGhost, the GLB
 * fetched 200 OK, nothing rendered; swapping to `SkeletonUtils.clone()`
 * below fixed it immediately). `SkeletonUtils.clone()` clones bones and
 * skeletons correctly and is the standard fix — use it here instead of a
 * plain `.clone()`, even before any animation exists (#509) or plays.
 */

import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export interface ClassCharacterModelProps {
  url: string;
  isSelected?: boolean;
  isGhost?: boolean;
  /** Matches MediumHumanoid's facingRotation convention — players face the
   * camera (PI), monsters/other uses face forward (0). */
  facingRotation?: number;
}

export function ClassCharacterModel({
  url,
  isSelected = false,
  isGhost = false,
  facingRotation = 0,
}: ClassCharacterModelProps) {
  // useGLTF returns drei's shared, URL-keyed cache — mutating it directly
  // during render is a render-phase side effect on shared state (same
  // rule SyntyHexFloor.tsx/SyntyHexWall.tsx already follow for this exact
  // reason). Clone per-instance and tint the clone's materials instead.
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const clone = cloneSkeleton(scene);
    if (isSelected || isGhost) {
      clone.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const wasArray = Array.isArray(child.material);
        const materials = wasArray
          ? (child.material as THREE.Material[])
          : [child.material as THREE.Material];
        const tinted = materials.map((mat) => {
          const cloned = mat.clone();
          // emissive/emissiveIntensity are Standard/Physical-material-only;
          // transparent/opacity are on the THREE.Material base and safe for
          // any material type a GLB might legally use.
          if (isSelected && cloned instanceof THREE.MeshStandardMaterial) {
            cloned.emissive = new THREE.Color('#ffffff');
            cloned.emissiveIntensity = 0.25;
          }
          if (isGhost) {
            cloned.transparent = true;
            cloned.opacity = 0.35;
          }
          return cloned;
        });
        child.material = wasArray ? tinted : tinted[0]!;
      });
    }
    return clone;
  }, [scene, isSelected, isGhost]);

  return (
    <primitive
      object={cloned}
      scale={SYNTY_SCALE}
      rotation={[0, facingRotation, 0]}
    />
  );
}
