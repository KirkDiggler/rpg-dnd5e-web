import { useLayoutEffect } from 'react';
import { setAuth } from './auth';

/**
 * Syncs a dev-mode `?playerId=` URL override into the gRPC auth store so
 * outbound RPCs are attributed to the overridden player. Without this, the
 * auth interceptor falls back to VITE_DEV_PLAYER_ID and 2-tab dev sessions
 * authenticate as the same player.
 *
 * useLayoutEffect (not useEffect) so auth is set BEFORE any child useEffect
 * fires its first request.
 */
export function useDevPlayerIdAuth(devPlayerIdOverride: string | null): void {
  useLayoutEffect(() => {
    if (devPlayerIdOverride) {
      setAuth(null, devPlayerIdOverride);
    }
  }, [devPlayerIdOverride]);
}
