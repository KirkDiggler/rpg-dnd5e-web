/**
 * World/identity isolation at the App boundary (web#522 / S6a).
 *
 * These tests exercise the real identity boundary and the real hooks it
 * scopes — the stateful game subtree, the resume lookup and the private
 * character cache — plus the transport binding the auth interceptor reads.
 * They are not a re-test of the pure scope-key helper.
 *
 * They do NOT prove the joined local stack (that is the parent's browser walk,
 * reported separately as not yet proved).
 */
import type { GetMyActiveLobbyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { GameIdentityBoundary } from './App';
import { clearAuth, setAuth } from './api/auth';
import {
  createGameIdentity,
  getDevWorldSelection,
  NO_DEV_WORLD_SELECTION,
  resetDevWorldSelection,
  resolveDevWorldSelection,
  type GameIdentity,
} from './api/gameIdentity';
import { CharacterDraftProvider } from './character/creation/CharacterDraftContext';
import { useCharacterDraft } from './character/creation/useCharacterDraft';

const WORLD_A = '123456789012345678';
const WORLD_B = '223456789012345678';
const ALLOWLIST = `${WORLD_A},${WORLD_B}`;
const PLAYER = 'player-P';

const hoisted = vi.hoisted(() => ({
  lobbyCharacter: {
    characterId: undefined as string | undefined,
    loading: false,
    error: null as Error | null,
  },
  getMyActiveLobbyFn: vi.fn<() => Promise<GetMyActiveLobbyResponse>>(),
  createDraftFn: vi.fn<(request: unknown) => Promise<unknown>>(),
  getDraftFn: vi.fn<(request: unknown) => Promise<unknown>>(),
  carouselRenders: [] as Array<{
    selectedId: string | null;
    selectedType: unknown;
  }>,
  gameViewScopes: [] as string[],
  discord: {
    user: null as null | { id: string },
    isDiscord: false,
    isReady: true,
    isAuthenticated: false,
    error: null as string | null,
    guildId: null as string | null,
    grantedScopes: [] as string[],
    authSessionId: 0,
    authenticate: vi.fn(),
    clearAuthentication: vi.fn(),
    clearAuthenticationForSession: vi.fn(),
    isAuthenticationSessionCurrent: vi.fn((expected: number) => expected >= 0),
  },
}));

// The real auth module and the real useDevPlayerIdAuth hook are used on
// purpose: identity transitions here are driven the way the app drives them.
vi.mock('./discord', () => ({
  useDiscord: () => hoisted.discord,
  DiscordDebugPanel: () => null,
}));

vi.mock('./api/hooks', () => ({
  useListCharacters: () => ({ data: [], loading: false, error: null }),
  useListDrafts: () => ({ data: [], loading: false, error: null }),
  // CharacterDraftProvider's immutable rule catalogs. The provider itself is
  // real here so the keyed draft subtree is observable; the catalogs are inert.
  useListRaces: () => ({ data: [], loading: false, error: null }),
  useListClasses: () => ({ data: [], loading: false, error: null }),
  useListBackgrounds: () => ({ data: [], loading: false, error: null }),
  useCreateDraft: () => ({
    createDraft: hoisted.createDraftFn,
    loading: false,
    error: null,
  }),
  useUpdateDraftName: () => ({
    updateName: vi.fn(),
    loading: false,
    error: null,
  }),
  useUpdateDraftRace: () => ({
    updateRace: vi.fn(),
    loading: false,
    error: null,
  }),
  useUpdateDraftClass: () => ({
    updateClass: vi.fn(),
    loading: false,
    error: null,
  }),
  useUpdateDraftBackground: () => ({
    updateBackground: vi.fn(),
    loading: false,
    error: null,
  }),
  useUpdateDraftAbilityScores: () => ({
    updateAbilityScores: vi.fn(),
    loading: false,
    error: null,
  }),
  useUpdateDraftAppearance: () => ({
    updateAppearance: vi.fn(),
    loading: false,
    error: null,
  }),
  useFinalizeDraft: () => ({
    finalizeDraft: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('./api/client', () => ({
  lobbyClient: { getMyActiveLobby: hoisted.getMyActiveLobbyFn },
  characterClient: {
    createDraft: hoisted.createDraftFn,
    getDraft: hoisted.getDraftFn,
  },
  characterV2Client: { getCharacterData: vi.fn() },
}));

vi.mock('./api/useLobbyCharacterId', () => ({
  useLobbyCharacterId: () => hoisted.lobbyCharacter,
}));

vi.mock('./author/AuthorView', () => ({ AuthorView: () => null }));
vi.mock('./author/DungeonBuilderHomeButton', () => ({
  DungeonBuilderHomeButton: () => null,
}));
vi.mock('./character/creation/InteractiveCharacterSheet', () => ({
  InteractiveCharacterSheet: () => <div>Character Creation</div>,
}));
vi.mock('./character/level-up/LevelUpView', () => ({
  LevelUpView: () => <div>Level Up</div>,
}));
vi.mock('./character/sheet/CharacterSheet', () => ({
  CharacterSheet: () => <div>Character Sheet</div>,
}));
vi.mock('./components/ThemeSelector', () => ({
  ThemeSelector: () => null,
}));
vi.mock('./concepts/ConceptsView', () => ({ ConceptsView: () => null }));
vi.mock('./concepts/world-building/WorldBuilderWorkspace', () => ({
  WorldBuilderWorkspace: () => null,
}));
vi.mock('./compositions/rpcCompositionSource', () => ({
  createRpcCompositionSource: () => undefined,
}));
vi.mock('./toolkit-contributor-sandbox/route', () => ({
  isToolkitContributorSandboxRoute: () => false,
}));
vi.mock('./dev/attackDiePerfRoute', () => ({
  selectAttackDieDevRoute: () => ({ kind: 'normal' }),
}));
vi.mock('./dev/prop-calibration/route', () => ({
  isPropCalibrationRoute: () => false,
}));
vi.mock('./dev/asset-review/route', () => ({
  isAssetReviewRoute: () => false,
}));

vi.mock('./components/home', () => ({
  CharacterCarousel: ({
    selectedId,
    selectedType,
    onSelect,
  }: {
    selectedId: string | null;
    selectedType?: 'character' | 'draft' | null;
    onSelect: (id: string, type: 'character' | 'draft') => void;
  }) => {
    hoisted.carouselRenders.push({ selectedId, selectedType });
    return (
      <div data-testid="carousel" data-selected-id={selectedId ?? ''}>
        Home View
        <button onClick={() => onSelect('char-9', 'character')}>
          Select test character
        </button>
      </div>
    );
  },
  SelectedCharacterPanel: () => null,
}));

// The game subtree consumes the real identity context, so this probe proves
// which scope key reaches the session/game view.
vi.mock('./components/game/GameView', async () => {
  const { useGameIdentityScope } = await import('./api/gameIdentity');
  return {
    GameView: ({
      characterId,
      initialEncounterId,
      onBack,
    }: {
      characterId?: string;
      initialEncounterId?: string;
      onBack?: () => void;
    }) => {
      const scope = useGameIdentityScope('none');
      hoisted.gameViewScopes.push(scope);
      return (
        <div
          data-testid="game-view"
          data-character-id={characterId}
          data-encounter-id={initialEncounterId}
          data-scope={scope}
        >
          Game View
          <button onClick={onBack}>Back to main menu</button>
        </div>
      );
    },
  };
});

vi.mock('./world/WorldAccessSettings', () => ({
  WorldAccessSettings: ({ worldId }: { worldId: string | null }) => (
    <div data-testid="world-settings" data-world-id={worldId ?? ''} />
  ),
}));

/** The real draft context, probed so a remount is observable. */
function DraftProbe({ identity }: { identity: GameIdentity }) {
  const draft = useCharacterDraft();
  return (
    <div>
      <span data-testid="draft-probe">{draft.draftId ?? 'none'}</span>
      <span data-testid="draft-probe-scope">{identity.scopeKey}</span>
      <button
        onClick={() => {
          void draft.createDraft(PLAYER, 'test-session');
        }}
      >
        make draft
      </button>
    </div>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A transition in a real browser reloads the page; a rerender with the new
 * URL exercises the same identity-derivation code path. */
function setSearch(search: string): void {
  window.history.replaceState(
    {},
    '',
    search.startsWith('/') ? search : `/${search}`
  );
}

const emptyLobby = {
  lobbyId: '',
  encounterId: '',
  lobbyStatus: 0,
} as GetMyActiveLobbyResponse;

function developmentWorldConfig(): void {
  vi.stubEnv('MODE', 'development');
  vi.stubEnv('VITE_DEV_WORLD_IDS', ALLOWLIST);
  vi.stubEnv('VITE_DEV_WORLD_ID', WORLD_A);
  vi.stubEnv('VITE_DEV_PLAYER_ID', PLAYER);
}

function expectedDevScope(worldId: string, authSessionId = 0, player = PLAYER) {
  return createGameIdentity({
    authKind: 'dev',
    playerId: player,
    mode: 'development',
    authSessionId,
    devWorld: resolveDevWorldSelection({
      mode: 'development',
      allowlist: ALLOWLIST,
      devWorldId: WORLD_A,
      selectedWorldIds: [worldId],
    }),
  }).scopeKey;
}

beforeEach(() => {
  hoisted.lobbyCharacter.characterId = undefined;
  hoisted.lobbyCharacter.loading = false;
  hoisted.lobbyCharacter.error = null;
  hoisted.getMyActiveLobbyFn.mockReset();
  hoisted.getMyActiveLobbyFn.mockResolvedValue(emptyLobby);
  hoisted.createDraftFn.mockReset();
  hoisted.getDraftFn.mockReset();
  hoisted.carouselRenders.length = 0;
  hoisted.gameViewScopes.length = 0;
  hoisted.discord.user = null;
  hoisted.discord.isDiscord = false;
  hoisted.discord.isReady = true;
  hoisted.discord.isAuthenticated = false;
  hoisted.discord.error = null;
  hoisted.discord.guildId = null;
  hoisted.discord.grantedScopes = [];
  hoisted.discord.authSessionId = 0;
  clearAuth();
  resetDevWorldSelection();
  setSearch('/');
});

afterEach(() => {
  clearAuth();
  resetDevWorldSelection();
  vi.unstubAllEnvs();
  setSearch('/');
});

describe('App identity transitions', () => {
  it('shows no world-A selection on the first render of world B', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    const view = render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select test character' })
    );
    expect(screen.getByTestId('carousel').dataset.selectedId).toBe('char-9');
    expect(screen.getByTestId('dev-world-identity-world').textContent).toBe(
      WORLD_A
    );

    hoisted.carouselRenders.length = 0;
    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(<App />);

    // Nothing from world A survives into world B: not the selection, not the
    // identity label.
    expect(screen.queryByTestId('carousel')?.dataset.selectedId ?? '').toBe('');
    expect(screen.queryByText('char-9')).toBeNull();

    await waitFor(() =>
      expect(screen.getByTestId('carousel').dataset.selectedId).toBe('')
    );
    expect(hoisted.carouselRenders[0]?.selectedId).toBeNull();
    expect(screen.getByTestId('dev-world-identity-world').textContent).toBe(
      WORLD_B
    );
  });

  it('clears the selection when the same world re-authenticates a different player', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}&playerId=${PLAYER}`);
    const view = render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select test character' })
    );
    expect(screen.getByTestId('carousel').dataset.selectedId).toBe('char-9');

    setSearch(`/?worldId=${WORLD_A}&playerId=player-Q`);
    view.rerender(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('carousel').dataset.selectedId).toBe('')
    );
    expect(screen.getByTestId('dev-world-identity-player').textContent).toBe(
      'player-Q'
    );
  });

  it('clears runtime state when the same player and world get a new credential epoch', async () => {
    developmentWorldConfig();
    setAuth('private-token', 'player-D', WORLD_A);
    hoisted.discord.user = { id: 'player-D' };
    hoisted.discord.isDiscord = true;
    hoisted.discord.isAuthenticated = true;
    hoisted.discord.authSessionId = 5;
    const view = render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select test character' })
    );
    expect(screen.getByTestId('carousel').dataset.selectedId).toBe('char-9');

    hoisted.discord.authSessionId = 6;
    view.rerender(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('carousel').dataset.selectedId).toBe('')
    );
    expect(screen.getByTestId('dev-world-identity-world').textContent).toBe(
      WORLD_A
    );
    expect(screen.getByTestId('dev-world-identity-epoch').textContent).toBe(
      'epoch 6'
    );
  });

  it('drops a held world-A lobby answer, looks up world B, and binds B for the transport', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    const heldWorldA = deferred<GetMyActiveLobbyResponse>();
    hoisted.getMyActiveLobbyFn
      .mockReturnValueOnce(heldWorldA.promise)
      .mockResolvedValue(emptyLobby);

    const view = render(<App />);
    await waitFor(() =>
      expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(1)
    );
    // The transport binding the auth interceptor reads at dispatch.
    expect(getDevWorldSelection()).toEqual({
      worldId: WORLD_A,
      sendsGuildSelector: true,
      refusal: null,
    });

    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(<App />);
    await waitFor(() =>
      expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(2)
    );
    expect(getDevWorldSelection()).toEqual({
      worldId: WORLD_B,
      sendsGuildSelector: true,
      refusal: null,
    });

    // World A's answer named a RUNNING encounter. Released, it must not route
    // this client into world A's session.
    await act(async () => {
      heldWorldA.resolve({
        lobbyId: 'lobby-a',
        encounterId: 'enc-a',
        lobbyStatus: 2,
      } as GetMyActiveLobbyResponse);
      await heldWorldA.promise;
    });

    expect(screen.queryByTestId('game-view')).toBeNull();
    expect(screen.queryByText('Game View')).toBeNull();
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(2);
  });

  it('hands the current identity scope, not a bare player id, into the game subtree', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_B}`);
    hoisted.getMyActiveLobbyFn.mockResolvedValue({
      lobbyId: 'lobby-b',
      encounterId: 'enc-b',
      lobbyStatus: 2,
    } as GetMyActiveLobbyResponse);
    hoisted.lobbyCharacter.characterId = 'char-b';

    render(<App />);

    const game = await screen.findByTestId('game-view');
    expect(game.dataset.scope).toBe(expectedDevScope(WORLD_B));
    expect(game.dataset.scope).not.toBe(PLAYER);
    expect(game.dataset.scope).toContain(WORLD_B);
  });

  it('refuses an unknown local world instead of falling back to the default', async () => {
    developmentWorldConfig();
    setSearch('/?worldId=999999999999999999');

    render(<App />);

    expect(screen.getByTestId('dev-world-selection-refusal')).toBeTruthy();
    expect(screen.queryByText('Home View')).toBeNull();
    // No gameplay request of any kind, and the transport refuses too.
    expect(hoisted.getMyActiveLobbyFn).not.toHaveBeenCalled();
    expect(hoisted.createDraftFn).not.toHaveBeenCalled();
    expect(getDevWorldSelection().refusal).toBeTruthy();
    expect(getDevWorldSelection().worldId).toBeNull();
  });

  it('keeps real Discord credentials on the SDK guild and ignores the Dev selector', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_B}`);
    setAuth('private-token', 'player-D', WORLD_A);
    hoisted.discord.user = { id: 'player-D' };
    hoisted.discord.isDiscord = true;
    hoisted.discord.isAuthenticated = true;

    render(<App />);

    expect(screen.getByTestId('dev-world-identity-kind').textContent).toBe(
      'discord'
    );
    expect(screen.getByTestId('dev-world-identity-world').textContent).toBe(
      WORLD_A
    );
    expect(screen.getByTestId('dev-world-identity-player').textContent).toBe(
      'player-D'
    );
    // A Dev selector never binds for a Discord credential.
    expect(getDevWorldSelection()).toEqual(NO_DEV_WORLD_SELECTION);
  });

  it('cannot enable the Dev world selector from configuration alone in production', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_DEV_WORLD_IDS', ALLOWLIST);
    vi.stubEnv('VITE_DEV_WORLD_ID', WORLD_A);
    setAuth(null, PLAYER);
    setSearch(`/?worldId=${WORLD_B}`);

    render(<App />);

    expect(screen.queryByTestId('dev-world-selection-refusal')).toBeNull();
    expect(screen.queryByTestId('dev-world-identity')).toBeNull();
    expect(getDevWorldSelection()).toEqual(NO_DEV_WORLD_SELECTION);
  });
});

function boundaryTree() {
  return (
    <GameIdentityBoundary>
      {(identity) => (
        <CharacterDraftProvider>
          <DraftProbe identity={identity} />
        </CharacterDraftProvider>
      )}
    </GameIdentityBoundary>
  );
}

describe('keyed stateful subtree', () => {
  it('clears the draft subtree on an identity change and keeps A/B drafts apart', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    hoisted.createDraftFn
      .mockResolvedValueOnce({ draft: { id: 'draft-a' } })
      .mockResolvedValueOnce({ draft: { id: 'draft-b' } });

    const view = render(boundaryTree());

    fireEvent.click(screen.getByRole('button', { name: 'make draft' }));
    await waitFor(() =>
      expect(screen.getByTestId('draft-probe').textContent).toBe('draft-a')
    );
    const scopeA = screen.getByTestId('draft-probe-scope').textContent;

    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(boundaryTree());

    // First render under world B: the stateful draft subtree was remounted, so
    // world A's draft id is already gone.
    expect(screen.getByTestId('draft-probe').textContent).toBe('none');
    expect(screen.getByTestId('draft-probe-scope').textContent).not.toBe(
      scopeA
    );

    fireEvent.click(screen.getByRole('button', { name: 'make draft' }));
    await waitFor(() =>
      expect(screen.getByTestId('draft-probe').textContent).toBe('draft-b')
    );
    expect(hoisted.createDraftFn).toHaveBeenCalledTimes(2);
  });

  it('releases a held world-A creation response and emits no follow-up request under world B', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    const heldCreate = deferred<unknown>();
    hoisted.createDraftFn.mockReturnValueOnce(heldCreate.promise);

    const view = render(boundaryTree());
    fireEvent.click(screen.getByRole('button', { name: 'make draft' }));
    await waitFor(() => expect(hoisted.createDraftFn).toHaveBeenCalledTimes(1));

    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(boundaryTree());
    expect(screen.getByTestId('draft-probe').textContent).toBe('none');

    // World A's draft creation resolves after the identity moved on. It must
    // not populate world B's draft state and it must not trigger any follow-up
    // request carrying the new identity's credentials for world A's resource.
    await act(async () => {
      heldCreate.resolve({ draft: { id: 'draft-a' } });
      await heldCreate.promise;
    });

    expect(screen.getByTestId('draft-probe').textContent).toBe('none');
    expect(hoisted.createDraftFn).toHaveBeenCalledTimes(1);
    expect(hoisted.getDraftFn).not.toHaveBeenCalled();
  });
});
