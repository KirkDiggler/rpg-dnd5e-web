/**
 * PreviewMonsterModel — the 3D preview spike's monster renderer (Kirk's
 * 2026-08-01 ask #4 on rpg-dnd5e-web#667). No equivalent standalone
 * component exists on the game's real combat path: HexEntity.tsx resolves
 * and positions a monster GLB itself, but folded into 638 lines that also
 * drive movement-path animation, facing, downed/dead tilt, remembered
 * tinting, and player/obstacle branches this static preview needs none of.
 * This mirrors PropModel.tsx's much simpler shape (load, clone, place) —
 * same `useGLTF` pattern, no tinting/animation — but NOT its clone call:
 * monster GLBs are skinned/rigged (a THREE.SkinnedMesh driven by a
 * THREE.Skeleton), and PropModel.tsx's own doc comment is explicit that
 * its plain `Object3D.clone(true)` is correct ONLY because props are
 * static, non-skinned meshes. A plain clone does not re-parent a
 * SkinnedMesh's skeleton onto the cloned bone hierarchy — the same
 * rpg-dnd5e-web#510 class documented in `ClassCharacterModel.tsx`'s own
 * doc comment (there, the whole model failed to render at all). Here,
 * Kirk saw a placed monster render away from its authored `at:` cell,
 * reading as "stuck at the canvas origin." Root-caused and reproduced
 * live (this fix, 2026-08-07): `SkinnedMesh.copy()` (three.js's own
 * source) does `this.skeleton = source.skeleton` — a shallow reference,
 * not a clone — so every clone's SkinnedMesh keeps pointing at the
 * ORIGINAL scene's skeleton/bones. The clone's own top-level
 * position (the `<primitive position=...>` below) still applies
 * correctly, but the bone actually driving GPU skinning does not belong
 * to the clone's own tree and never moves with it — confirmed by
 * patching `Object3D.prototype.updateMatrixWorld` in the running app and
 * reading real placements' skeleton bone world positions directly: both
 * of two distinct placed zombies' driving bones sat at the SAME frozen
 * `(0, 0.876, ~0)` pre-fix, each correctly tracking its own instance's
 * position post-fix (`X`/`Z` matching the placement to full float
 * precision). Fixed the same way #510 was: `SkeletonUtils.clone()` in
 * place of `Object3D.clone(true)`, which `ClassCharacterModel.tsx`'s doc
 * comment also notes is correct for an unskinned/static mesh too — so
 * this one clone call is right for every monster GLB, clip-bearing or
 * not. See `PreviewMonsterModel.skinnedClone.test.ts` for a real,
 * unmocked regression test of the exact mechanism.
 *
 * Split into an outer component (resolves the URL, may render nothing) and
 * an inner one (calls `useGLTF`) so an unmapped monster ref never calls a
 * hook conditionally — same shape HexEntity.tsx itself uses for its
 * "unresolved -> fall back" branches.
 *
 * `entityId` (2026-08-07 "palette content sync" unit, fixing a real bug
 * found while adding `zombie` as a placeable palette entry): before this
 * fix, this component called `resolveMonsterModelUrl` with NO 4th
 * argument, so `pickStableCandidateIndex` always saw `entityId ===
 * undefined` and fell back to candidate 0 for every multi-candidate ref —
 * every zombie placed in a dungeon would preview as the SAME look
 * (zombie-mutant/hulking), never the second promoted style
 * (zombie-peasant-female/gaunt), even though two different zombie
 * placements are two different entities on the real game route. Now takes
 * an optional `entityId` and forwards it straight through, so
 * `DungeonPreview3D.tsx` passing each placement's own stable `key`
 * (`buildOnePlacement`'s `PlacedMonster.key`) makes two zombies in the
 * same preview show both styles, deterministically, matching the game's
 * real per-entity behavior instead of a preview-only flattening of it.
 * Single-candidate refs (skeleton, skeleton-captain) are unaffected either
 * way — `pickStableCandidateIndex`'s `count <= 1` short-circuit means
 * `entityId` was never read for them, before or after this fix.
 */
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

interface PreviewMonsterModelProps {
  /** Toolkit monster ref id, e.g. "skeleton-captain" — NOT the
   * `dnd5e:monsters:skeleton-captain` dungeonspec ref key; strip the
   * `dnd5e:monsters:` prefix before calling, same convention
   * resolveMonsterModelUrl itself documents. */
  monsterRefId: string;
  position: [number, number, number];
  /** This placement's own stable identity — keys which candidate GLB a
   * multi-candidate ref (today, only `zombie`) resolves to. Optional/
   * defensive only, same as `resolveMonsterModelUrl`'s own `entityId`
   * parameter: an absent id degrades to candidate 0, never a crash or a
   * broken model. See this component's own doc comment for the bug this
   * closes. */
  entityId?: string;
}

function LoadedMonsterModel({
  url,
  position,
}: {
  url: string;
  position: [number, number, number];
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => cloneSkeleton(scene), [scene]);
  return <primitive object={cloned} position={position} scale={SYNTY_SCALE} />;
}

export function PreviewMonsterModel({
  monsterRefId,
  position,
  entityId,
}: PreviewMonsterModelProps) {
  const url = resolveMonsterModelUrl(monsterRefId, undefined, false, entityId);
  if (!url) return null;
  return <LoadedMonsterModel url={url} position={position} />;
}
