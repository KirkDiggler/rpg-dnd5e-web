import type {
  GetCharacterRequest,
  GetCharacterResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback, useState } from 'react';
import { characterClient } from './client';

interface UseGetCharacterReturn {
  getCharacter: (request: GetCharacterRequest) => Promise<GetCharacterResponse>;
  loading: boolean;
  error: Error | null;
}

export function useGetCharacter(): UseGetCharacterReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getCharacter = useCallback(async (request: GetCharacterRequest) => {
    setLoading(true);
    setError(null);

    try {
      const response = await characterClient.getCharacter(request);
      return response;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch character');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getCharacter, loading, error };
}
