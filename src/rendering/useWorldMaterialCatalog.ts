import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import {
  GENERATED_WORLD_ATLAS_BINDINGS,
  GENERATED_WORLD_ATLAS_MATERIALS,
  GENERATED_WORLD_MATERIAL_COLLECTIONS,
  GENERATED_WORLD_MATERIAL_PROVIDER,
  GENERATED_WORLD_MATERIALS,
} from '@/generated/worldMaterialCatalog';
import {
  createPinnedWorldMaterialCatalog,
  type WorldMaterialCatalog,
} from '@/rendering/worldMaterialCatalog';
import { useEffect, useMemo, useState } from 'react';
import { createWorldMaterialPreviewLoader } from './worldMaterialPreviewLoader';
export interface WorldMaterialCatalogState {
  catalog: WorldMaterialCatalog | null;
  status: 'unavailable' | 'loading' | 'ready' | 'error';
  message: string;
}
const loadCandidate = createWorldMaterialPreviewLoader();
let pinnedSnapshot: WorldMaterialCatalogState | undefined;

/** One consumer of generated provider identity; an explicit dev candidate may
 * override it, but neither path owns a second document or browser store. */
export function useWorldMaterialCatalog(): WorldMaterialCatalogState {
  const enabled =
    import.meta.env.MODE === 'development' &&
    import.meta.env.VITE_WORLD_MATERIAL_PREVIEW === '1';
  const pinned = useMemo<WorldMaterialCatalogState>(() => {
    if (pinnedSnapshot) return pinnedSnapshot;
    const catalog = createPinnedWorldMaterialCatalog({
      provider: GENERATED_WORLD_MATERIAL_PROVIDER,
      materials: GENERATED_WORLD_MATERIALS,
      assets: GENERATED_WORLD_ASSETS,
      ...(GENERATED_WORLD_ATLAS_MATERIALS.length
        ? {
            atlas: {
              materials: GENERATED_WORLD_ATLAS_MATERIALS,
              collections: GENERATED_WORLD_MATERIAL_COLLECTIONS,
              bindings: GENERATED_WORLD_ATLAS_BINDINGS,
            },
          }
        : {}),
    });
    pinnedSnapshot = catalog
      ? {
          catalog,
          status: 'ready',
          message: 'Wall finishes from pinned assets.',
        }
      : {
          catalog: null,
          status: 'unavailable',
          message: 'No published wall-finish catalog is installed.',
        };
    return pinnedSnapshot;
  }, []);
  const [state, setState] = useState<WorldMaterialCatalogState>({
    catalog: null,
    status: enabled ? 'loading' : 'unavailable',
    message: enabled
      ? 'Loading candidate wall finishes…'
      : 'No published wall-finish catalog is installed.',
  });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void loadCandidate()
      .then((catalog) => {
        if (current)
          setState({
            catalog,
            status: 'ready',
            message: 'Candidate preview — not a published material release.',
          });
      })
      .catch((error: unknown) => {
        if (current)
          setState({
            catalog: null,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      current = false;
    };
  }, [enabled]);
  return enabled ? state : pinned;
}
