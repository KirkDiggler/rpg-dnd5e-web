import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type {
  EncounterStudioPresentation,
  EncounterStudioSession,
} from './concepts/encounter-studio/studioSession';
import { createRoomDraft } from './concepts/world-building/roomDraft';
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
  readerOnlySource: false,
  studioMounts: 0,
  studioUnmounts: 0,
  studioOwnerProps: null as Record<string, unknown> | null,
  worldBuilderConceptProps: null as null | {
    roomPublishing?: {
      characterId: string | null;
      onPlay: (encounterId: string, characterId: string) => void;
    };
  },
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

// A visible sentinel makes retirement fail if App mounts the old entry again.
vi.mock('./author/DungeonBuilderHomeButton', () => ({
  DungeonBuilderHomeButton: () => (
    <button type="button">Open Dungeon Builder</button>
  ),
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
  GameView: ({
    characterId,
    initialEncounterId,
    onBack,
  }: {
    characterId?: string;
    initialEncounterId?: string;
    onBack?: () => void;
  }) => (
    <div
      data-testid="game-view"
      data-character-id={characterId}
      data-encounter-id={initialEncounterId}
    >
      Game View
      <button onClick={onBack}>Back to main menu</button>
    </div>
  ),
}));

vi.mock('./components/home', () => ({
  CharacterCarousel: ({
    onSelect,
  }: {
    onSelect: (id: string, type: 'character' | 'draft') => void;
  }) => (
    <div>
      Home View
      <button onClick={() => onSelect('char-9', 'character')}>
        Select test character
      </button>
      <button onClick={() => onSelect('draft-1', 'draft')}>
        Select test draft
      </button>
    </div>
  ),
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
  WorldBuildingConcept: (props: {
    onBack: () => void;
    compositionSource?: { worldId: string };
    studioPresentation?: EncounterStudioPresentation;
    roomPublishing?: {
      characterId: string | null;
      onPlay: (encounterId: string, characterId: string) => void;
    };
  }) => {
    const isStudio = Boolean(props.studioPresentation);
    useEffect(() => {
      if (!isStudio) return;
      hoisted.studioMounts++;
      return () => {
        hoisted.studioUnmounts++;
      };
    }, [isStudio]);
    if (props.studioPresentation) {
      hoisted.studioOwnerProps = props;
      return (
        <div
          data-testid="studio-owner"
          data-world-id={props.compositionSource?.worldId}
        >
          {props.studioPresentation.render(createAppStudioSession())}
        </div>
      );
    }
    hoisted.worldBuilderConceptProps = props;
    return (
      <section>
        <h1>World Builder View</h1>
        <button onClick={props.onBack}>Back to main menu</button>
      </section>
    );
  },
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
        ...(hoisted.readerOnlySource ? {} : { writer: {} }),
      };
    }
    if (input.auth.kind === 'dev' && input.mode === 'development') {
      return {
        worldId: 'test-world',
        reader: {},
        ...(hoisted.readerOnlySource ? {} : { writer: {} }),
      };
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

function createAppStudioSession(): EncounterStudioSession {
  const draft = createRoomDraft(
    { version: 1, id: 'scene-1', name: 'Studio draft', items: [], groups: [] },
    'room-1'
  );
  return {
    document: { draft, scope: {} },
    intentEpoch: 0,
    regionEditing: {
      resolutions: [],
      createRoomLabel: vi.fn(() => true),
      useEnclosingWalls: vi.fn(() => true),
      setExplicitRegionArea: vi.fn(() => true),
      removeRegionAndLabel: vi.fn(() => true),
    },
    doorEditing: {
      assetRef: null,
      active: false,
      options: [],
      selectedTarget: null,
      preview: null,
      setAsset: vi.fn(() => true),
      setActive: vi.fn(() => true),
      select: vi.fn(() => true),
      previewPlacement: vi.fn(() => true),
      create: vi.fn(() => true),
      previewMove: vi.fn(() => true),
      move: vi.fn(() => true),
      cancelPreview: vi.fn(),
    },
    arrange: null,
    commitArrange: vi.fn(() => true),
    commitTables: vi.fn(() => true),
    mapLabelSelection: { selectedId: null, select: vi.fn(() => true) },
    renameDocument: vi.fn(() => true),
    wallEditing: {
      selectedId: null,
      assetRef: null,
      snapEnabled: false,
      options: [],
      select: vi.fn(() => true),
      setAsset: vi.fn(() => true),
      setSnap: vi.fn(() => true),
      create: vi.fn(() => true),
      edit: vi.fn(() => true),
      remove: vi.fn(() => true),
      reportRefusal: vi.fn(),
    },
    viewportProps: {
      scene: draft.scene,
      previewScene: null,
      selectedIds: [],
      tool: 'select',
      activeDrag: null,
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit: vi.fn(),
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
    },
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    commitFloor: vi.fn(() => true),
    resizeWorkspace: vi.fn(() => true),
    createMapLabel: vi.fn(() => true),
    moveMapLabel: vi.fn(() => true),
    renameMapLabel: vi.fn(() => true),
    deleteMapLabel: vi.fn(() => true),
    cancelTransients: vi.fn(),
    propTool: 'select',
    setPropTool: vi.fn(),
    propControls: {
      palette: null,
      tree: null,
      selection: null,
      arrangeExtras: null,
    },
    saveStatus: 'Saved locally',
    notice: null,
    autosaveBlocked: false,
    saveLocalDraft: vi.fn(),
    dismissNotice: vi.fn(),
  };
}

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
  hoisted.readerOnlySource = false;
  hoisted.studioMounts = hoisted.studioUnmounts = 0;
  hoisted.studioOwnerProps = null;
  hoisted.worldBuilderConceptProps = null;
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

describe('App World Builder publish capability', () => {
  it('passes the Home-selected character and the existing play route into the World Builder', async () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select test character' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open World Builder' })
    );
    expect(
      screen.getByRole('heading', { name: 'World Builder View' })
    ).toBeTruthy();
    const capability = hoisted.worldBuilderConceptProps?.roomPublishing;
    expect(capability?.characterId).toBe('char-9');
    expect(typeof capability?.onPlay).toBe('function');

    // The SAME handlePlayAuthored callback the legacy AuthorView receives:
    // invoking it routes to the lobby on the returned encounter.
    capability?.onPlay('enc-77', 'char-9');
    const game = await screen.findByTestId('game-view');
    expect(game.dataset.characterId).toBe('char-9');
    expect(game.dataset.encounterId).toBe('enc-77');
  });

  it('still injects the capability with a null character so Play can be visibly disabled', async () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open World Builder' })
    );
    expect(hoisted.worldBuilderConceptProps?.roomPublishing).toEqual(
      expect.objectContaining({ characterId: null })
    );
  });

  it('carries the resumed encounter seat through Home so World Builder play is not disabled', async () => {
    vi.stubEnv('MODE', 'development');
    // A running encounter resumes straight into GameView, which never
    // touches Home's selection. Coming Back must keep the player's known
    // seat character as the explicit Home choice instead of losing it.
    hoisted.activeLobby.data = {
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: 2,
    };
    hoisted.lobbyCharacter.characterId = 'char-alice';
    render(<App />);

    await screen.findByTestId('game-view');
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(screen.getByText('Home View')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open World Builder' }));
    expect(hoisted.worldBuilderConceptProps?.roomPublishing?.characterId).toBe(
      'char-alice'
    );

    // An explicit Home choice still wins over the adopted seat: leaving the
    // World Builder must not resurrect the resumed character.
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave World Builder' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select test character' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open World Builder' }));
    expect(hoisted.worldBuilderConceptProps?.roomPublishing?.characterId).toBe(
      'char-9'
    );
  });

  it('never replaces an explicitly selected draft with the resumed seat on leaving the game', async () => {
    vi.stubEnv('MODE', 'development');
    const { rerender } = render(<App />);
    // A real Home selection exists before stale resume data arrives.
    fireEvent.click(screen.getByRole('button', { name: 'Select test draft' }));
    hoisted.activeLobby.data = {
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: 2,
    };
    hoisted.lobbyCharacter.characterId = 'char-alice';
    rerender(<App />);

    await screen.findByTestId('game-view');
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(screen.getByText('Home View')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open World Builder' }));
    // The draft selection is not a character; it must not have been swapped
    // out for the resumed seat character.
    expect(
      hoisted.worldBuilderConceptProps?.roomPublishing?.characterId
    ).toBeNull();
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave World Builder' })
    );
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

    const sourceInput = hoisted.sourceFactoryCalls[0] as {
      onUnauthenticated(authSessionId: number): void;
      isAuthSessionCurrent(authSessionId: number): boolean;
    };
    sourceInput.onUnauthenticated(9);
    expect(hoisted.discord.clearAuthenticationForSession).toHaveBeenCalledWith(
      9,
      'Your Discord session expired. Please reconnect.'
    );
    expect(sourceInput.isAuthSessionCurrent(9)).toBe(true);
    expect(hoisted.discord.isAuthenticationSessionCurrent).toHaveBeenCalledWith(
      9
    );
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

describe('App Encounter Studio current-world entry', () => {
  it('Home offers only World Builder and Studio as authoring entries under the same source gate', async () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);
    expect(
      await screen.findByRole('button', { name: 'Open Encounter Studio' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open World Builder' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Dungeon Builder/i })
    ).toBeNull();
    expect(
      within(
        screen.getByRole('group', { name: 'Encounter authoring' })
      ).getAllByRole('button')
    ).toHaveLength(2);
    expect(hoisted.sourceFactoryCalls).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Encounter Studio' })
    );
    expect(screen.getByTestId('studio-owner').dataset.worldId).toBe(
      'test-world'
    );
    expect(hoisted.studioOwnerProps).toHaveProperty('roomMode', true);
  });

  it('reader-only source can enter Studio without publishing controls', async () => {
    vi.stubEnv('MODE', 'development');
    hoisted.readerOnlySource = true;
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Encounter Studio' })
    );
    expect(
      screen.getByRole('heading', { name: 'Encounter Studio' })
    ).toBeTruthy();
    expect(hoisted.studioOwnerProps).not.toHaveProperty('roomPublishing');
    expect(hoisted.studioOwnerProps).not.toHaveProperty('onPlay');
    expect(hoisted.studioOwnerProps).not.toHaveProperty('characterId');
    expect(hoisted.studioOwnerProps?.compositionSource).not.toHaveProperty(
      'writer'
    );
    expect(screen.queryByText(/Save & Play|Publish/i)).toBeNull();
  });

  it('missing Discord guild and production Dev do not invent Studio access', async () => {
    vi.stubEnv('MODE', 'production');
    const { rerender } = render(<App />);
    await waitFor(() => expect(hoisted.sourceFactoryCalls).toHaveLength(1));
    expect(
      screen.queryByRole('button', { name: 'Open Encounter Studio' })
    ).toBeNull();
    hoisted.authDecision.kind = 'discord';
    hoisted.authDecision.playerId = 'player-1';
    hoisted.discord.user = { id: 'player-1' };
    hoisted.discord.isDiscord = true;
    rerender(<App />);
    expect(
      await screen.findByText(
        'Open this Activity in a server to access its world'
      )
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Open Encounter Studio',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Open World Builder',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Encounter Studio' })
    );
    expect(screen.queryByTestId('studio-owner')).toBeNull();
  });

  it('credential identity replacement retires the prior Studio owner', async () => {
    vi.stubEnv('MODE', 'production');
    hoisted.authDecision.kind = 'discord';
    hoisted.authDecision.playerId = 'player-1';
    hoisted.authDecision.guildId = 'guild-a';
    hoisted.discord.user = { id: 'player-1' };
    hoisted.discord.isDiscord = true;
    const { rerender } = render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Encounter Studio' })
    );
    const firstOwner = screen.getByTestId('studio-owner');
    expect(firstOwner.dataset.worldId).toBe('guild-a');
    hoisted.discord.authSessionId++;
    // The same guild but a new credential epoch must retire the owner too.
    rerender(<App />);
    expect(screen.queryByTestId('studio-owner')).toBeNull();
    expect(hoisted.studioUnmounts).toBe(1);
    const secondOwner = await screen.findByTestId('studio-owner');
    expect(secondOwner).not.toBe(firstOwner);
    expect(secondOwner.dataset.worldId).toBe('guild-a');
    expect(hoisted.studioMounts).toBe(2);

    hoisted.discord.authSessionId++;
    hoisted.authDecision.guildId = 'guild-b';
    rerender(<App />);
    expect(screen.queryByTestId('studio-owner')).toBeNull();
    expect((await screen.findByTestId('studio-owner')).dataset.worldId).toBe(
      'guild-b'
    );
    expect(hoisted.studioMounts).toBe(3);
    expect(hoisted.studioUnmounts).toBe(2);
  });

  it('loss of current-world source retires Studio without falling into character creation', async () => {
    vi.stubEnv('MODE', 'production');
    hoisted.authDecision.kind = 'discord';
    hoisted.authDecision.guildId = 'guild-a';
    const { rerender } = render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Encounter Studio' })
    );
    hoisted.authDecision.guildId = null;
    hoisted.discord.authSessionId++;
    rerender(<App />);
    expect(screen.queryByTestId('studio-owner')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Encounter Studio unavailable' })
    ).toBeTruthy();
    expect(screen.queryByText('Character Creation')).toBeNull();
    expect(
      screen.getByText('Open this Activity in a server to access its world')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(screen.getByText('Home View')).toBeTruthy();
  });

  it('Studio is full bleed and Back returns Home', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_FEEL_LAB', '1');
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Encounter Studio' })
    );
    const studio = screen.getByRole('region', {
      name: 'Encounter Studio workspace',
    });
    const root = studio.closest('.min-h-screen');
    expect(root?.classList.contains('p-0')).toBe(true);
    expect(root?.classList.contains('p-8')).toBe(false);
    expect(screen.queryByText('Theme Selector')).toBeNull();
    expect(screen.queryByTitle('Show Debug Panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave Encounter Studio' })
    );
    expect(screen.getByText('Home View')).toBeTruthy();
    expect(hoisted.studioUnmounts).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Open World Builder' })
    ).toBeTruthy();
  });
});
