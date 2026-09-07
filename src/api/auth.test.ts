import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAuth, getAuthDecision, getDiscordToken, setAuth } from './auth';

afterEach(() => {
  clearAuth();
  vi.unstubAllEnvs();
});

describe('auth decision', () => {
  it('prefers Discord credentials over Dev credentials in development', () => {
    vi.stubEnv('VITE_DEV_PLAYER_ID', 'dev-player');
    setAuth('private-token', 'discord-player', '123456789012345678');

    expect(getAuthDecision('development')).toEqual({
      kind: 'discord',
      playerId: 'discord-player',
      guildId: '123456789012345678',
    });
    expect(getDiscordToken()).toBe('private-token');
  });

  it('uses Dev only for a development build with a Dev player', () => {
    vi.stubEnv('VITE_DEV_PLAYER_ID', 'dev-player');
    expect(getAuthDecision('development')).toEqual({
      kind: 'dev',
      playerId: 'dev-player',
    });
    expect(getAuthDecision('production')).toEqual({
      kind: 'unauthenticated',
    });
  });

  it('clears token, player, and selected guild together', () => {
    setAuth('private-token', 'discord-player', '123456789012345678');
    clearAuth();

    expect(getDiscordToken()).toBeNull();
    expect(getAuthDecision('production')).toEqual({
      kind: 'unauthenticated',
    });
  });
});
