import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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
}));

vi.mock('./api/auth', () => ({
  getPlayerId: () => 'test-player',
}));

vi.mock('./api/hooks', () => ({
  useListCharacters: () => ({ data: [] }),
  useListDrafts: () => ({ data: [] }),
}));

vi.mock('./api/useDevPlayerIdAuth', () => ({
  useDevPlayerIdAuth: () => undefined,
}));

vi.mock('./api/useMyActiveLobby', () => ({
  useMyActiveLobby: () => hoisted.activeLobby,
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

vi.mock('./dev/AttackDieDevRouteSurface', () => ({
  AttackDieDevRouteSurface: () => <div>Attack Die Dev Route</div>,
}));

vi.mock('./dev/attackDiePerfRoute', () => ({
  selectAttackDieDevRoute: () => ({ kind: 'normal' }),
}));

vi.mock('./dev/ThumbHarness', () => ({
  ThumbHarness: () => <div>Thumbnail Harness</div>,
}));

vi.mock('./discord', () => ({
  DiscordDebugPanel: () => <h2>Discord Debug Panel</h2>,
  useDiscord: () => ({
    user: null,
    isDiscord: false,
    isReady: true,
    error: null,
  }),
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

describe('App global development tools', () => {
  it('hides the controls and open Discord panel in Concepts, then restores them on Back', () => {
    vi.stubEnv('MODE', 'development');
    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    const openConcepts = screen.getByTitle('Open Concepts Lab');
    expect(screen.getByTitle('Show Debug Panel')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Show Debug Panel'));
    expect(screen.getByTitle('Hide Debug Panel')).toBeTruthy();
    expect(screen.getByText('Discord Debug Panel')).toBeTruthy();

    fireEvent.click(openConcepts);
    expect(screen.getByRole('heading', { name: 'Concepts Lab' })).toBeTruthy();
    expect(screen.queryByTitle('Open Concepts Lab')).toBeNull();
    expect(screen.queryByTitle('Hide Debug Panel')).toBeNull();
    expect(screen.queryByText('Discord Debug Panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.getByTitle('Open Concepts Lab')).toBeTruthy();
    expect(screen.getByTitle('Hide Debug Panel')).toBeTruthy();
    expect(screen.getByText('Discord Debug Panel')).toBeTruthy();
  });

  it('does not render global development tools in production', () => {
    vi.stubEnv('MODE', 'production');
    render(<App />);

    expect(screen.getByText('Home View')).toBeTruthy();
    expect(screen.queryByTitle('Open Concepts Lab')).toBeNull();
    expect(screen.queryByTitle('Show Debug Panel')).toBeNull();
    expect(screen.queryByText('Discord Debug Panel')).toBeNull();
  });
});
