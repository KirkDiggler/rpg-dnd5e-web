import { motion } from 'framer-motion';
import { useState } from 'react';
import './App.css';
import { CharacterDraftProvider } from './character/creation/CharacterDraftContext';
import { InteractiveCharacterSheet } from './character/creation/InteractiveCharacterSheet';
import { CharacterList } from './components/CharacterList';
import { ThemeSelector } from './components/ThemeSelector';
import { UnifiedChoiceDemo } from './components/UnifiedChoiceDemo';
import { DiscordDebugPanel, useDiscord } from './discord';

type AppView = 'character-list' | 'character-creation' | 'choice-demo';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('character-list');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const discord = useDiscord();

  // In production, require Discord auth. In dev, allow test player
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : null);

  const handleCharacterCreated = () => {
    setCurrentView('character-list');
  };

  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        {/* Theme Selector and Demo Link */}
        <div className="flex justify-between mb-6">
          <button
            onClick={() =>
              setCurrentView(
                currentView === 'choice-demo' ? 'character-list' : 'choice-demo'
              )
            }
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {currentView === 'choice-demo'
              ? 'Back to Characters'
              : 'Choice System Demo'}
          </button>
          <ThemeSelector />
        </div>

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
        ) : currentView === 'choice-demo' ? (
          <UnifiedChoiceDemo />
        ) : currentView === 'character-list' ? (
          <CharacterList
            playerId={playerId || 'test-player'}
            sessionId="test-session"
            onCreateCharacter={() => setCurrentView('character-creation')}
          />
        ) : (
          <CharacterDraftProvider>
            <InteractiveCharacterSheet
              onComplete={handleCharacterCreated}
              onCancel={() => setCurrentView('character-list')}
            />
          </CharacterDraftProvider>
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

export default App;
