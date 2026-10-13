import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import {
  GENERATED_WORLD_MATERIAL_PROVIDER,
  GENERATED_WORLD_MATERIALS,
} from '@/generated/worldMaterialCatalog';
import {
  createPinnedWorldMaterialCatalog,
  parseWorldMaterialPreview,
  type WorldMaterialCatalog,
} from '@/rendering/worldMaterialCatalog';
import { useEffect, useMemo, useState } from 'react';
export interface WorldMaterialCatalogState {
  catalog: WorldMaterialCatalog | null;
  status: 'unavailable' | 'loading' | 'ready' | 'error';
  message: string;
}
/** One consumer of generated provider identity; an explicit dev candidate may
 * override it, but neither path owns a second document or browser store. */
export function useWorldMaterialCatalog(): WorldMaterialCatalogState {
  const enabled =
    import.meta.env.MODE === 'development' &&
    import.meta.env.VITE_WORLD_MATERIAL_PREVIEW === '1';
  const pinned = useMemo<WorldMaterialCatalogState>(() => {
    const catalog = createPinnedWorldMaterialCatalog({
      provider: GENERATED_WORLD_MATERIAL_PROVIDER,
      materials: GENERATED_WORLD_MATERIALS,
      assets: GENERATED_WORLD_ASSETS,
    });
    return catalog
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
    void fetch('/world-material-preview/catalog.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Candidate wall finishes have not been staged.');
        return parseWorldMaterialPreview(await response.json());
      })
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
