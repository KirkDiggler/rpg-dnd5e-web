import {
  StructuralWallFallbackMarker,
  StructuralWallSurfacePieces,
  type WallFogStretch,
} from '@/concepts/world-building/StructuralWallSurfaces';
import { projectCapturedWallFinishes } from '@/concepts/world-building/wallFinishProjection';
import { resolveWorldAsset } from '@/generated/worldAssetCatalog';
import { useWorldMaterialCatalog } from '@/rendering/useWorldMaterialCatalog';
import type { CapturedWallSurface as Wall } from './structuralLayout';

interface Props {
  wall: Wall;
  remembered?: boolean;
  fogStretches?: readonly WallFogStretch[];
}

function FinishedWall(props: Props): React.JSX.Element {
  const state = useWorldMaterialCatalog();
  if (state.status === 'loading')
    return <StructuralWallFallbackMarker wall={props.wall} tone="loading" />;
  let spans;
  try {
    spans = projectCapturedWallFinishes(
      props.wall,
      props.wall.faceFinishes!,
      state.catalog
    );
    const hash = resolveWorldAsset(props.wall.appearance.assetRef)?.glbSha256;
    if (spans.some((span) => span.provider.glbSha256 !== hash))
      throw Error('Captured wall finish binding geometry is stale.');
  } catch (error) {
    return (
      <group
        name="captured-wall-finish-error"
        userData={{
          wallId: props.wall.id,
          reason: error instanceof Error ? error.message : String(error),
        }}
      >
        <StructuralWallFallbackMarker wall={props.wall} tone="error" />
      </group>
    );
  }
  return <StructuralWallSurfacePieces {...props} finishSpans={spans} />;
}

/** The ordinary wall stays on its existing path; selected finishes share the
 * same resource authority and leaf as Studio, before fog/memory treatment. */
export function CapturedWallSurface(props: Props): React.JSX.Element {
  return Object.keys(props.wall.faceFinishes ?? {}).length ? (
    <FinishedWall {...props} />
  ) : (
    <StructuralWallSurfacePieces {...props} />
  );
}
