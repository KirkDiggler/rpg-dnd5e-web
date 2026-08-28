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
 * Merged Townfolk contract (provider PR #61, merge commit 4fac080): every
 * standing Fighter/Monk/Rogue/Barbarian class alias ships exactly two baked
 * clips, in order: `Idle_Relaxed`, then `Walk_Forward`. Every downed variant
 * is static and ships zero animation clips. `SkeletonUtils.clone()` works
 * for both animated and static meshes, so one clone path covers both cases.
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
import { MainHandAttachmentSlot } from './MainHandAttachment';
import {
  type MainHandAttachmentStatus,
  type MainHandPresentation,
} from './mainHandPresentation';
import { cloneCryptMaterials } from './sceneKnowledge';

export interface ClassCharacterModelProps {
  url: string;
  isSelected?: boolean;
  isGhost?: boolean;
  /** Render as the viewer's frozen last observation (rpg-dnd5e-web#604):
   * central crypt-memory treatment, no animation. Memory wins over selection
   * and ghosting. */
  remembered?: boolean;
  /** Matches MediumHumanoid's facingRotation convention — players face the
   * camera (PI), monsters/other uses face forward (0). */
  facingRotation?: number;
  /** True while HexEntity is stepping this entity's rendered position
   * through a real move (rpg-dnd5e-web#542) — plays the resolved walk clip
   * instead of idle. Defaults false (idle), matching every pre-#542 caller
   * unchanged. */
  isMoving?: boolean;
  /** True when `url` resolves a downed/dead-pose GLB (rpg-dnd5e-web#501/
   * #559) — those ship with 0 baked clips BY DESIGN (a static collapsed
   * pose, not an animated one), so the dev-mode zero-clip warning below
   * doesn't fire for them. Defaults false, matching every pre-existing
   * standing-model caller. */
  isDownedVariant?: boolean;
  mainHandPresentation?: MainHandPresentation;
  onMainHandStatus?: (status: MainHandAttachmentStatus) => void;
}

export function ClassCharacterModel({
  url,
  isSelected = false,
  isGhost = false,
  remembered = false,
  facingRotation = 0,
  isMoving = false,
  isDownedVariant = false,
  mainHandPresentation,
  onMainHandStatus,
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
  //
  // Every mesh opts OUT of raycasting here too (rpg-dnd5e-web
  // unit/game-fidelity, Bug A): a THREE.SkinnedMesh raycasts against its
  // BIND-POSE geometry, never the pose the idle/walk clip actually renders,
  // so a click on the visible (animated) body hits or misses depending on
  // which frame is showing — with no console signal on a miss. HexEntity
  // now mounts a static capsule raycast proxy alongside this model (see its
  // own doc comment) that is unaffected by any animation; this model's own
  // meshes have no business being raycast targets at all once that proxy
  // exists, so disabling it here is both the actual bug fix and a perf win
  // (R3F's raycaster no longer has to walk this whole skinned mesh tree on
  // every pointer move). A no-op function, not `null`/`undefined` — three.js
  // calls `object.raycast(raycaster, intersects)` unconditionally, so the
  // override must stay callable.
  const cloned = useMemo(() => {
    const clone = cloneSkeleton(scene);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) child.raycast = () => {};
    });
    return clone;
  }, [scene]);

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
    if (!isSelected && !isGhost && !remembered) {
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
      // Memory wins over every other tint. Uses the one shared crypt
      // treatment (sceneKnowledge) rather than approximating it here, so
      // remembered geometry and remembered entities cannot drift apart.
      if (remembered) {
        const crypt = cloneCryptMaterials(mat);
        (Array.isArray(crypt) ? crypt : [crypt]).forEach((m) =>
          created.push(m)
        );
        mesh.material = crypt;
        return;
      }
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
  }, [originalMaterials, isSelected, isGhost, remembered]);

  // Play the resolved clip on loop. While `isMoving` (rpg-dnd5e-web#542),
  // prefer a `Walk_*` clip (resolveWalkClipName), falling back to idle if
  // this model has no walk clip yet; stationary always plays idle
  // (resolveIdleClipName — prefers an "idle"-named clip, falls back to the
  // first available). The merged standing Townfolk files all ship exactly
  // `Idle_Relaxed`, then `Walk_Forward`; downed variants ship 0 clips, so
  // `names` is empty and `resolvedClipName` is undefined — this effect
  // no-ops cleanly for those, same as before #542.
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

  // Dev-mode-only zero-clip warning (rpg-dnd5e-web#559 review). A standing
  // model with NO baked clip at all renders at its raw bind pose, which
  // reads fine ONLY if the rig's rest pose was itself authored to be
  // presentable (Kirk: Auto-Rig Pro "made it much easier to get the default
  // non t pose" — the fix belongs on the asset side, in the rig's rest
  // pose, not by refusing to mount a perfectly good model here). When it
  // wasn't, this is silent and looks like a bug rather than reading as an
  // intentional pose — the exact hazard classCharacterModels.ts's
  // `_animFixComment`/`_idleClipsComment` already documents for a DIFFERENT
  // Synty pack ("Stance clips bake their held pose into the FBX's own rest
  // matrices... silently reproduces the target's T-pose bind"). Warn loudly
  // in dev instead of suppressing the model — never fires for downed
  // variants, which ship 0 clips by design (a static collapsed pose).
  useEffect(() => {
    if (isDownedVariant) return;
    if (names.length > 0) return;
    if (import.meta.env.MODE !== 'development') return;
    console.warn(
      `[ClassCharacterModel] ${url} mounted with zero animation clips — ` +
        'it will render at its raw bind pose. If that pose was not authored ' +
        "to stand presentably (see this effect's doc comment), it will " +
        'read as a broken/T-posed model rather than an intentional static ' +
        'look.'
    );
  }, [isDownedVariant, names, url]);

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
    <>
      <primitive
        object={cloned}
        scale={SYNTY_SCALE}
        rotation={[0, facingRotation, 0]}
      />
      <MainHandAttachmentSlot
        key={
          mainHandPresentation
            ? `${mainHandPresentation.ref}|${mainHandPresentation.weaponUrl}`
            : 'unarmed'
        }
        characterRoot={cloned}
        presentation={mainHandPresentation}
        onStatus={onMainHandStatus}
      />
    </>
  );
}
