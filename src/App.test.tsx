import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { FEEL_LAB_LAYER_Z } from './feel/layer';

const hoisted = vi.hoisted(() => ({
  activeLobby: {
    data: null as null | {
      lobbyId: string;
      encounterId: string;
      lobbyStatus: number;
    },
    loading: false,
    error: null as Error | null,
  },
  lobbyCharacter: {
    characterId: undefined as string | undefined,
    loading: false,
    error: null as Error | null,
  },
  activeLobbyCalls: 0,
  authDecision: {
    kind: 'dev' as 'dev' | 'discord' | 'unauthenticated',
    playerId: 'test-player' as string | null,
    guildId: null as string | null,
  },
  sourceFactoryCalls: [] as unknown[],
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

vi.mock('./api/auth', () => ({
  getPlayerId: () => 'test-player',
  getAuthDecision: () => {
    if (hoisted.authDecision.kind === 'discord') {
      return {
        kind: 'discord',
        playerId: hoisted.authDecision.playerId,
        guildId: hoisted.authDecision.guildId,
      };
    }
    if (hoisted.authDecision.kind === 'dev') {
      return { kind: 'dev', playerId: hoisted.authDecision.playerId };
    }
    return { kind: 'unauthenticated' };
  },
}));

vi.mock('./api/hooks', () => ({
  useListCharacters: () => ({ data: [] }),
  useListDrafts: () => ({ data: [] }),
}));

vi.mock('./api/useDevPlayerIdAuth', () => ({
  useDevPlayerIdAuth: () => undefined,
}));

vi.mock('./api/useMyActiveLobby', () => ({
  useMyActiveLobby: () => {
    hoisted.activeLobbyCalls += 1;
    return hoisted.activeLobby;
  },
}));

vi.mock('./api/useLobbyCharacterId', () => ({
  useLobbyCharacterId: () => hoisted.lobbyCharacter,
}));

vi.mock('./author/AuthorView', () => ({
  AuthorView: () => <div>Author View</div>,
}));

vi.mock('./author/DungeonBuilderHomeButton', () => ({
  DungeonBuilderHomeButton: () => null,
}));

vi.mock('./character/creation/CharacterDraftContext', () => ({
  CharacterDraftProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('./character/creation/InteractiveCharacterSheet', () => ({
  InteractiveCharacterSheet: () => <div>Character Creation</div>,
}));

vi.mock('./character/creation/useCharacterDraft', () => ({
  useCharacterDraft: () => ({
    loading: false,
    reset: vi.fn(),
    createDraft: vi.fn(),
    loadDraft: vi.fn(),
  }),
}));

vi.mock('./character/sheet/CharacterSheet', () => ({
  CharacterSheet: () => <div>Character Sheet</div>,
}));

vi.mock('./components/game/GameView', () => ({
  GameView: ({ characterId }: { characterId?: string }) => (
    <div data-testid="game-view" data-character-id={characterId}>
      Game View
    </div>
  ),
}));

vi.mock('./components/home', () => ({
  CharacterCarousel: () => <div>Home View</div>,
  SelectedCharacterPanel: () => null,
}));

vi.mock('./components/ThemeSelector', () => ({
  ThemeSelector: () => <div>Theme Selector</div>,
}));

vi.mock('./concepts/ConceptsView', () => ({
  ConceptsView: ({ onBack }: { onBack: () => void }) => (
    <section>
      <h1>Concepts Lab</h1>
      <button onClick={onBack}>Back</button>
    </section>
  ),
}));

vi.mock('./concepts/world-building/WorldBuildingConcept', () => ({
  WorldBuildingConcept: ({ onBack }: { onBack: () => void }) => (
    <section>
      <h1>World Builder View</h1>
      <button onClick={onBack}>Back to main menu</button>
    </section>
  ),
}));

vi.mock('./compositions/rpcCompositionSource', () => ({
  createRpcCompositionSource: (input: {
    mode: string;
    auth: { kind: string; guildId?: string | null };
  }) => {
    hoisted.sourceFactoryCalls.push(input);
    if (input.auth.kind === 'discord' && input.auth.guildId) {
      return {
        worldId: input.auth.guildId,
        reader: {},
        writer: {},
      };
    }
    if (input.auth.kind === 'dev' && input.mode === 'development') {
      return { worldId: 'test-world', reader: {}, writer: {} };
    }
    return undefined;
  },
}));

vi.mock('./dev/AttackDieDevRouteSurface', () => ({
  AttackDieDevRouteSurface: () => <div>Attack Die Dev Route</div>,
}));

vi.mock('./dev/attackDiePerfRoute', () => ({
  selectAttackDieDevRoute: () => ({ kind: 'normal' }),
}));

vi.mock('./dev/ThumbHarness', () => ({
  ThumbHarness: () => <div>Thumbnail Harness</div>,
}));

vi.mock('./dev/prop-calibration/PropCalibrationLab', () => ({
  PropCalibrationLab: () => <div>Prop Calibration Lab</div>,
}));

vi.mock('./dev/asset-review/AssetReviewLab', () => ({
  AssetReviewLab: () => <div>Asset Review Lab</div>,
}));

vi.mock('./discord', () => ({
  DiscordDebugPanel: () => <h2>Discord Debug Panel</h2>,
  useDiscord: () => hoisted.discord,
}));

vi.mock('./toolkit-contributor-sandbox/route', () => ({
  isToolkitContributorSandboxRoute: () => false,
}));

beforeEach(() => {
  hoisted.activeLobby.data = null;
  hoisted.activeLobby.loading = false;
  hoisted.activeLobby.error = null;
  hoisted.lobbyCharacter.characterId = undefined;
  hoisted.lobbyCharacter.loading = false;
  hoisted.lobbyCharacter.error = null;
  hoisted.activeLobbyCalls = 0;
  hoisted.authDecision.kind = 'dev';
  hoisted.authDecision.playerId = 'test-player';
  hoisted.authDecision.guildId = null;
  hoisted.sourceFactoryCalls.length = 0;
  hoisted.discord.user = null;
  hoisted.discord.isDiscord = false;
  hoisted.discord.isReady = true;
  hoisted.discord.isAuthenticated = false;
  hoisted.discord.error = null;
  hoisted.discord.guildId = null;
  hoisted.discord.grantedScopes = [];
  hoisted.discord.authSessionId = 0;
  hoisted.discord.authenticate.mockReset();
  hoisted.discord.clearAuthentication.mockReset();
  hoisted.discord.clearAuthenticationForSession.mockReset();
  hoisted.discord.isAuthenticationSessionCurrent.mockReset();
  hoisted.discord.isAuthenticationSessionCurrent.mockImplementation(
    (expected: number) => expected === hoisted.discord.authSessionId
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/');
});

describe('App running-encounter resume', () => {
  it('does not enter a running encounter when authoritative seat recovery fails', async () => {
    hoisted.activeLobby.data = {
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: 2,
    };
    hoisted.lobbyCharacter.error = new Error('seat snapshot unavailable');

    render(<App />);

    expect(
      await screen.findByText('Unable to resume the running encounter')
    ).toBeTruthy();
    expect(screen.getByText('seat snapshot unavailable')).toBeTruthy();
    expect(screen.queryByTestId('game-view')).toBeNull();
  });

  it('passes the authoritative lobby seat character into the resumed GameView', async () => {
    hoisted.activeLobby.data = {
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: 2,
    };
    hoisted.lobbyCharacter.characterId = 'char-alice';

    render(<App />);

    const game = await screen.findByTestId('game-view');
    expect(game.dataset.characterId).toBe('char-alice');
  });
});

describe('App prop calibration route', () => {
  it('mounts the full-window lab only for the explicit local development route', async () => {
    vi.stubEnv('MODE', 'development');
    window.history.pushState({}, '', '/?propCalibration=1');

    render(<App />);

    expect(await screen.findByText('Prop Calibration Lab')).toBeTruthy();
    expect(screen.queryByText('Home View')).toBeNull();
    expect(hoisted.activeLobbyCalls).toBe(0);
  });

  it('refuses the prop calibration query in production', () => {
    vi.stubEnv('MODE', 'production');
    window.history.pushState({}, '', '/?propCalibration=1');

    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.queryByText('Prop Calibration Lab')).toBeNull();
  });
});

describe('App asset review route', () => {
  it('mounts the full-window lab only for the explicit loopback development route', async () => {
    vi.stubEnv('MODE', 'development');
    window.history.pushState({}, '', '/?assetReview=1');

    render(<App />);

    expect(await screen.findByText('Asset Review Lab')).toBeTruthy();
    expect(screen.queryByText('Home View')).toBeNull();
    expect(hoisted.activeLobbyCalls).toBe(0);
  });

  it('refuses the asset review query in production', () => {
    vi.stubEnv('MODE', 'production');
    window.history.pushState({}, '', '/?assetReview=1');

    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.queryByText('Asset Review Lab')).toBeNull();
  });
});

describe('App main-menu World Builder', () => {
  it('routes the development world source into the promoted editor and back', async () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open World Builder' })
    );
    expect(
      screen.getByRole('heading', { name: 'World Builder View' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(screen.getByText('Home View')).toBeTruthy();
  });

  it('does not invent a World Builder path for production Dev auth', () => {
    vi.stubEnv('MODE', 'production');
    render(<App />);
    expect(
      screen.queryByRole('button', { name: 'Open World Builder' })
    ).toBeNull();
  });

  it('creates the production source from Discord auth and the SDK guild', async () => {
    vi.stubEnv('MODE', 'production');
    hoisted.authDecision.kind = 'discord';
    hoisted.authDecision.playerId = 'player-1';
    hoisted.authDecision.guildId = '123456789012345678';
    hoisted.discord.user = { id: 'player-1' };
    hoisted.discord.isDiscord = true;
    hoisted.discord.isAuthenticated = true;
    hoisted.discord.guildId = '123456789012345678';
    hoisted.discord.authSessionId = 9;

    render(<App />);

    expect(
      await screen.findByRole('button', { name: 'Open World Builder' })
    ).toBeTruthy();
    expect(hoisted.sourceFactoryCalls).toEqual([
      expect.objectContaining({
        mode: 'production',
        authSessionId: 9,
        auth: {
          kind: 'discord',
          playerId: 'player-1',
          guildId: '123456789012345678',
        },
      }),
    ]);
  });

  it('shows a disabled server-launch state instead of falling back without an SDK guild', async () => {
    vi.stubEnv('MODE', 'production');
    hoisted.authDecision.kind = 'discord';
    hoisted.authDecision.playerId = 'player-1';
    hoisted.authDecision.guildId = null;
    hoisted.discord.user = { id: 'player-1' };
    hoisted.discord.isDiscord = true;
    hoisted.discord.isAuthenticated = true;
    hoisted.discord.guildId = null;

    render(<App />);

    expect(
      await screen.findByText(
        'Open this Activity in a server to access its world'
      )
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Open World Builder',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(hoisted.sourceFactoryCalls).toEqual([
      expect.objectContaining({
        auth: expect.objectContaining({ guildId: null }),
      }),
    ]);
  });
});

describe('App global development tools', () => {
  it('shows only the wrench — #906 round 5: Kirk, "we do not need the concepts lab in there"', () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.getByTitle('Show Debug Panel')).toBeTruthy();
    expect(screen.queryByTitle('Open Concepts Lab')).toBeNull();
    expect(screen.queryByText('🧪')).toBeNull();
  });

  it('hides the wrench in Concepts (reachable only via the ?concept= deep link now, not a button), then restores it on Back', () => {
    vi.stubEnv('MODE', 'development');
    window.history.pushState({}, '', '/?concept=some-concept');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Concepts Lab' })).toBeTruthy();
    expect(screen.queryByTitle('Show Debug Panel')).toBeNull();
    expect(screen.queryByText('Discord Debug Panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.getByTitle('Show Debug Panel')).toBeTruthy();
  });

  it('does not render global development tools in production', () => {
    vi.stubEnv('MODE', 'production');
    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.queryByTitle('Show Debug Panel')).toBeNull();
    expect(screen.queryByText('Discord Debug Panel')).toBeNull();
  });

  it('shares FEEL_LAB_LAYER_Z with the drawer, not its own z-index — #906 round 4: the button row painted behind a live session for the same reason the drawer once did', () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);

    const wrench = screen.getByTitle('Show Debug Panel');
    const row = wrench.parentElement as HTMLElement;
    expect(row.style.zIndex).toBe(String(FEEL_LAB_LAYER_Z));
  });

  it('sits above the combat dock (174px tall) rather than inside its band', () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);

    const wrench = screen.getByTitle('Show Debug Panel');
    const row = wrench.parentElement as HTMLElement;
    // bottom-48 = 12rem = 192px, clearing the dock's 174px with room to
    // spare; the old bottom-4 (16px) sat well inside it.
    const classes = row.className.split(/\s+/);
    expect(classes).toContain('bottom-48');
    expect(classes).not.toContain('bottom-4');
  });
});
