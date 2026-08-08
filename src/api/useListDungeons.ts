import { create } from '@bufbuild/protobuf';
import type { DungeonSummary } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { ListDungeonsRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useEffect, useState } from 'react';
import { lobbyClient } from './client';

export interface UseListDungeonsResult {
  dungeons: DungeonSummary[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches every authored dungeon key + display name the server can
 * StartEncounter from (LobbyService.ListDungeons — ungated, works with the
 * authoring surface off). Feeds the lobby's dungeon picker (rpg-project#131).
 *
 * Fires once on mount, no request fields — `loading` starts `true` so a
 * caller never renders an empty picker before the fetch effect has even
 * run (same "no flash of empty state" reasoning as useMyActiveLobby).
 */
export function useListDungeons(): UseListDungeonsResult {
  const [dungeons, setDungeons] = useState<DungeonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDungeons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const request = create(ListDungeonsRequestSchema, {});
      const response = await lobbyClient.listDungeons(request);
      setDungeons(response.dungeons);
    } catch (err) {
      setDungeons([]);
      setError(
        err instanceof Error ? err : new Error('ListDungeons RPC failed')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDungeons();
  }, [fetchDungeons]);

  return { dungeons, loading, error, refetch: fetchDungeons };
}
