import { motion } from 'framer-motion';
import './App.css';
import { CharacterList } from './components/CharacterList';
import { Button } from './components/ui/Button';
import { DiscordDebugPanel, useDiscord } from './discord';

function App() {
  const discord = useDiscord();
  const playerId = discord.user?.id || 'test-player';

  return (
    <div className="min-h-screen bg-board-primary p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-game font-bold text-parchment-light mb-2 text-shadow">
            D&D Co-op Adventure
          </h1>
          <p className="text-parchment-dark text-lg">
            Forge your legend in a shared realm
          </p>
        </header>

        {/* Discord Integration Info */}
        {discord.isDiscord && discord.user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="sheet-section mb-6 text-center"
          >
            <h3 className="text-lg font-game text-ink-black mb-2">
              Welcome, {discord.user.global_name || discord.user.username}!
            </h3>
            <p className="text-ink-brown">
              You're playing with {discord.participants.length} other adventurer
              {discord.participants.length !== 1 ? 's' : ''} in this session.
            </p>
          </motion.div>
        )}

        {/* Demo dice button */}
        <div className="flex justify-center mb-8">
          <Button variant="dice">D20</Button>
        </div>

        {/* Character List */}
        <CharacterList playerId={playerId} />

        {/* Debug Panel - only show in development or when explicitly enabled */}
        {(import.meta.env.MODE === 'development' ||
          import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />}
      </motion.div>
    </div>
  );
}

export default App;
