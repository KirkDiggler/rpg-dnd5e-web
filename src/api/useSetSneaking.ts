import { useCallback, useState } from 'react';
import { sessionClient } from './client';

/**
 * Declares or clears sneaking for one seated character (rpg-project#606,
 * sneaking R6). The mode is encounter state the server holds: the caller
 * reads it back from `GetViewResponse.sneaking`, never from a flag kept here.
 * `sneaking` is sent with explicit presence, false included, because the
 * request field is optional and an absent value is not a clear.
 */
export function useSetSneaking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const setSneaking = useCallback(
    async (input: { session: string; member: string; sneaking: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.setSneaking(input);
      } catch (cause) {
        const failure =
          cause instanceof Error
            ? cause
            : new Error('Unable to change sneaking');
        setError(failure);
        throw failure;
      } finally {
        setLoading(false);
      }
    },
    []
  );
  return { setSneaking, loading, error };
}
