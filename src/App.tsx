import { motion } from 'framer-motion';
import { useState } from 'react';
import './App.css';
import { CharacterCreationWizard } from './character/creation/CharacterCreationWizard';
import { CharacterList } from './components/CharacterList';
import { ThemeSelector } from './components/ThemeSelector';
import { DiscordDebugPanel, useDiscord } from './discord';

type AppView = 'character-list' | 'character-creation';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('character-list');
  const discord = useDiscord();

  // Use Discord user ID if available, otherwise fallback to test
  const playerId = discord.user?.id || 'test-player';

  const handleCharacterCreated = (characterId: string) => {
    console.log('Character created:', characterId);
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
          <CharacterList
            playerId={playerId}
            onCreateCharacter={() => setCurrentView('character-creation')}
          />
        ) : (
          <CharacterCreationWizard
            onComplete={handleCharacterCreated}
            onCancel={() => setCurrentView('character-list')}
          />
        )}

        {(import.meta.env.MODE === 'development' ||
          import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />}
      </motion.div>
    </div>
  );
}

export default App;
