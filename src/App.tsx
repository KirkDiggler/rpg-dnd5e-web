import { motion } from 'framer-motion';
import './App.css';
import { ThemeSelector } from './components/ThemeSelector';
import { Button } from './components/ui/Button';
import { DiscordDebugPanel } from './discord';

function App() {
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

        <div className="flex justify-center mb-8">
          <Button variant="dice">D20</Button>
        </div>

        <div className="text-center" style={{ color: 'var(--text-primary)' }}>
          <p>
            App is working! Try switching themes above to see different
            aesthetics.
          </p>
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Character list will be added back once we fix the API issue.
          </p>
        </div>

        {(import.meta.env.MODE === 'development' ||
          import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />}
      </motion.div>
    </div>
  );
}

export default App;
