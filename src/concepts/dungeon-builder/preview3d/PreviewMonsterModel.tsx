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
}: PreviewMonsterModelProps) {
  const url = resolveMonsterModelUrl(monsterRefId, undefined, false);
  if (!url) return null;
  return <LoadedMonsterModel url={url} position={position} />;
}
