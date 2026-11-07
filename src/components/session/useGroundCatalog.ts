import { isDevLike } from '@/devMode';
import { GENERATED_GROUND_PROVIDER } from '@/generated/groundCatalogProvider';
import {
  createGroundCatalogStore,
  type GroundCatalogSnapshot,
} from '@/rendering/groundCatalog';
import { useEffect, useSyncExternalStore } from 'react';

const store = createGroundCatalogStore({
  catalogSha256: GENERATED_GROUND_PROVIDER.catalogSha256,
  allowPreview: isDevLike(),
});

/** Shared ground metadata; unavailable explicit styles never become defaults. */
export function useGroundCatalog(): GroundCatalogSnapshot {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, []);
  return snapshot;
}
