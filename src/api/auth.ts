/**
 * Auth store for gRPC authentication.
 *
 * This module bridges React context (Discord auth) with the module-level
 * gRPC client. The interceptor reads from this store to add auth headers.
 *
 * Usage:
 * - DiscordProvider calls setAuth() after Discord authentication
 * - The auth interceptor calls getAuth() for each gRPC request
 * - In local dev, VITE_DEV_PLAYER_ID provides a fallback player ID
 */

interface AuthState {
  discordToken: string | null;
  playerId: string | null;
}

let authState: AuthState = {
  discordToken: null,
  playerId: null,
};

/**
 * Set the current auth state. Called by DiscordProvider after auth.
 */
export function setAuth(token: string | null, playerId: string | null): void {
  authState = { discordToken: token, playerId };

  if (import.meta.env.MODE === 'development') {
    console.log('🔐 Auth state updated:', {
      hasToken: !!token,
      playerId: playerId || '(none)',
    });
  }
}

/**
 * Get the current Discord token for API authentication.
 * Returns null if not authenticated.
 */
export function getDiscordToken(): string | null {
  return authState.discordToken;
}

/**
 * Get the current player ID.
 * Falls back to VITE_DEV_PLAYER_ID in development mode.
 */
export function getPlayerId(): string | null {
  if (authState.playerId) {
    return authState.playerId;
  }

  // Development fallback
  if (import.meta.env.MODE === 'development') {
    const devPlayerId = import.meta.env.VITE_DEV_PLAYER_ID;
    if (devPlayerId) {
      return devPlayerId;
    }
  }

  return null;
}

/**
 * Check if we have valid auth credentials.
 * In production: requires Discord token
 * In development: accepts either token or dev player ID
 */
export function isAuthenticated(): boolean {
  if (authState.discordToken) {
    return true;
  }

  // Development mode allows running without Discord
  if (import.meta.env.MODE === 'development') {
    return !!import.meta.env.VITE_DEV_PLAYER_ID;
  }

  return false;
}

/**
 * Clear auth state. Called on logout or auth failure.
 */
export function clearAuth(): void {
  authState = { discordToken: null, playerId: null };

  if (import.meta.env.MODE === 'development') {
    console.log('🔐 Auth state cleared');
  }
}
