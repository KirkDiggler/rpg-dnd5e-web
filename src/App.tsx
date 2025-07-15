import { motion } from 'framer-motion';
import './App.css';
import { Button } from './components/ui/Button';
import { DiscordDebugPanel } from './discord';

function App() {
  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: 'var(--board-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        <header className="mb-8 text-center">
          <h1
            className="text-5xl font-bold mb-2 text-shadow"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--parchment-light)',
            }}
          >
            D&D Co-op Adventure
          </h1>
          <p className="text-lg" style={{ color: 'var(--parchment-dark)' }}>
            Forge your legend in a shared realm
          </p>
        </header>

        <div className="flex justify-center mb-8">
          <Button variant="dice">D20</Button>
        </div>

        <div
          className="text-center"
          style={{ color: 'var(--parchment-light)' }}
        >
          <p>
            App is working! Character list will be added back once we fix the
            API issue.
          </p>
        </div>

        {(import.meta.env.MODE === 'development' ||
          import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />}
      </motion.div>
    </div>
  );
}

export default App;
