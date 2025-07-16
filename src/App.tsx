import { motion } from 'framer-motion';
import { useState } from 'react';
import './App.css';
import { InteractiveCharacterSheet } from './character/creation/InteractiveCharacterSheet';
import { ThemeSelector } from './components/ThemeSelector';
// import { DiscordDebugPanel } from './discord';

type AppView = 'character-list' | 'character-creation';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('character-list');
  // const discord = useDiscord();

  // Use Discord user ID if available, otherwise fallback to test
  // const playerId = discord.user?.id || 'test-player';

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
        {/* Theme Selector */}
        <div className="flex justify-end mb-6">
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
        {currentView === 'character-list' ? (
          <div className="text-center space-y-8">
            <div className="max-w-2xl mx-auto">
              <h2
                className="text-3xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Your Characters
              </h2>
              <p
                className="text-lg mb-8"
                style={{ color: 'var(--text-muted)' }}
              >
                No characters yet. Ready to create your first hero?
              </p>

              <button
                onClick={() => setCurrentView('character-creation')}
                className="px-8 py-4 text-xl font-bold rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border-primary)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                ⚔️ Create Character
              </button>
            </div>
          </div>
        ) : (
          <InteractiveCharacterSheet
            onComplete={handleCharacterCreated}
            onCancel={() => setCurrentView('character-list')}
          />
        )}

        {/* Temporarily hidden Discord debug panel */}
        {/* {(import.meta.env.MODE === 'development' ||
          import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />} */}
      </motion.div>
    </div>
  );
}

export default App;
