import {
  createGroundCatalogStore,
  type GroundCatalogSnapshot,
} from '@/rendering/groundCatalog';
import { useEffect, useSyncExternalStore } from 'react';

const store = createGroundCatalogStore();

/** Shared ground metadata; unavailable explicit styles never become defaults. */
export function useGroundCatalog(): GroundCatalogSnapshot {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, []);
  return snapshot;
}
