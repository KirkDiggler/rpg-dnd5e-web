import { create } from '@bufbuild/protobuf';
import { FinalizeDraftRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';
import './App.css';
import { useFinalizeDraft } from './api/hooks';
import { CharacterDraftProvider } from './character/creation/CharacterDraftContext';
import { InteractiveCharacterSheet } from './character/creation/InteractiveCharacterSheet';
import { useCharacterDraft } from './character/creation/useCharacterDraft';
import { CharacterSheet } from './character/sheet/CharacterSheet';
import { CharacterList } from './components/CharacterList';
import { RoomDemo } from './components/RoomDemo';
import { ThemeSelector } from './components/ThemeSelector';
import { DiscordDebugPanel, useDiscord } from './discord';

type AppView =
  | 'character-list'
  | 'character-creation'
  | 'character-sheet'
  | 'room-demo';

function AppContent() {
  const [currentView, setCurrentView] = useState<AppView>('character-list');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(
    null
  );
  const discord = useDiscord();
  const draft = useCharacterDraft();
  const { finalizeDraft, loading: finalizing } = useFinalizeDraft();

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

  const handleCharacterCreated = async () => {
    if (!draft.draftId) {
      console.error('No draft ID available');
      return;
    }

    try {
      // Finalize the draft to create a character
      const request = create(FinalizeDraftRequestSchema, {
        draftId: draft.draftId,
      });

      const response = await finalizeDraft(request);

      if (response.character) {
        console.log('Character created:', response.character.id);
        // Navigate to the new character sheet
        setCurrentCharacterId(response.character.id);
        setCurrentView('character-sheet');
        // Reset draft after successful navigation
        draft.reset();
      } else {
        // If no character was created, reset draft and go back to character list
        draft.reset();
        setCurrentView('character-list');
      }
    } catch (error) {
      console.error('Failed to finalize character:', error);
    }
  };

  const handleCancelCreation = () => {
    draft.reset();
    setCurrentView('character-list');
  };

  const handleViewCharacter = (characterId: string) => {
    setCurrentCharacterId(characterId);
    setCurrentView('character-sheet');
  };

  const handleBackToCharacterList = () => {
    setCurrentCharacterId(null);
    setCurrentView('character-list');
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
        {/* Theme Selector and Demo Toggle - Hide on character sheet */}
        {currentView !== 'character-sheet' && (
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() =>
                setCurrentView(
                  currentView === 'room-demo' ? 'character-list' : 'room-demo'
                )
              }
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor:
                  currentView === 'room-demo'
                    ? 'var(--accent-primary)'
                    : 'var(--bg-secondary)',
                color:
                  currentView === 'room-demo' ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {currentView === 'room-demo'
                ? '← Back to Character List'
                : '🏰 Enter Room Demo'}
            </button>
            <ThemeSelector />
          </div>
        )}

        {/* Show header only when not viewing character sheet */}
        {currentView !== 'character-sheet' && (
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
        ) : currentView === 'room-demo' ? (
          <RoomDemo />
        ) : currentView === 'character-list' ? (
          <CharacterList
            playerId={playerId || 'test-player'}
            sessionId="test-session"
            onCreateCharacter={handleCreateCharacter}
            onResumeDraft={handleResumeDraft}
            onViewCharacter={handleViewCharacter}
          />
        ) : currentView === 'character-sheet' && currentCharacterId ? (
          <CharacterSheet
            characterId={currentCharacterId}
            onBack={handleBackToCharacterList}
          />
        ) : draft.loading || finalizing ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
              <p className="text-lg">
                {finalizing ? 'Creating character...' : 'Loading draft...'}
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

function App() {
  return (
    <CharacterDraftProvider>
      <AppContent />
    </CharacterDraftProvider>
  );
}

export default App;
