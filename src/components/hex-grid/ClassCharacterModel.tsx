/**
 * ClassCharacterModel — renders a class-named Synty GLB for a player entity
 * (rpg-dnd5e-web#501), animated on loop with its baked idle clip
 * (rpg-dnd5e-web#506). Sibling alternative to MediumHumanoid inside
 * HexEntity's existing position/rotation wrapper — HexEntity decides which
 * of the two to mount per entity (resolveClassCharacterModelUrl's
 * undefined-for-unmapped return is the fallback signal), not this
 * component; this one only knows how to render+animate a GIVEN GLB url.
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
 * fetched 200 OK, nothing rendered). `SkeletonUtils.clone()` fixed this
 * and shipped separately via #517; this file wires up the animation
 * playback on top of that already-landed fix, not the clone itself.
 * Current asset reality (re-verified against assets#4-#10, then again
 * post rpg-game-assets#11): fighter/barbarian.glb ship 0 baked clips
 * (junk stripped; Big-Rig retarget pending) — `resolveIdleClipName`
 * returning undefined for a clip-less model is a normal, expected case,
 * not an error; the animation effects below and the frameloop-invalidate
 * heartbeat all no-op cleanly for it. monk/rogue.glb now ship 3 idle
 * clips each (rpg-game-assets#11, closing rpg-dnd5e-web#522) and play
 * one on loop. Downed variants ship with no animation data at all —
 * `SkeletonUtils.clone()` still works for a static mesh, so one clone
 * path covers both cases.
 *
 * `isMoving` (rpg-dnd5e-web#542): HexEntity computes this from whether it's
 * currently stepping the entity's rendered position through a real
 * `EntityMoved.actualPath` (see `useHexMovePath.ts`) and passes it straight
 * through. When true, `resolveWalkClipName` is preferred over
 * `resolveIdleClipName` (falling back to idle if this model has no
 * `Walk_*` clip yet — the same clip-less-model degrade-gracefully rule as
 * everything else in this file). All 4 class GLBs ship a `Walk_Forward`
 * clip as of rpg-game-assets#20.
 */

import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  resolveIdleClipName,
  resolveWalkClipName,
} from './classCharacterModels';

export interface ClassCharacterModelProps {
  url: string;
  isSelected?: boolean;
  isGhost?: boolean;
  /** Matches MediumHumanoid's facingRotation convention — players face the
   * camera (PI), monsters/other uses face forward (0). */
  facingRotation?: number;
  /** True while HexEntity is stepping this entity's rendered position
   * through a real move (rpg-dnd5e-web#542) — plays the resolved walk clip
   * instead of idle. Defaults false (idle), matching every pre-#542 caller
   * unchanged. */
  isMoving?: boolean;
}

export function ClassCharacterModel({
  url,
  isSelected = false,
  isGhost = false,
  facingRotation = 0,
  isMoving = false,
}: ClassCharacterModelProps) {
  // useGLTF returns drei's shared, URL-keyed cache — mutating it directly
  // during render is a render-phase side effect on shared state (same
  // rule SyntyHexFloor.tsx/SyntyHexWall.tsx already follow for this exact
  // reason). Clone per-instance and tint/animate the clone instead.
  const { scene, animations } = useGLTF(url);

  // Cloned ONCE per scene load (keyed only on `scene`, not on
  // isSelected/isGhost) — this object's identity must stay stable across
  // selection/ghost toggles. drei's useAnimations lazily caches each clip
  // Action bound to whatever root object was current the first time it's
  // read; if this clone were recreated on every tint change (as #502's
  // single combined useMemo did), the mixer would keep animating a stale,
  // now-invisible clone while the rendered <primitive> pointed at a new
  // one — the model would silently stop animating the moment a player was
  // first selected. Tinting is applied as a separate effect below instead
  // of folding into this clone step.
  const cloned = useMemo(() => cloneSkeleton(scene), [scene]);

  // Snapshot each mesh's original (untinted) material once per `cloned`
  // identity, so the tint effect below always starts from a clean base —
  // never compounds a tint onto a previously-tinted clone (which would
  // happen if we cloned-and-tinted the current material on every toggle).
  const originalMaterials = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) map.set(child, child.material);
    });
    return map;
  }, [cloned]);

  useEffect(() => {
    if (!isSelected && !isGhost) {
      originalMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      // Nothing tinted this run — no-op cleanup, matching the branch below.
      return () => {};
    }
    // Track every clone THIS run creates so the cleanup below can dispose
    // exactly those (never the shared `originalMaterials`, which are the
    // same instances the cached GLTF scene's other live instances use —
    // disposing those would break every other on-screen copy of this
    // class model). React runs this cleanup both before the next run of
    // this effect (toggle-to-toggle, or toggle-to-restore above) and on
    // unmount, so one cleanup covers "stop being tinted", "re-tint with a
    // different flag", and "entity disappears while highlighted" without
    // three separate disposal call sites (Copilot review on #509 flagged
    // all three as GPU-resource leaks — cloned materials were never
    // disposed in any of them).
    const created: THREE.Material[] = [];
    originalMaterials.forEach((mat, mesh) => {
      const wasArray = Array.isArray(mat);
      const materials = wasArray ? mat : [mat];
      const tinted = materials.map((m) => {
        const tintedMat = m.clone();
        created.push(tintedMat);
        // emissive/emissiveIntensity are Standard/Physical-material-only;
        // transparent/opacity are on the THREE.Material base and safe for
        // any material type a GLB might legally use.
        if (isSelected && tintedMat instanceof THREE.MeshStandardMaterial) {
          tintedMat.emissive = new THREE.Color('#ffffff');
          tintedMat.emissiveIntensity = 0.25;
        }
        if (isGhost) {
          tintedMat.transparent = true;
          tintedMat.opacity = 0.35;
        }
        return tintedMat;
      });
      mesh.material = wasArray ? tinted : tinted[0]!;
    });
    return () => {
      created.forEach((mat) => mat.dispose());
    };
  }, [originalMaterials, isSelected, isGhost]);

  // Play the resolved clip on loop. While `isMoving` (rpg-dnd5e-web#542),
  // prefer a `Walk_*` clip (resolveWalkClipName), falling back to idle if
  // this model has no walk clip yet; stationary always plays idle
  // (resolveIdleClipName — prefers an "idle"-named clip, falls back to the
  // first available). Today's `main` fighter/barbarian/monk/rogue.glb all
  // ship 4 clips (3 idle variants + Walk_Forward, rpg-game-assets#20);
  // downed variants ship 0, so `names` is empty and `resolvedClipName` is
  // undefined — this effect no-ops cleanly for those, same as before #542.
  const { actions, names } = useAnimations(animations, cloned);
  const resolvedClipName = isMoving
    ? (resolveWalkClipName(names) ?? resolveIdleClipName(names))
    : resolveIdleClipName(names);
  useEffect(() => {
    if (!resolvedClipName) return;
    const action = actions[resolvedClipName];
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, resolvedClipName]);

  // HexGrid's Canvas runs frameloop="demand" (only re-renders on explicit
  // invalidate() calls, not every rAF tick — see HexEntity.tsx's identical
  // note on its isGhost transition). useAnimations' internal mixer.update()
  // only advances on frames that actually get rendered; without forcing a
  // steady stream of them here, a playing clip would stutter/freeze rather
  // than loop smoothly, only nudging forward whenever some unrelated prop
  // change or user interaction happened to trigger a frame. Each rendered
  // frame requests the next one, self-sustaining for as long as this
  // component has a clip playing; a no-op (no re-invalidation loop) once
  // resolvedClipName is undefined (downed variants, or any future model
  // shipped with no animation).
  useFrame((state) => {
    if (resolvedClipName) state.invalidate();
  });

  return (
    <primitive
      object={cloned}
      scale={SYNTY_SCALE}
      rotation={[0, facingRotation, 0]}
    />
  );
}
