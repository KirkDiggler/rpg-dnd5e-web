import { motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { getPlayerId } from './api/auth';
import { useListCharacters, useListDrafts } from './api/hooks';
import { useDevPlayerIdAuth } from './api/useDevPlayerIdAuth';
import { useLobbyCharacterId } from './api/useLobbyCharacterId';
import { useMyActiveLobby } from './api/useMyActiveLobby';
import './App.css';
import { shouldRenderGlobalDevTools, type AppView } from './appView';
import { AuthorView } from './author/AuthorView';
import { DungeonBuilderHomeButton } from './author/DungeonBuilderHomeButton';
import { CharacterDraftProvider } from './character/creation/CharacterDraftContext';
import { InteractiveCharacterSheet } from './character/creation/InteractiveCharacterSheet';
import { useCharacterDraft } from './character/creation/useCharacterDraft';
import { CharacterSheet } from './character/sheet/CharacterSheet';
import { GameView } from './components/game/GameView';
import { CharacterCarousel, SelectedCharacterPanel } from './components/home';
import { ThemeSelector } from './components/ThemeSelector';
import { ErrorDisplay } from './components/ui/Feedback';
import { ConceptsView } from './concepts/ConceptsView';
import { AttackDieDevRouteSurface } from './dev/AttackDieDevRouteSurface';
import { selectAttackDieDevRoute } from './dev/attackDiePerfRoute';
import { ThumbHarness } from './dev/ThumbHarness';
import { DiscordDebugPanel, useDiscord } from './discord';
import { isToolkitContributorSandboxRoute } from './toolkit-contributor-sandbox/route';

const LazyToolkitContributorSandbox =
  import.meta.env.MODE === 'development'
    ? lazy(() =>
        import('./toolkit-contributor-sandbox/ToolkitContributorSandbox').then(
          ({ ToolkitContributorSandbox }) => ({
            default: ToolkitContributorSandbox,
          })
        )
      )
    : null;

/**
 * Dev-only deep link: `?concept=<id>` opens the Concepts Lab directly and must
 * KEEP it open — the active-lobby effect otherwise steals the
 * view and drops you into a live encounter. Production is unaffected.
 */
const hasConceptDeepLink = (): boolean =>
  import.meta.env.MODE === 'development' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('concept');

function AppContent() {
  // Stable gate: dev encounterId URLs select the real GameView perf surface or the ordinary PlaytestHarness.
  // Computed once on mount via useState initializer so route doesn't flicker.
  // /playtest is a permanent verification surface (design.md), not slated
  // for removal — this gate stays.
  const [attackDieDevRoute] = useState(() =>
    selectAttackDieDevRoute(import.meta.env.MODE, window.location.search)
  );

  // Same shape as showPlaytestHarness above: dev-only, no app chrome.
  // Thumbnail-baking harness for the dungeon builder palette (rpg-dnd5e-web
  // #667) — see ThumbHarness.tsx's own doc comment for how it's used.
  const [showThumbHarness] = useState(
    () =>
      import.meta.env.MODE === 'development' &&
      !!new URLSearchParams(window.location.search).get('thumbGlb')
  );

  const [currentView, setCurrentView] = useState<AppView>(
    hasConceptDeepLink() ? 'concepts' : 'home'
  );
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(
    null
  );
  // Track selected item in carousel (can be character or draft)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<
    'character' | 'draft' | null
  >(null);
  // Character to play with in lobby
  const [lobbyCharacterId, setLobbyCharacterId] = useState<string | null>(null);
  // Resume-after-refresh (#444): set from GetMyActiveLobby, not from Home
  // character selection — see the routing effect below.
  const [resumeEncounterId, setResumeEncounterId] = useState<string | null>(
    null
  );
  const [resumeLobbyId, setResumeLobbyId] = useState<string | null>(null);

  const discord = useDiscord();
  const draft = useCharacterDraft();

  // In production, require Discord auth. In dev, allow test player
  const isDevelopment = import.meta.env.MODE === 'development';
  const showGlobalDevTools = shouldRenderGlobalDevTools(
    import.meta.env.MODE,
    currentView
  );
  // Dev override: ?playerId=alice|bob lets two tabs run as different players
  // without Discord (slice 2 playtest infrastructure)
  const devPlayerIdOverride = isDevelopment
    ? new URLSearchParams(window.location.search).get('playerId')
    : null;
  // Sync dev override into gRPC auth store so outbound RPCs carry the right
  // player ID. useLayoutEffect fires before child effects, preventing races.
  useDevPlayerIdAuth(devPlayerIdOverride);
  // The UI's identity must be the SAME id the auth interceptor sends, or the
  // lobby roster can't find "me": the server stamps members with the header
  // id, and a UI that believes it is someone else hides Ready state and the
  // host's Start button. getPlayerId() already falls back to
  // VITE_DEV_PLAYER_ID the way the interceptor does, so ask it rather than
  // re-deriving a second (and previously disagreeing) fallback here.
  const playerId =
    discord.user?.id ||
    devPlayerIdOverride ||
    getPlayerId() ||
    (isDevelopment ? 'test-player' : null);

  // Resume-after-refresh (#444): ask the server, once, whether this player
  // has an active lobby or running encounter to resume into instead of
  // landing on Home. An active encounter takes priority over a WAITING
  // lobby (GetMyActiveLobbyResponse never reports both as independently
  // actionable — see its doc comment) and routes straight into GameView,
  // mirroring /playtest's dev-only ?encounterId= gate but server-driven and
  // available for real players.
  const myActiveLobby = useMyActiveLobby(playerId);
  const resumedLobbyCharacter = useLobbyCharacterId(
    myActiveLobby.data?.encounterId ? myActiveLobby.data.lobbyId : '',
    playerId ?? ''
  );
  const resumeLoading =
    myActiveLobby.loading ||
    Boolean(myActiveLobby.data?.encounterId && resumedLobbyCharacter.loading);
  const resumeIdentityError =
    myActiveLobby.data?.encounterId &&
    !resumedLobbyCharacter.loading &&
    !resumedLobbyCharacter.characterId
      ? (resumedLobbyCharacter.error?.message ??
        'The running encounter has no recoverable character seat.')
      : null;
  useEffect(() => {
    if (hasConceptDeepLink()) return; // deep link owns the view
    if (!myActiveLobby.data) return;
    if (myActiveLobby.data.encounterId) {
      if (resumedLobbyCharacter.loading || resumeIdentityError) return;
      setResumeEncounterId(myActiveLobby.data.encounterId);
      setCurrentView('lobby');
    } else if (myActiveLobby.data.lobbyId) {
      setResumeLobbyId(myActiveLobby.data.lobbyId);
      setCurrentView('lobby');
    }
  }, [myActiveLobby.data, resumedLobbyCharacter.loading, resumeIdentityError]);

  const handleCreateCharacter = async () => {
    try {
      // Reset any existing draft
      draft.reset();
      // Create new draft
      await draft.createDraft(playerId || 'test-player', 'test-session');
      // Switch to creation view
      setCurrentView('character-creation');
    } catch (error) {
      console.error('Failed to create draft:', error);
    }
  };

  const handleResumeDraft = async (draftId: string) => {
    try {
      // Load the draft
      await draft.loadDraft(draftId);
      // Switch to creation view
      setCurrentView('character-creation');
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  };

  const handleCharacterCreated = (characterId: string) => {
    console.log('Character created:', characterId);
    // Go back to home with the new character selected
    setSelectedId(characterId);
    setSelectedType('character');
    setCurrentView('home');
  };

  const handleCancelCreation = () => {
    draft.reset();
    setCurrentView('home');
  };

  const handleViewCharacter = (characterId: string) => {
    setCurrentCharacterId(characterId);
    setCurrentView('character-sheet');
  };

  const handleBackToHome = () => {
    setCurrentCharacterId(null);
    setLobbyCharacterId(null);
    setResumeEncounterId(null);
    setResumeLobbyId(null);
    setCurrentView('home');
  };

  const handleOpenConcepts = () => {
    setCurrentView('concepts');
  };

  const handleOpenAuthor = () => {
    setCurrentView('author');
  };

  // Save & Play from the Dungeon Builder (rpg-project#256): the builder
  // already started the encounter on the authored key; drop straight
  // into it the same way resume-after-refresh does.
  const handlePlayAuthored = (encounterId: string, characterId: string) => {
    setResumeLobbyId(null);
    setLobbyCharacterId(characterId);
    setResumeEncounterId(encounterId);
    setCurrentView('lobby');
  };

  // Carousel selection handler
  const handleCarouselSelect = (id: string, type: 'character' | 'draft') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  // Play button handler - go to lobby with selected character
  const handlePlay = (characterId: string) => {
    // A fresh Play from Home should never carry a stale resume target
    // forward (e.g. a leftover resumeLobbyId from an earlier check this
    // session that the player has since left).
    setResumeEncounterId(null);
    setResumeLobbyId(null);
    setLobbyCharacterId(characterId);
    setCurrentView('lobby');
  };

  // Delete handlers
  const handleDeleteCharacter = (characterId: string) => {
    // Clear selection if the deleted character was selected
    if (selectedId === characterId) {
      setSelectedId(null);
      setSelectedType(null);
    }
  };

  const handleDeleteDraft = (draftId: string) => {
    // Clear selection if the deleted draft was selected
    if (selectedId === draftId) {
      setSelectedId(null);
      setSelectedType(null);
    }
  };

  if (attackDieDevRoute.kind !== 'normal') {
    return (
      <AttackDieDevRouteSurface
        route={attackDieDevRoute}
        playerId={playerId || 'test-player'}
      />
    );
  }

  if (showThumbHarness) {
    return (
      <div className="min-h-screen">
        <ThumbHarness />
      </div>
    );
  }

  // Views that own the whole window rather than sitting in a centred reading
  // column. The character sheet was the first; the Dungeon Builder is the
  // second — it is an application surface, and every pixel the shell reserves
  // is a pixel its canvas never gets. Both draw their own chrome, so the
  // shell's header row is theirs to skip as well.
  const fullBleed =
    currentView === 'character-sheet' || currentView === 'author';

  return (
    <div
      className={`min-h-screen ${fullBleed ? 'p-0' : 'p-8'}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={fullBleed ? '' : 'max-w-7xl mx-auto'}
      >
        {/* Header — full-bleed views draw their own chrome, and the lobby
            has none. */}
        {!fullBleed && currentView !== 'lobby' && (
          <div className="flex justify-end items-center mb-6">
            <ThemeSelector />
          </div>
        )}

        {/* Show title only on home view */}
        {currentView === 'home' && (
          <header className="mb-8 text-center">
            <h1
              className="text-5xl font-bold mb-2 text-shadow"
              style={{
                fontFamily: 'Cinzel, serif',
                color: 'var(--text-primary)',
              }}
            >
              D&D Co-op Adventure
            </h1>
            <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
              Forge your legend in a shared realm
            </p>
          </header>
        )}

        {/* Main Content */}
        {!playerId && discord.isDiscord ? (
          // Show auth required message when in Discord but not authenticated
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Authentication Required
            </h2>
            <p className="text-lg mb-8" style={{ color: 'var(--text-muted)' }}>
              Please authenticate with Discord to continue
            </p>
            <button
              onClick={() => discord.authenticate()}
              className="px-6 py-3 bg-[#5865F2] text-white rounded-lg hover:bg-[#4752C4] transition-colors"
              disabled={!discord.isReady}
            >
              {discord.isReady ? 'Authenticate with Discord' : 'Loading...'}
            </button>
            {discord.error && (
              <p className="mt-4 text-red-500">{discord.error}</p>
            )}
          </motion.div>
        ) : currentView === 'lobby' &&
          (lobbyCharacterId || resumeEncounterId || resumeLobbyId) ? (
          <GameView
            characterId={lobbyCharacterId ?? resumedLobbyCharacter.characterId}
            playerId={playerId || 'test-player'}
            onBack={handleBackToHome}
            initialEncounterId={resumeEncounterId ?? undefined}
            initialLobbyId={resumeLobbyId ?? undefined}
          />
        ) : currentView === 'concepts' ? (
          <ConceptsView onBack={handleBackToHome} />
        ) : currentView === 'author' ? (
          <AuthorView
            onBack={handleBackToHome}
            characterId={selectedType === 'character' ? selectedId : null}
            onPlay={handlePlayAuthored}
          />
        ) : currentView === 'home' && resumeIdentityError ? (
          <div className="flex items-center justify-center h-screen">
            <ErrorDisplay
              title="Unable to resume the running encounter"
              message={resumeIdentityError}
            />
          </div>
        ) : currentView === 'home' && resumeLoading ? (
          // Resume-after-refresh (#444): hold Home's content one beat while
          // GetMyActiveLobby resolves, so a resumable session (routed via
          // the effect above, which flips currentView to 'lobby') never
          // flashes Home first. The common case — no active lobby — clears
          // this on the same tick loading flips false and currentView is
          // still 'home', so this fires on essentially every cold load, not
          // just resumes; kept intentionally minimal (see #444 PR body).
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
            </div>
          </div>
        ) : currentView === 'home' ? (
          <HomeView
            playerId={playerId || 'test-player'}
            sessionId="test-session"
            selectedId={selectedId}
            selectedType={selectedType}
            onSelect={handleCarouselSelect}
            onCreateClick={handleCreateCharacter}
            onPlay={handlePlay}
            onViewSheet={handleViewCharacter}
            onContinueDraft={handleResumeDraft}
            onDelete={handleDeleteCharacter}
            onDeleteDraft={handleDeleteDraft}
            onOpenAuthor={handleOpenAuthor}
          />
        ) : currentView === 'character-sheet' && currentCharacterId ? (
          <CharacterSheet
            characterId={currentCharacterId}
            onBack={handleBackToHome}
          />
        ) : draft.loading ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
              <p className="text-lg">Loading draft...</p>
            </div>
          </div>
        ) : (
          <InteractiveCharacterSheet
            onComplete={handleCharacterCreated}
            onCancel={handleCancelCreation}
          />
        )}

        {/* Dev tools buttons */}
        {showGlobalDevTools && (
          <div className="fixed bottom-4 right-4 z-50 flex gap-2">
            <button
              onClick={handleOpenConcepts}
              className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-all"
              title="Open Concepts Lab"
            >
              🧪
            </button>
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-all"
              title={showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
            >
              {showDebugPanel ? '🔧✕' : '🔧'}
            </button>
          </div>
        )}

        {/* Preserve the requested debug state while keeping all global dev
            surfaces out of Concepts Lab. */}
        {showGlobalDevTools && showDebugPanel && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-8"
          >
            <DiscordDebugPanel />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// HomeView component - combines carousel and selected panel
interface HomeViewProps {
  playerId: string;
  sessionId: string;
  selectedId: string | null;
  selectedType: 'character' | 'draft' | null;
  onSelect: (id: string, type: 'character' | 'draft') => void;
  onCreateClick: () => void;
  onPlay: (characterId: string) => void;
  onViewSheet: (characterId: string) => void;
  onContinueDraft: (draftId: string) => void;
  onDelete: (characterId: string) => void;
  onDeleteDraft: (draftId: string) => void;
  onOpenAuthor: () => void;
}

function HomeView({
  playerId,
  sessionId,
  selectedId,
  selectedType,
  onSelect,
  onCreateClick,
  onPlay,
  onViewSheet,
  onContinueDraft,
  onDelete,
  onDeleteDraft,
  onOpenAuthor,
}: HomeViewProps) {
  // Fetch characters and drafts to find selected item data
  const { data: characters } = useListCharacters({ playerId, sessionId });
  const { data: drafts } = useListDrafts({ playerId, sessionId });

  // Find the selected character or draft
  const selectedCharacter =
    selectedType === 'character' && selectedId
      ? characters.find((c) => c.id === selectedId) || null
      : null;
  const selectedDraft =
    selectedType === 'draft' && selectedId
      ? drafts.find((d) => d.id === selectedId) || null
      : null;

  return (
    <div className="space-y-8">
      {/* Home menu — real chrome, not dev-gated (rpg-project#194). Button
          is self-gating (useAuthoringGate): hidden when authoring is off
          server-side, disabled-with-retry when the server's unreachable. */}
      <div className="flex justify-center">
        <DungeonBuilderHomeButton onOpen={onOpenAuthor} />
      </div>

      {/* Character Carousel */}
      <CharacterCarousel
        playerId={playerId}
        sessionId={sessionId}
        selectedId={selectedId}
        onSelect={onSelect}
        onCreateClick={onCreateClick}
      />

      {/* Selected Character Panel */}
      <SelectedCharacterPanel
        character={selectedCharacter}
        draft={selectedDraft}
        onPlay={onPlay}
        onViewSheet={onViewSheet}
        onContinueDraft={onContinueDraft}
        onDelete={onDelete}
        onDeleteDraft={onDeleteDraft}
      />
    </div>
  );
}

function App() {
  if (
    isToolkitContributorSandboxRoute(
      import.meta.env.MODE,
      window.location.search
    ) &&
    LazyToolkitContributorSandbox
  ) {
    return (
      <Suspense fallback={null}>
        <LazyToolkitContributorSandbox />
      </Suspense>
    );
  }

  return (
    <CharacterDraftProvider>
      <AppContent />
    </CharacterDraftProvider>
  );
}

export default App;
