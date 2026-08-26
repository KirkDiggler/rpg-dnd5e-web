import { useEffect, useState } from 'react';
import {
  getDungeonShellCatalogSnapshot,
  preloadDungeonShellCatalog,
  type DungeonShellCatalogSnapshot,
} from '../../rendering/dungeonShellProvider';

export function useDungeonShellCatalog(): DungeonShellCatalogSnapshot {
  const [snapshot, setSnapshot] = useState<DungeonShellCatalogSnapshot>(() =>
    getDungeonShellCatalogSnapshot()
  );

  useEffect(() => {
    let mounted = true;
    const current = getDungeonShellCatalogSnapshot();
    setSnapshot(current);

    if (current.status === 'ready' || current.status === 'failed') {
      return () => {
        mounted = false;
      };
    }

    const owner = preloadDungeonShellCatalog();
    void owner.then(
      () => {
        if (mounted) setSnapshot(getDungeonShellCatalogSnapshot());
      },
      () => {
        if (mounted) setSnapshot(getDungeonShellCatalogSnapshot());
      }
    );

    return () => {
      mounted = false;
    };
  }, []);

  return snapshot;
}
