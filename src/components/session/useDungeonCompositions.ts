import type { CompositionResolution } from '@/compositions/CompositionPlacementModel';
import type { CompositionSource } from '@/compositions/compositionSource';
import { useCompositionResolutions } from '@/compositions/useCompositionResolutions';
import type { SceneProp3D } from './atlasToScene3D';

/** Resolve each unique composition once for this rendered dungeon scene. */
export function useDungeonCompositions(
  props: readonly SceneProp3D[],
  source: CompositionSource | undefined
): ReadonlyMap<string, CompositionResolution> {
  return useCompositionResolutions(props, source);
}
