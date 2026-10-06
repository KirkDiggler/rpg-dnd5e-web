import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export function useSetDiscoverySharing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const setSharing = useCallback(
    async (input: { session: string; member: string; sharing: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.setDiscoverySharing(input);
      } catch (cause) {
        const failure =
          cause instanceof Error
            ? cause
            : new Error('Unable to change discovery sharing');
        setError(failure);
        throw failure;
      } finally {
        setLoading(false);
      }
    },
    []
  );
  return { setSharing, loading, error };
}
