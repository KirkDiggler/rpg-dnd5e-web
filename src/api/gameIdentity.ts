/**
 * The one browser identity value every world/player-scoped consumer shares.
 *
 * `GameIdentity` is derived in exactly one place (the App identity boundary)
 * from the same non-secret auth decision the transport uses:
 *
 * - `kind` — which credential scheme authorizes this client
 *   (`discord` credential, explicit development `dev` player, or nothing).
 * - `playerId` — the id the transport attributes requests to.
 * - `worldId` — the trusted world: the Discord guild for real credentials, or
 *   the explicitly selected development world for a Dev identity. The API
 *   still owns authority; this value only says which world the client believes
 *   it is acting in, and it is never a new gameplay request field.
 * - `authSessionId` — the existing opaque credential epoch from the Discord
 *   provider. Runtime caches/keys include it; durable local draft keys do not.
 *
 * `scopeKey` is an opaque, unambiguous serialization of exactly those four
 * fields. It never contains token material. Consumers use it to key the
 * stateful game subtree and to scope request caches instead of adding a
 * WorldID to gameplay message shapes.
 *
 * This module also owns the development-only world selector contract
 * (`VITE_DEV_WORLD_IDS` allowlist plus `?worldId=<allowed>`), the transport
 * binding the auth interceptor reads at dispatch, and the React context the
 * identity is published through. Real Discord credentials always win: the Dev
 * selector is resolved and honored only for a `dev` identity.
 */
import { createContext, useContext } from 'react';

/** Largest value a canonical guild-shaped (uint64) id can hold. */
const MAX_UINT64 = 18_446_744_073_709_551_615n;

/**
 * Fixed development world used when no explicit Dev world allowlist is
 * configured. This preserves the pre-#522 single-world local behavior.
 */
export const DEFAULT_DEV_WORLD_ID = 'test-world';

export type GameIdentityKind = 'discord' | 'dev' | 'unauthenticated';

export interface GameIdentity {
  readonly kind: GameIdentityKind;
  readonly playerId: string | null;
  readonly worldId: string | null;
  readonly authSessionId: number;
  /** Opaque cache/subtree key. Never a credential or token. */
  readonly scopeKey: string;
  /**
   * Development-only refusal reason. When set, the requested Dev world
   * selection was invalid: no gameplay request may be sent and the UI must
   * refuse rather than fall back to the default world.
   */
  readonly worldSelectionError: string | null;
}

/**
 * Canonical Discord guild-shaped id: non-zero uint64, no leading zeros, no
 * signs or whitespace. Returns null for anything else, including a missing
 * guild — a Discord identity without a usable guild has no world.
 */
export function canonicalGuildId(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  try {
    if (BigInt(value) > MAX_UINT64) return null;
  } catch {
    return null;
  }
  return value;
}

export interface DevWorldAllowlist {
  /** Canonical ids in configured order; empty when the allowlist is absent. */
  readonly ids: readonly string[];
  /** True when VITE_DEV_WORLD_IDS names at least one entry. */
  readonly enabled: boolean;
  /**
   * Set when the configured allowlist itself is malformed or repeats an entry.
   * A bad configuration is refused, never silently narrowed or broadened.
   */
  readonly refusal: string | null;
}

/**
 * Parse the comma-separated `VITE_DEV_WORLD_IDS` development allowlist.
 * Malformed, empty and duplicate entries refuse the whole allowlist; each id
 * must be canonical and unique, so a typo can never widen access.
 */
export function parseDevWorldAllowlist(
  raw: string | null | undefined
): DevWorldAllowlist {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return { ids: [], enabled: false, refusal: null };

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of trimmed.split(',')) {
    const id = canonicalGuildId(entry.trim());
    if (!id) {
      return {
        ids: [],
        enabled: true,
        refusal: `VITE_DEV_WORLD_IDS entry ${JSON.stringify(
          entry.trim()
        )} is not a canonical non-zero guild-shaped ID.`,
      };
    }
    if (seen.has(id)) {
      return {
        ids: [],
        enabled: true,
        refusal: `VITE_DEV_WORLD_IDS lists ${id} more than once.`,
      };
    }
    seen.add(id);
    ids.push(id);
  }
  return { ids, enabled: true, refusal: null };
}

export interface DevWorldSelection {
  /** Dev world this identity and its Dev requests are bound to. */
  readonly worldId: string | null;
  /**
   * True only when an explicit allowlist selected the world, so the
   * `x-rpg-guild-id` selector is authoritative for Dev RPCs. Without the
   * allowlist the existing fixed Dev world is used and no selector is sent.
   */
  readonly sendsGuildSelector: boolean;
  /** Set when the selection must refuse gameplay instead of falling back. */
  readonly refusal: string | null;
}

/** No Dev world: production, unauthenticated, or a refused selection. */
export const NO_DEV_WORLD_SELECTION: DevWorldSelection = {
  worldId: null,
  sendsGuildSelector: false,
  refusal: null,
};

/**
 * Every `?worldId=` value in a URL search string, in order. Multiple values
 * are preserved (not collapsed) so an ambiguous selection can be refused.
 */
export function readWorldIdSelections(search: string): string[] {
  try {
    return new URLSearchParams(search).getAll('worldId');
  } catch {
    return [];
  }
}

/**
 * Resolve the development world selection.
 *
 * - Without a configured allowlist the existing fixed-dev-world behavior is
 *   preserved: one configured world, no client-chosen selector.
 * - With a nonempty allowlist, `VITE_DEV_WORLD_ID` is the default and must be
 *   one of `VITE_DEV_WORLD_IDS`; a single `?worldId=` must be an allowed id.
 *   Unknown, malformed or repeated selectors refuse rather than fall back.
 * - Outside development mode the selection is always empty: setting the list
 *   alone can never enable a client-selected world in production.
 */
export function resolveDevWorldSelection(input: {
  mode: string;
  /** Raw VITE_DEV_WORLD_IDS value. */
  allowlist?: string | null;
  /** Raw VITE_DEV_WORLD_ID default. */
  devWorldId?: string | null;
  /** Every ?worldId= value in URL order. */
  selectedWorldIds?: readonly string[];
  defaultWorldId?: string;
}): DevWorldSelection {
  const allowlist = parseDevWorldAllowlist(input.allowlist);
  if (allowlist.refusal) {
    return {
      worldId: null,
      sendsGuildSelector: false,
      refusal: allowlist.refusal,
    };
  }
  if (input.mode !== 'development') return NO_DEV_WORLD_SELECTION;

  const configuredDefault = input.devWorldId?.trim() ?? '';
  if (!allowlist.enabled) {
    return {
      worldId:
        configuredDefault || input.defaultWorldId || DEFAULT_DEV_WORLD_ID,
      sendsGuildSelector: false,
      refusal: null,
    };
  }

  const defaultWorldId = canonicalGuildId(configuredDefault);
  if (!defaultWorldId || !allowlist.ids.includes(defaultWorldId)) {
    return {
      worldId: null,
      sendsGuildSelector: false,
      refusal: `VITE_DEV_WORLD_ID must be set to one of VITE_DEV_WORLD_IDS (${allowlist.ids.join(
        ', '
      )}) while the Dev world allowlist is enabled.`,
    };
  }

  const selected = input.selectedWorldIds ?? [];
  if (selected.length > 1) {
    return {
      worldId: null,
      sendsGuildSelector: false,
      refusal: `Select exactly one Dev world with ?worldId=; received ${selected.length}.`,
    };
  }
  if (selected.length === 1) {
    const id = canonicalGuildId(selected[0].trim());
    if (!id) {
      return {
        worldId: null,
        sendsGuildSelector: false,
        refusal: `?worldId=${JSON.stringify(
          selected[0]
        )} is not a canonical non-zero guild-shaped ID.`,
      };
    }
    if (!allowlist.ids.includes(id)) {
      return {
        worldId: null,
        sendsGuildSelector: false,
        refusal: `?worldId=${id} is not in VITE_DEV_WORLD_IDS (${allowlist.ids.join(
          ', '
        )}).`,
      };
    }
    return { worldId: id, sendsGuildSelector: true, refusal: null };
  }

  return {
    worldId: defaultWorldId,
    sendsGuildSelector: true,
    refusal: null,
  };
}

function scopeKeyFor(identity: Omit<GameIdentity, 'scopeKey'>): string {
  // A JSON tuple is unambiguous for any of these string values (no separator
  // can be forged inside a field), unlike a hand-joined `a:b:c` string.
  return `game:${JSON.stringify([
    identity.kind,
    identity.playerId,
    identity.worldId,
    identity.authSessionId,
  ])}`;
}

/**
 * Build the single GameIdentity from the same decision the transport uses.
 * The Dev selector is honored only for a development `dev` identity; a
 * Discord credential always carries its own verified guild.
 */
export function createGameIdentity(input: {
  authKind: GameIdentityKind;
  /** Player id the transport attributes requests to (null when unauthenticated). */
  playerId: string | null;
  /** Discord guild of the current credential, raw and unverified. */
  guildId?: string | null;
  mode: string;
  authSessionId: number;
  /** Development-only `?playerId=` override, which the transport also uses. */
  devPlayerIdOverride?: string | null;
  devWorld: DevWorldSelection;
}): GameIdentity {
  const base: Omit<GameIdentity, 'scopeKey'> =
    input.authKind === 'discord'
      ? {
          kind: 'discord',
          playerId: input.playerId,
          worldId: canonicalGuildId(input.guildId),
          authSessionId: input.authSessionId,
          worldSelectionError: null,
        }
      : input.authKind === 'dev' && input.mode === 'development'
        ? {
            kind: 'dev',
            playerId:
              input.devPlayerIdOverride?.trim() || input.playerId || null,
            worldId: input.devWorld.worldId,
            authSessionId: input.authSessionId,
            worldSelectionError: input.devWorld.refusal,
          }
        : {
            kind: 'unauthenticated',
            playerId: null,
            worldId: null,
            authSessionId: input.authSessionId,
            worldSelectionError: null,
          };
  return { ...base, scopeKey: scopeKeyFor(base) };
}

/**
 * Transport-visible Dev world binding, installed by the App identity boundary
 * before any child effect can dispatch a request and read by the auth
 * interceptor at dispatch time.
 */
let devWorldSelection: DevWorldSelection = NO_DEV_WORLD_SELECTION;

export function setDevWorldSelection(selection: DevWorldSelection): void {
  devWorldSelection = selection;
}

export function getDevWorldSelection(): DevWorldSelection {
  return devWorldSelection;
}

export function resetDevWorldSelection(): void {
  devWorldSelection = NO_DEV_WORLD_SELECTION;
}

/** Published by the App identity boundary; null outside it (tests, tools). */
export const GameIdentityContext = createContext<GameIdentity | null>(null);

export function useGameIdentity(): GameIdentity | null {
  return useContext(GameIdentityContext);
}

/**
 * World/player/auth-epoch scope for a private cache or view key.
 *
 * Inside the application boundary this is always the full identity scope key,
 * never a bare player id. `fallbackScope` exists only for a view rendered
 * outside the boundary (component tests, isolated harnesses) and is marked
 * `unscoped` so it can never be mistaken for a real world identity.
 */
export function useGameIdentityScope(fallbackScope: string): string {
  const identity = useContext(GameIdentityContext);
  return identity ? identity.scopeKey : `unscoped\u0000${fallbackScope}`;
}
