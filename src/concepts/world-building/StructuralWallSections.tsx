import { REMEMBERED_SURFACE_TINT } from '@/components/hex-grid/sceneKnowledge';
import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import {
  partitionFinishInterval,
  type WallFinishSpan,
} from './roomWallFinishes';
import { wallDirectionYaw, wallLength } from './structuralWallEditing';
import type { StructuralWallSurface } from './structuralWalls';
import type { WallFogState, WallFogStretch } from './StructuralWallSurfaces';
import { WorldPropModel } from './WorldPropModel';

/** Visual children of the existing wall owner. Each full feature is fitted
 * once per visible fragment, then clipped without stretching its unique part.
 * Neither fragments nor section records are independent scene/wall entities. */
export function StructuralWallSections({
  wall,
  finishSpans,
  fogStretches,
  remembered,
  visualLighting,
  onMeasured,
}: {
  wall: StructuralWallSurface;
  finishSpans: readonly WallFinishSpan[];
  fogStretches: readonly WallFogStretch[];
  remembered: boolean;
  visualLighting?: RegionLightingMaterialBinding;
  onMeasured?: () => void;
}): React.JSX.Element {
  const length = wallLength(wall),
    yaw = wallDirectionYaw(wall);
  const fog = fogStretches.map((stretch) => ({
    start: stretch.from * length,
    end: stretch.to * length,
    state: stretch.state,
  }));
  const stateOver = (start: number, end: number): WallFogState => {
    if (!fog.length) return 'seen';
    const overlapping = fog.filter((row) => row.end > start && row.start < end);
    return overlapping.some((row) => row.state === 'seen')
      ? 'seen'
      : overlapping.some((row) => row.state === 'remembered')
        ? 'remembered'
        : 'absent';
  };
  return (
    <>
      {(wall.appearance.sections ?? []).map((section) => {
        const entry = WORLD_BUILDING_CATALOG_BY_REF.get(section.assetRef);
        if (entry?.source !== 'generated')
          throw Error(`Unknown section appearance ${section.assetRef}.`);
        const start = section.position - section.width / 2,
          end = section.position + section.width / 2;
        const provider = {
          assetRef: entry.ref,
          glbSha256: entry.asset.glbSha256,
          bindings: entry.asset.surfaces ?? [],
        };
        const segments = partitionFinishInterval(
          start,
          end,
          finishSpans
        ).flatMap((segment) => {
          const boundaries = [
            ...new Set([
              segment.start,
              segment.end,
              ...fog
                .flatMap((row) => [row.start, row.end])
                .filter(
                  (value) => value > segment.start && value < segment.end
                ),
            ]),
          ].sort((a, b) => a - b);
          return boundaries.slice(0, -1).map((value, index) => ({
            ...segment,
            start: value,
            end: boundaries[index + 1],
          }));
        });
        return (
          <group
            key={section.id}
            name={`structural-wall-section-${wall.id}-${section.id}`}
            userData={{ wallId: wall.id, sectionId: section.id }}
            position={[
              wall.line.start.x +
                ((wall.line.end.x - wall.line.start.x) * section.position) /
                  length,
              wall.appearance.elevation,
              wall.line.start.z +
                ((wall.line.end.z - wall.line.start.z) * section.position) /
                  length,
            ]}
            rotation={[0, yaw, 0]}
          >
            {segments.map((segment, index) => {
              const state = stateOver(segment.start, segment.end);
              if (state === 'absent') return null;
              const plans = segment.finishes.flatMap(
                ({ side, material, chart }) =>
                  provider.bindings
                    .filter(
                      (binding) =>
                        binding.side === side &&
                        binding.family === material.family
                    )
                    .map((binding) => ({
                      material,
                      chart: { ...chart, surfaceId: binding.id },
                    }))
              );
              return (
                <group
                  key={index}
                  userData={{
                    wallId: wall.id,
                    sectionId: section.id,
                    knowledge:
                      remembered || state === 'remembered'
                        ? 'remembered'
                        : 'seen',
                  }}
                >
                  <WorldPropModel
                    entry={entry}
                    position={[0, 0, 0]}
                    rotationY={0}
                    heightScale={1}
                    targetHeight={wall.appearance.height}
                    plainWallFit={{
                      width: section.width,
                      height: wall.appearance.height,
                      depth: wall.appearance.thickness,
                      offset: start,
                      clipStart: Math.max(0, segment.start - start),
                      clipEnd: Math.min(section.width, segment.end - start),
                    }}
                    surfaceProvider={provider}
                    surfacePlans={plans}
                    remembered={remembered || state === 'remembered'}
                    rememberedTint={REMEMBERED_SURFACE_TINT}
                    visualLighting={visualLighting}
                    onBoundsMeasured={onMeasured}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
