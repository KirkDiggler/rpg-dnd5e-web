import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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
  useMyActiveLobby: () => ({ data: null, loading: false }),
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
  GameView: () => <div>Game View</div>,
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

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/');
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
