import {
  parseWorldMaterialPreview,
  type WorldMaterialCatalog,
} from '@/rendering/worldMaterialCatalog';
import { useEffect, useState } from 'react';
export interface WorldMaterialCatalogState {
  catalog: WorldMaterialCatalog | null;
  status: 'unavailable' | 'loading' | 'ready' | 'error';
  message: string;
}
/** One owner per Studio document view; no browser store or published pin. */
export function useWorldMaterialCatalog(): WorldMaterialCatalogState {
  const enabled =
    import.meta.env.MODE === 'development' &&
    import.meta.env.VITE_WORLD_MATERIAL_PREVIEW === '1';
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
            message:
              'Candidate preview — physical scale and appearance await acceptance.',
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
  return state;
}
