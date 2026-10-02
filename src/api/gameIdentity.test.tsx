import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalGuildId,
  createGameIdentity,
  GameIdentityContext,
  getDevWorldSelection,
  NO_DEV_WORLD_SELECTION,
  parseDevWorldAllowlist,
  readWorldIdSelections,
  resetDevWorldSelection,
  resolveDevWorldSelection,
  setDevWorldSelection,
  useGameIdentityScope,
  type GameIdentity,
} from './gameIdentity';

const WORLD_A = '123456789012345678';
const WORLD_B = '223456789012345678';

const allowlist = (ids: string) =>
  resolveDevWorldSelection({
    mode: 'development',
    allowlist: ids,
    devWorldId: ids.split(',')[0],
  });

function devIdentity(input: {
  playerId?: string | null;
  devWorldId?: string;
  selected?: string;
  authSessionId?: number;
  devPlayerIdOverride?: string | null;
}): GameIdentity {
  return createGameIdentity({
    authKind: 'dev',
    playerId: input.playerId ?? 'player-1',
    mode: 'development',
    authSessionId: input.authSessionId ?? 0,
    devPlayerIdOverride: input.devPlayerIdOverride,
    devWorld: resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: input.devWorldId ?? WORLD_A,
      selectedWorldIds: input.selected === undefined ? [] : [input.selected],
    }),
  });
}

beforeEach(() => {
  resetDevWorldSelection();
});

describe('canonicalGuildId', () => {
  it('accepts only a canonical non-zero uint64', () => {
    expect(canonicalGuildId(WORLD_A)).toBe(WORLD_A);
    expect(canonicalGuildId('18446744073709551615')).toBe(
      '18446744073709551615'
    );
    for (const value of [
      '',
      null,
      undefined,
      '0',
      '0123',
      '1.5',
      '-1',
      ' 123',
      '123 ',
      'guild',
      '18446744073709551616',
    ]) {
      expect(canonicalGuildId(value as string | null)).toBeNull();
    }
  });
});

describe('parseDevWorldAllowlist', () => {
  it('is disabled when the list is absent or blank', () => {
    expect(parseDevWorldAllowlist(undefined)).toEqual({
      ids: [],
      enabled: false,
      refusal: null,
    });
    expect(parseDevWorldAllowlist('   ')).toEqual({
      ids: [],
      enabled: false,
      refusal: null,
    });
  });

  it('reads the configured canonical ids in order', () => {
    expect(parseDevWorldAllowlist(` ${WORLD_A} , ${WORLD_B} `)).toEqual({
      ids: [WORLD_A, WORLD_B],
      enabled: true,
      refusal: null,
    });
  });

  it('refuses a malformed entry instead of widening or narrowing access', () => {
    for (const raw of [`${WORLD_A},oops`, `${WORLD_A},`, '0', ' 1 2']) {
      const parsed = parseDevWorldAllowlist(raw);
      expect(parsed.ids).toEqual([]);
      expect(parsed.enabled).toBe(true);
      expect(parsed.refusal).toBeTruthy();
    }
  });

  it('refuses a repeated world', () => {
    const parsed = parseDevWorldAllowlist(`${WORLD_A},${WORLD_B},${WORLD_A}`);
    expect(parsed.ids).toEqual([]);
    expect(parsed.refusal).toContain(WORLD_A);
  });
});

describe('resolveDevWorldSelection', () => {
  it('preserves the existing fixed development world without an allowlist', () => {
    expect(
      resolveDevWorldSelection({
        mode: 'development',
        allowlist: undefined,
        devWorldId: undefined,
      })
    ).toEqual({
      worldId: 'test-world',
      sendsGuildSelector: false,
      refusal: null,
    });
    expect(
      resolveDevWorldSelection({
        mode: 'development',
        allowlist: '  ',
        devWorldId: ' local-world ',
      })
    ).toEqual({
      worldId: 'local-world',
      sendsGuildSelector: false,
      refusal: null,
    });
  });

  it('ignores the selector and the list outside development mode', () => {
    for (const mode of ['production', 'test', 'staging']) {
      expect(
        resolveDevWorldSelection({
          mode,
          allowlist: `${WORLD_A},${WORLD_B}`,
          devWorldId: WORLD_A,
          selectedWorldIds: [WORLD_B],
        })
      ).toEqual(NO_DEV_WORLD_SELECTION);
    }
  });

  it('uses the configured default and sends the selector when the allowlist is enabled', () => {
    expect(allowlist(`${WORLD_A},${WORLD_B}`)).toEqual({
      worldId: WORLD_A,
      sendsGuildSelector: true,
      refusal: null,
    });
  });

  it('accepts exactly one allowed selector', () => {
    expect(
      resolveDevWorldSelection({
        mode: 'development',
        allowlist: `${WORLD_A},${WORLD_B}`,
        devWorldId: WORLD_A,
        selectedWorldIds: [WORLD_B],
      })
    ).toEqual({
      worldId: WORLD_B,
      sendsGuildSelector: true,
      refusal: null,
    });
  });

  it('refuses an unknown, malformed or repeated selector instead of falling back', () => {
    const unknown = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: WORLD_A,
      selectedWorldIds: ['323456789012345678'],
    });
    expect(unknown.worldId).toBeNull();
    expect(unknown.refusal).toContain('323456789012345678');

    const malformed = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: WORLD_A,
      selectedWorldIds: [''],
    });
    expect(malformed.worldId).toBeNull();
    expect(malformed.refusal).toBeTruthy();

    const repeated = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: WORLD_A,
      selectedWorldIds: [WORLD_A, WORLD_B],
    });
    expect(repeated.worldId).toBeNull();
    expect(repeated.refusal).toContain('exactly one');
  });

  it('requires the configured default to be one of the allowed worlds', () => {
    const missing = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: '',
    });
    expect(missing.worldId).toBeNull();
    expect(missing.refusal).toContain('VITE_DEV_WORLD_ID');

    const foreign = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_B}`,
      devWorldId: 'test-world',
    });
    expect(foreign.worldId).toBeNull();
    expect(foreign.refusal).toContain('VITE_DEV_WORLD_ID');
  });

  it('refuses a malformed allowlist even when the selector looks valid', () => {
    const resolved = resolveDevWorldSelection({
      mode: 'development',
      allowlist: `${WORLD_A},${WORLD_A}`,
      devWorldId: WORLD_A,
      selectedWorldIds: [WORLD_A],
    });
    expect(resolved.worldId).toBeNull();
    expect(resolved.refusal).toBeTruthy();
  });
});

describe('readWorldIdSelections', () => {
  it('keeps every worldId value so ambiguity can be refused', () => {
    expect(readWorldIdSelections('?worldId=1&worldId=2&playerId=p')).toEqual([
      '1',
      '2',
    ]);
    expect(readWorldIdSelections('?playerId=p')).toEqual([]);
  });
});

describe('createGameIdentity', () => {
  it('builds an opaque, unambiguous scope key with no credential material', () => {
    const identity = createGameIdentity({
      authKind: 'discord',
      playerId: 'player-1',
      guildId: WORLD_A,
      mode: 'production',
      authSessionId: 3,
      devWorld: { worldId: WORLD_B, sendsGuildSelector: true, refusal: null },
    });
    expect(identity.worldId).toBe(WORLD_A);
    expect(identity.scopeKey).toBe(
      `game:["discord","player-1","${WORLD_A}",3]`
    );

    // Distinct in every dimension, including the credential epoch.
    const keys = new Set([
      identity.scopeKey,
      createGameIdentity({
        authKind: 'discord',
        playerId: 'player-2',
        guildId: WORLD_A,
        mode: 'production',
        authSessionId: 3,
        devWorld: NO_DEV_WORLD_SELECTION,
      }).scopeKey,
      createGameIdentity({
        authKind: 'discord',
        playerId: 'player-1',
        guildId: WORLD_B,
        mode: 'production',
        authSessionId: 3,
        devWorld: NO_DEV_WORLD_SELECTION,
      }).scopeKey,
      createGameIdentity({
        authKind: 'discord',
        playerId: 'player-1',
        guildId: WORLD_A,
        mode: 'production',
        authSessionId: 4,
        devWorld: NO_DEV_WORLD_SELECTION,
      }).scopeKey,
      createGameIdentity({
        authKind: 'dev',
        playerId: 'player-1',
        mode: 'development',
        authSessionId: 3,
        devWorld: allowlist(WORLD_A),
      }).scopeKey,
    ]);
    expect(keys.size).toBe(5);

    // A hand-joined key could be forged (a world id containing the separator);
    // the tuple cannot.
    const forged = createGameIdentity({
      authKind: 'discord',
      playerId: 'player:1',
      guildId: '2',
      mode: 'production',
      authSessionId: 3,
      devWorld: NO_DEV_WORLD_SELECTION,
    });
    const honest = createGameIdentity({
      authKind: 'discord',
      playerId: 'player',
      guildId: '1:2',
      mode: 'production',
      authSessionId: 3,
      devWorld: NO_DEV_WORLD_SELECTION,
    });
    expect(forged.scopeKey).not.toBe(honest.scopeKey);
  });

  it('gives Discord credentials their own guild world and ignores the Dev selection', () => {
    const identity = createGameIdentity({
      authKind: 'discord',
      playerId: 'player-1',
      guildId: '0123',
      mode: 'development',
      authSessionId: 1,
      devPlayerIdOverride: 'player-2',
      devWorld: {
        worldId: null,
        sendsGuildSelector: false,
        refusal: 'invalid dev selection',
      },
    });
    expect(identity.kind).toBe('discord');
    expect(identity.playerId).toBe('player-1');
    expect(identity.worldId).toBeNull();
    expect(identity.worldSelectionError).toBeNull();
  });

  it('binds a development identity to the selected world, player override and epoch', () => {
    const a = devIdentity({
      authSessionId: 2,
      devPlayerIdOverride: 'tab-player',
      selected: WORLD_A,
    });
    expect(a.kind).toBe('dev');
    expect(a.playerId).toBe('tab-player');
    expect(a.worldId).toBe(WORLD_A);
    expect(a.worldSelectionError).toBeNull();

    const b = devIdentity({ authSessionId: 2, selected: WORLD_B });
    expect(b.worldId).toBe(WORLD_B);
    expect(b.scopeKey).not.toBe(a.scopeKey);
  });

  it('carries the refusal of an invalid selection into the identity', () => {
    const identity = createGameIdentity({
      authKind: 'dev',
      playerId: 'player-1',
      mode: 'development',
      authSessionId: 0,
      devWorld: resolveDevWorldSelection({
        mode: 'development',
        allowlist: `${WORLD_A},${WORLD_B}`,
        devWorldId: WORLD_A,
        selectedWorldIds: ['999'],
      }),
    });
    expect(identity.worldId).toBeNull();
    expect(identity.worldSelectionError).toContain('999');
  });

  it('cannot build a development identity outside development mode', () => {
    const identity = createGameIdentity({
      authKind: 'dev',
      playerId: 'player-1',
      mode: 'production',
      authSessionId: 0,
      devWorld: allowlist(WORLD_A),
    });
    expect(identity.kind).toBe('unauthenticated');
    expect(identity.playerId).toBeNull();
    expect(identity.worldId).toBeNull();
  });

  it('has no player and no world when unauthenticated', () => {
    const identity = createGameIdentity({
      authKind: 'unauthenticated',
      playerId: null,
      mode: 'production',
      authSessionId: 7,
      devWorld: NO_DEV_WORLD_SELECTION,
    });
    expect(identity.kind).toBe('unauthenticated');
    expect(identity.playerId).toBeNull();
    expect(identity.worldId).toBeNull();
    expect(identity.scopeKey).toContain('"unauthenticated"');
  });
});

describe('development world transport binding', () => {
  it('starts empty and publishes exactly what the boundary installed', () => {
    expect(getDevWorldSelection()).toEqual(NO_DEV_WORLD_SELECTION);
    const selection = allowlist(WORLD_B);
    setDevWorldSelection(selection);
    expect(getDevWorldSelection()).toEqual(selection);
    resetDevWorldSelection();
    expect(getDevWorldSelection()).toEqual(NO_DEV_WORLD_SELECTION);
  });
});

describe('useGameIdentityScope', () => {
  function wrapper(value: GameIdentity) {
    return ({ children }: { children: ReactNode }) =>
      createElement(GameIdentityContext.Provider, { value }, children);
  }

  it('returns the full world/player/epoch scope inside the boundary', () => {
    const identity = devIdentity({ authSessionId: 5 });
    const { result } = renderHook(() => useGameIdentityScope('player-1'), {
      wrapper: wrapper(identity),
    });
    expect(result.current).toBe(identity.scopeKey);
  });

  it('marks an out-of-boundary fallback so it cannot be mistaken for a world identity', () => {
    const { result } = renderHook(() => useGameIdentityScope('player-1'));
    expect(result.current).toBe('unscoped\u0000player-1');
    expect(result.current).not.toBe(devIdentity({ authSessionId: 5 }).scopeKey);
  });
});
