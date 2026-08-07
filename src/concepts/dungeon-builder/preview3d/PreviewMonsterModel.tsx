/**
 * PreviewMonsterModel — the 3D preview spike's monster renderer (Kirk's
 * 2026-08-01 ask #4 on rpg-dnd5e-web#667). No equivalent standalone
 * component exists on the game's real combat path: HexEntity.tsx resolves
 * and positions a monster GLB itself, but folded into 638 lines that also
 * drive movement-path animation, facing, downed/dead tilt, remembered
 * tinting, and player/obstacle branches this static preview needs none of.
 * This mirrors PropModel.tsx's much simpler shape instead (load, clone,
 * place) — same `useGLTF` + `Object3D.clone(true)` pattern, no skeleton
 * re-parenting needed (see PropModel.tsx's own doc comment for why a plain
 * clone is correct here), no tinting/animation.
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
  const cloned = useMemo(() => scene.clone(true), [scene]);
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
