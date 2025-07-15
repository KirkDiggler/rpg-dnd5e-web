import './App.css';
import { useListCharacters } from './api';

function App() {
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
      </div>

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
    </div>
  );
}

export default App;
