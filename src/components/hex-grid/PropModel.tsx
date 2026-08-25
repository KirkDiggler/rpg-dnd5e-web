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

import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  PROPS_MODEL_BASE,
  type PropCompanion,
  type PropVariant,
} from './propManifest';
import { cloneCryptMaterials } from './sceneKnowledge';

export interface PropModelProps {
  variant: PropVariant;
  /** World position (already converted from hex/cube coords by the
   * caller — see HexEntity.tsx's cubeToWorld usage). Y is relative to the
   * shared dungeon surface. */
  position: [number, number, number];
  rotationY?: number;
  /** Render as the viewer's frozen last observation (rpg-dnd5e-web#605/
   * #609) — the same shared crypt-memory material tint
   * ClassCharacterModel.tsx applies to player/monster models. Defaults
   * false, matching every caller before this prop existed. */
  remembered?: boolean;
}

/** Snapshot each mesh's original (untinted) material once per `object`
 * identity, then apply (or remove) the shared crypt-memory tint when
 * `remembered` toggles — same "snapshot once, tint as a separate effect"
 * split ClassCharacterModel.tsx uses, so neither a fresh clone/mount nor a
 * remembered toggle can compound a tint onto an already-tinted material.
 * Shared by both the parent variant and each companion mesh below. */
function useRememberedTint(object: THREE.Object3D, remembered: boolean) {
  const originalMaterials = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) map.set(child, child.material);
    });
    return map;
  }, [object]);

  useEffect(() => {
    if (!remembered) {
      originalMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      return () => {};
    }
    const created: THREE.Material[] = [];
    originalMaterials.forEach((mat, mesh) => {
      const crypt = cloneCryptMaterials(mat);
      (Array.isArray(crypt) ? crypt : [crypt]).forEach((m) => created.push(m));
      mesh.material = crypt;
    });
    return () => {
      created.forEach((mat) => mat.dispose());
    };
  }, [originalMaterials, remembered]);
}

/** One companion mesh, loaded/cloned independently of its parent (its own
 * `useGLTF` cache entry, same as any other GLB) but rendered with NO
 * transform of its own — the parent `<group>` in `PropModel` below
 * supplies position/rotation/scale for both the parent variant and every
 * companion alike, so a companion always sits at its parent's anchor. */
function PropCompanionModel({
  companion,
  remembered,
}: {
  companion: PropCompanion;
  remembered: boolean;
}) {
  const { scene } = useGLTF(PROPS_MODEL_BASE + companion.file);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useRememberedTint(cloned, remembered);
  return <primitive object={cloned} />;
}

export function PropModel({
  variant,
  position,
  rotationY = 0,
  remembered = false,
}: PropModelProps) {
  const { scene } = useGLTF(PROPS_MODEL_BASE + variant.file);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useRememberedTint(cloned, remembered);

  return (
    <group
      position={[position[0], position[1] + DUNGEON_SURFACE_Y, position[2]]}
      rotation={[0, rotationY, 0]}
      scale={SYNTY_SCALE}
    >
      <primitive object={cloned} />
      {variant.companions?.map((companion) => (
        <PropCompanionModel
          key={companion.file}
          companion={companion}
          remembered={remembered}
        />
      ))}
    </group>
  );
}
