/**
 * PropModel — renders a resolved static prop GLB (rpg-dnd5e-web#528,
 * charter #523) in place of HexEntity's primitive obstacle capsule, when
 * the entity resolves to a known `dnd5e:props:<name>` reference key (see
 * obstaclePropKeys.ts for how that resolution happens today).
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
 * neighboring entity), not a scale input to this renderer.
 */

import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { PROPS_MODEL_BASE, type PropVariant } from './propManifest';

export interface PropModelProps {
  variant: PropVariant;
  /** World position (already converted from hex/cube coords by the
   * caller — see HexEntity.tsx's cubeToWorld usage). */
  position: [number, number, number];
  rotationY?: number;
}

export function PropModel({
  variant,
  position,
  rotationY = 0,
}: PropModelProps) {
  const { scene } = useGLTF(PROPS_MODEL_BASE + variant.file);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <primitive
      object={cloned}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={SYNTY_SCALE}
    />
  );
}
