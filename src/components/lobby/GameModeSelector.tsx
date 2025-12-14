interface GameModeSelectorProps {
  onSelectSolo: () => void;
  onSelectMultiplayer: () => void;
}

/**
 * GameModeSelector - Entry point for choosing Solo or Multiplayer mode
 *
 * Displays two large clickable cards for:
 * - Solo Play: Jump directly into encounter with your characters
 * - Multiplayer: Create or join a lobby with other players
 */
export function GameModeSelector({
  onSelectSolo,
  onSelectMultiplayer,
}: GameModeSelectorProps) {
  return (
    <div
      className="rounded-lg shadow-xl p-6"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
      }}
    >
      <h2
        className="text-xl font-semibold mb-6 text-center"
        style={{ color: 'var(--text-primary)' }}
      >
        Choose Game Mode
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Solo Play Card */}
        <button
          onClick={onSelectSolo}
          className="p-6 rounded-lg border-2 transition-all hover:scale-[1.02] text-left"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
            e.currentTarget.style.backgroundColor =
              'var(--bg-tertiary, var(--bg-secondary))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          }}
        >
          <div className="text-4xl mb-3">🎮</div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Solo Play
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Start an encounter with your own characters. Perfect for testing
            builds or quick sessions.
          </p>
        </button>

        {/* Multiplayer Card */}
        <button
          onClick={onSelectMultiplayer}
          className="p-6 rounded-lg border-2 transition-all hover:scale-[1.02] text-left"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
            e.currentTarget.style.backgroundColor =
              'var(--bg-tertiary, var(--bg-secondary))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          }}
        >
          <div className="text-4xl mb-3">👥</div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Multiplayer
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Create or join a lobby to play with friends. Share a code and battle
            together.
          </p>
        </button>
      </div>
    </div>
  );
}
