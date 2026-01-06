import { motion } from 'framer-motion';
import { useState } from 'react';
import { useListCharacters, useListDrafts } from './api/hooks';
import './App.css';
import { CharacterDraftProvider } from './character/creation/CharacterDraftContext';
import { InteractiveCharacterSheet } from './character/creation/InteractiveCharacterSheet';
import { useCharacterDraft } from './character/creation/useCharacterDraft';
import { CharacterSheet } from './character/sheet/CharacterSheet';
import { CharacterCarousel, SelectedCharacterPanel } from './components/home';
import { LobbyView } from './components/LobbyView';
import { ThemeSelector } from './components/ThemeSelector';
import { DiscordDebugPanel, useDiscord } from './discord';

type AppView = 'home' | 'character-creation' | 'character-sheet' | 'lobby';

function AppContent() {
  const [currentView, setCurrentView] = useState<AppView>('home');
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

  const discord = useDiscord();
  const draft = useCharacterDraft();

  // In production, require Discord auth. In dev, allow test player
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : null);

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
    setCurrentView('home');
  };

  // Carousel selection handler
  const handleCarouselSelect = (id: string, type: 'character' | 'draft') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  // Play button handler - go to lobby with selected character
  const handlePlay = (characterId: string) => {
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

  return (
    <div
      className={`min-h-screen ${currentView === 'character-sheet' ? 'p-0' : 'p-8'}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={currentView === 'character-sheet' ? '' : 'max-w-7xl mx-auto'}
      >
        {/* Header - Hide on character sheet and lobby */}
        {currentView !== 'character-sheet' && currentView !== 'lobby' && (
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
        ) : currentView === 'lobby' ? (
          <LobbyView characterId={lobbyCharacterId} onBack={handleBackToHome} />
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
          />
        ) : currentView === 'character-sheet' && currentCharacterId ? (
          <CharacterSheet
            characterId={currentCharacterId}
            onBack={handleBackToHome}
          />
        ) : draft.loading || draft.saving ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
              <p className="text-lg">
                {draft.saving ? 'Creating character...' : 'Loading draft...'}
              </p>
            </div>
          </div>
        ) : (
          <InteractiveCharacterSheet
            onComplete={handleCharacterCreated}
            onCancel={handleCancelCreation}
          />
        )}

        {/* Debug panel toggle button */}
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-all"
            title={showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
          >
            {showDebugPanel ? '🔧✕' : '🔧'}
          </button>
        </div>

        {/* Discord debug panel - show based on state */}
        {showDebugPanel && (
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
  return (
    <CharacterDraftProvider>
      <AppContent />
    </CharacterDraftProvider>
  );
}

export default App;
