/**
 * In-memory authentication state shared by the Discord provider and Connect
 * transport. Credentials never leave this module except through the private
 * transport getter.
 */
interface AuthState {
  discordToken: string | null;
  playerId: string | null;
  guildId: string | null;
}

export type AuthDecision =
  | {
      readonly kind: 'discord';
      readonly playerId: string | null;
      readonly guildId: string | null;
    }
  | { readonly kind: 'dev'; readonly playerId: string }
  | { readonly kind: 'unauthenticated' };

let authState: AuthState = {
  discordToken: null,
  playerId: null,
  guildId: null,
};

/** Set Discord auth, or an explicit local Dev player when token is null. */
export function setAuth(
  token: string | null,
  playerId: string | null,
  guildId: string | null = null
): void {
  authState = { discordToken: token, playerId, guildId };

  if (import.meta.env.MODE === 'development') {
    console.log('🔐 Auth state updated:', {
      kind: token ? 'discord' : playerId ? 'dev' : 'none',
      playerId: playerId || '(none)',
      hasGuild: !!guildId,
    });
  }
}

/** Used only by the Connect interceptor to construct Discord authorization. */
export function getDiscordToken(): string | null {
  return authState.discordToken;
}

/**
 * Make the single non-secret auth routing decision used by transport and
 * composition-source selection. Discord always wins, including in Vite dev.
 */
export function getAuthDecision(mode = import.meta.env.MODE): AuthDecision {
  if (authState.discordToken) {
    return {
      kind: 'discord',
      playerId: authState.playerId,
      guildId: authState.guildId,
    };
  }

  if (mode === 'development') {
    const playerId = authState.playerId || import.meta.env.VITE_DEV_PLAYER_ID;
    if (playerId) return { kind: 'dev', playerId };
  }

  return { kind: 'unauthenticated' };
}

/** Current UI player identity; Dev fallback remains development-only. */
export function getPlayerId(): string | null {
  const decision = getAuthDecision();
  return decision.kind === 'unauthenticated' ? null : decision.playerId;
}

export function isAuthenticated(): boolean {
  return getAuthDecision().kind !== 'unauthenticated';
}

/** Clear credential, player, and selected guild as one transition. */
export function clearAuth(): void {
  authState = { discordToken: null, playerId: null, guildId: null };

  if (import.meta.env.MODE === 'development') {
    console.log('🔐 Auth state cleared');
  }
}
