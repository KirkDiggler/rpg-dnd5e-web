import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
/**
 * PropModel — renders a resolved static prop GLB (rpg-dnd5e-web#528,
 * charter #523) in place of HexEntity's primitive obstacle capsule, when
 * the entity resolves to a known `dnd5e:props:<name>` reference key (see
 * obstaclePropKeys.ts for how that resolution happens today).
 *
 * Companion meshes (rpg-game-assets#36 wave-1, issue #623): a variant may
 * carry `companions` — today only the `candles` key's Candles_01..04
 * pieces do, each paired with its own flame particle mesh
 * (propManifest.ts's `PropVariant.companions` doc comment has the full
 * story). Each companion renders as its own sibling PRIMITIVE inside the
 * SAME transformed group as the parent variant, at the group's local
 * origin — "layered at the parent's anchor," not offset — since the
 * source manifest carries no separate companion transform, only a file
 * reference. This kills "candles have no flame": the flame particle mesh
 * sits exactly where its candle cluster is, moves/rotates with it for
 * free (same group), and needs no per-companion placement math.
 *
 * Sibling of ClassCharacterModel.tsx's useGLTF lineage, simplified for the
 * static case: props are plain (non-skinned) meshes, so there is no
 * skeleton to re-parent and no rpg-dnd5e-web#510-style SkeletonUtils
 * requirement — a plain `Object3D.clone(true)` is correct and sufficient,
 * exactly SyntyHexWall.tsx's `GlbInstance` pattern for wall/door pieces.
 * `<primitive>` elements are never auto-disposed by react-three-fiber on
 * unmount (only JSX-created elements like `<mesh>`/`<meshStandardMaterial>`
 * are) — the reconciler's removeChild explicitly special-cases
 * `child.type !== 'primitive'` before ever calling dispose. Since
 * `clone(true)` does NOT deep-clone geometry/material (only the Object3D
 * node hierarchy — geometry/material stay shared references into drei's
 * URL-keyed useGLTF cache), that "primitives are never disposed" rule is
 * exactly the correct behavior here: disposing would tear down the SHARED
 * cached geometry/material out from under every other on-screen instance
 * of this same GLB. So "dispose properly" for a static, untinted prop
 * means "don't fight the framework's existing correct default" — no
 * material clone/dispose effect is needed unless a future slice adds
 * per-instance tinting (ClassCharacterModel.tsx's selected/ghost tint
 * effect is the pattern to follow if that lands, including its explicit
 * per-run-created-materials dispose cleanup).
 *
 * Scale/placement: `footprintHexes` (propManifest.ts) is NOT applied as a
 * render-time scale multiplier here — every Synty piece (character, wall,
 * prop) is placed at the same SYNTY_SCALE because that's what makes them
 * agree on real-world-meters-per-hex in the first place
 * (calibrationConstants.ts). A 2- or 3-hex-footprint piece (rock-pile,
 * barricade) is simply wider than one hex at that same scale — this
 * component does not squeeze it down to fit a single hex. footprintHexes
 * is placement-sanity DATA for whatever positions props on the grid
 * (reserving N hexes so a wide piece doesn't visually overlap a
 * neighboring entity), not a scale input to this renderer. Vertical
 * placement is shared too: the caller's Y is a relative offset added to
 * `DUNGEON_SURFACE_Y`, so grounded props and `SyntyHexFloor` agree on the
 * same world surface without caller- or specimen-specific transforms.
 *
 * Remembered tinting (rpg-dnd5e-web#605/#609): `remembered` applies the
 * SAME shared crypt-memory material treatment ClassCharacterModel.tsx uses
 * for player/monster models (`cloneCryptMaterials`, sceneKnowledge.ts) — a
 * frozen prop reads as memory identically to a frozen character, rather
 * than a second approximation. This was exactly the follow-up this file's
 * own header comment flagged ("no material clone/dispose effect is needed
 * unless a future slice adds per-instance tinting... the pattern to
 * follow"). Each companion mesh (e.g. candles' flame pieces) gets the same
 * treatment independently, so a remembered candle prop doesn't leave its
 * flame glowing at full brightness.
 */

import { planAssetHeight } from '@/rendering/assetHeightLayout';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { propVisualScale } from '@/rendering/propVisualScale';
import { useGLTF } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  PROPS_MODEL_BASE,
  type PropCompanion,
  type PropVariant,
} from './propManifest';
import { useRememberedModelTint as useRememberedTint } from './useRememberedModelTint';

export interface PropModelBounds {
  minY: number;
  maxY: number;
  width: number;
  height: number;
  depth: number;
}

export interface PropModelProps {
  variant: PropVariant;
  /** World position (already converted from hex/cube coords by the
   * caller — see HexEntity.tsx's cubeToWorld usage). Y is relative to the
   * shared dungeon surface. */
  position: [number, number, number];
  rotationY?: number;
  /** Optional authoring placement correction measured from the actual
   * loaded mesh. Omitted by game callers, preserving source-origin semantics. */
  anchor?: 'source-origin' | 'bounds-floor-center';
  /** Reports dimensions after the shared Synty scale and optional anchor.
   * Authoring consumers use maxY for real-mesh tabletop intersections. */
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  /** Render as the viewer's frozen last observation (rpg-dnd5e-web#605/
   * #609) — the same shared crypt-memory material tint
   * ClassCharacterModel.tsx applies to player/monster models. Defaults
   * false, matching every caller before this prop existed. */
  remembered?: boolean;
  /** Visual Y scale, grounded at the authored mesh base. */
  heightScale?: number;
  /** Absolute visual height of the complete static legacy assembly. */
  targetHeight?: number;
  visualLighting?: RegionLightingMaterialBinding;
}

/** One companion mesh, loaded/cloned independently of its parent (its own
 * `useGLTF` cache entry, same as any other GLB) but rendered with NO
 * transform of its own — the parent `<group>` in `PropModel` below
 * supplies position/rotation/scale for both the parent variant and every
 * companion alike, so a companion always sits at its parent's anchor. */
function PropCompanionModel({
  companion,
  remembered,
  visualLighting,
  onNativeBounds,
}: {
  companion: PropCompanion;
  onNativeBounds?: (file: string, bounds: THREE.Box3) => void;
  visualLighting?: RegionLightingMaterialBinding;
  remembered: boolean;
}) {
  const { scene } = useGLTF(PROPS_MODEL_BASE + companion.file);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const nativeBounds = useMemo(() => {
    cloned.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(cloned, true);
  }, [cloned]);
  useEffect(
    () => onNativeBounds?.(companion.file, nativeBounds),
    [companion.file, nativeBounds, onNativeBounds]
  );
  useRememberedTint(
    cloned,
    remembered,
    undefined,
    visualLighting,
    PROPS_MODEL_BASE + companion.file
  );
  return <primitive object={cloned} />;
}

export function PropModel({
  variant,
  position,
  rotationY = 0,
  anchor = 'source-origin',
  onBoundsMeasured,
  remembered = false,
  heightScale = 1,
  targetHeight,
  visualLighting,
}: PropModelProps) {
  const [companionBounds, setCompanionBounds] = useState<
    Record<string, THREE.Box3>
  >({});
  const onNativeBounds = useCallback((file: string, bounds: THREE.Box3) => {
    setCompanionBounds((previous) =>
      previous[file]?.equals(bounds)
        ? previous
        : { ...previous, [file]: bounds.clone() }
    );
  }, []);
  const heightReady =
    targetHeight === undefined ||
    (variant.companions ?? []).every((part) => companionBounds[part.file]);
  const { scene } = useGLTF(PROPS_MODEL_BASE + variant.file);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const localBounds = useMemo(() => {
    cloned.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(cloned, true);
  }, [cloned]);
  // Legacy percentage callers keep their primary-bound anchor/reporting. An
  // explicit physical target measures every declared companion before drawing.
  const fittedBounds = useMemo(() => {
    if (targetHeight === undefined) return localBounds;
    const bounds = localBounds.clone();
    for (const part of variant.companions ?? [])
      if (companionBounds[part.file]) bounds.union(companionBounds[part.file]);
    return bounds;
  }, [localBounds, targetHeight, variant.companions, companionBounds]);
  const safeHeightScale =
    targetHeight !== undefined && heightReady
      ? planAssetHeight({
          nativeHeight:
            fittedBounds.getSize(new THREE.Vector3()).y * SYNTY_SCALE,
          targetHeight,
          profile: { mode: 'scale' },
        }).scaleY
      : propVisualScale(heightScale);
  const anchorOffset = useMemo<[number, number, number]>(() => {
    if (anchor === 'source-origin' || fittedBounds.isEmpty()) return [0, 0, 0];
    const center = fittedBounds.getCenter(new THREE.Vector3());
    return [-center.x, -fittedBounds.min.y, -center.z];
  }, [anchor, fittedBounds]);
  const measuredBounds = useMemo<PropModelBounds>(() => {
    if (fittedBounds.isEmpty()) {
      return { minY: 0, maxY: 0, width: 0, height: 0, depth: 0 };
    }
    const size = fittedBounds.getSize(new THREE.Vector3());
    const anchoredMinY = fittedBounds.min.y + anchorOffset[1];
    return {
      minY:
        anchoredMinY *
        SYNTY_SCALE *
        (targetHeight === undefined ? 1 : safeHeightScale),
      maxY:
        (fittedBounds.max.y + anchorOffset[1]) * SYNTY_SCALE * safeHeightScale,
      width: size.x * SYNTY_SCALE,
      height: size.y * SYNTY_SCALE * safeHeightScale,
      depth: size.z * SYNTY_SCALE,
    };
  }, [anchorOffset, fittedBounds, safeHeightScale, targetHeight]);
  useEffect(() => {
    if (heightReady) onBoundsMeasured?.(measuredBounds);
  }, [measuredBounds, onBoundsMeasured, heightReady]);
  useRememberedTint(
    cloned,
    remembered,
    undefined,
    visualLighting,
    PROPS_MODEL_BASE + variant.file
  );

  const modelContents = (
    <>
      <primitive object={cloned} />
      {variant.companions?.map((companion) => (
        <PropCompanionModel
          key={companion.file}
          companion={companion}
          onNativeBounds={
            targetHeight === undefined ? undefined : onNativeBounds
          }
          visualLighting={visualLighting}
          remembered={remembered}
        />
      ))}
    </>
  );

  return (
    <group
      visible={heightReady}
      position={[position[0], position[1] + DUNGEON_SURFACE_Y, position[2]]}
      rotation={[0, rotationY, 0]}
      scale={[SYNTY_SCALE, SYNTY_SCALE * safeHeightScale, SYNTY_SCALE]}
    >
      {anchor === 'source-origin' ? (
        modelContents
      ) : (
        <group name="prop-model-bounds-anchor" position={anchorOffset}>
          {modelContents}
        </group>
      )}
    </group>
  );
}
