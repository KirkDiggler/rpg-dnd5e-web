import { useListCharacters } from './api';
import './App.css';
import { DiscordDebugPanel, useDiscord } from './discord';

function App() {
  const discord = useDiscord();
  const {
    data: characters,
    loading,
    error,
  } = useListCharacters({ playerId: 'test-player' });

  return (
    <div className="App">
      <h1>RPG D&D 5e Web</h1>
      <p>Welcome to the D&D 5e Discord Activity!</p>

      <div style={{ marginTop: '2rem' }}>
        <p>Environment: {import.meta.env.MODE}</p>
        <p>API Host: {import.meta.env.VITE_API_HOST || 'Not configured'}</p>
        <p>
          Discord Client ID:{' '}
          {import.meta.env.VITE_DISCORD_CLIENT_ID || 'Not configured'}
        </p>
      </div>

      {/* Discord Integration Info */}
      {discord.isDiscord && discord.user && (
        <div
          style={{
            marginTop: '2rem',
            padding: '1rem',
            background: '#dcfce7',
            borderRadius: '8px',
          }}
        >
          <h3>
            🎮 Welcome to the Activity,{' '}
            {discord.user.global_name || discord.user.username}!
          </h3>
          <p>
            You're playing with {discord.participants.length} other(s) in this
            session.
          </p>
        </div>
      )}

      {/* Character List */}
      <div style={{ marginTop: '2rem' }}>
        <h2>Characters</h2>
        {loading && <p>Loading characters...</p>}
        {error && <p>Error: {error.message}</p>}
        {characters.length === 0 && !loading && !error && (
          <p>No characters found.</p>
        )}
        {characters.length > 0 && (
          <ul style={{ textAlign: 'left' }}>
            {characters.map((character) => (
              <li key={character.id}>
                <strong>{character.name}</strong> - Level {character.level}{' '}
                {character.race} {character.class}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Debug Panel - only show in development or when explicitly enabled */}
      {(import.meta.env.MODE === 'development' ||
        import.meta.env.VITE_SHOW_DEBUG === 'true') && <DiscordDebugPanel />}
    </div>
  );
}

export default App;
