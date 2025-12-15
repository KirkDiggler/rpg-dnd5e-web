import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';

interface JoinGameTabProps {
  characters: Character[];
  selectedCharacterId: string | null;
  onSelectCharacter: (characterId: string) => void;
  onJoinLobby: (code: string) => void;
  loading: boolean;
  charactersLoading: boolean;
  error?: string | null;
}

/**
 * JoinGameTab - Tab content for joining an existing lobby
 *
 * Shows:
 * - Character selection list
 * - Join code input field
 * - Join button
 * - Error message if join fails
 */
export function JoinGameTab({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onJoinLobby,
  loading,
  charactersLoading,
  error,
}: JoinGameTabProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() && selectedCharacterId) {
      onJoinLobby(code.trim().toUpperCase());
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to uppercase and limit to 6 characters
    const value = e.target.value.toUpperCase().slice(0, 6);
    setCode(value);
  };

  const canJoin = code.length === 6 && selectedCharacterId && !loading;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Character Selection */}
      <div>
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Select Your Character
        </h3>

        {charactersLoading ? (
          <div
            className="text-center p-4"
            style={{ color: 'var(--text-muted)' }}
          >
            Loading characters...
          </div>
        ) : characters.length === 0 ? (
          <div
            className="p-4 rounded border-2 border-dashed text-center"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
            }}
          >
            <p className="mb-2">No characters available</p>
            <p className="text-sm">Create a character first to join a game</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
            {characters.map((character) => (
              <CharacterOption
                key={character.id}
                character={character}
                isSelected={selectedCharacterId === character.id}
                onSelect={() => onSelectCharacter(character.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Join Code Input */}
      <div>
        <label
          htmlFor="join-code"
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Enter Join Code
        </label>
        <input
          id="join-code"
          type="text"
          value={code}
          onChange={handleCodeChange}
          placeholder="ABC123"
          className="w-full px-4 py-3 rounded-lg text-center text-2xl font-mono font-bold tracking-widest uppercase"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          autoComplete="off"
        />
        <p
          className="mt-2 text-sm text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          Ask the host for their 6-character code
        </p>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canJoin}
        className="w-full px-6 py-4 rounded-lg font-bold text-lg transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
        style={{
          backgroundColor: canJoin ? '#8b5cf6' : '#4b5563',
          color: 'white',
          boxShadow: canJoin ? '0 4px 14px rgba(139, 92, 246, 0.4)' : 'none',
        }}
      >
        {loading ? 'Joining...' : '🎮 Join Game'}
      </button>
    </form>
  );
}

function CharacterOption({
  character,
  isSelected,
  onSelect,
}: {
  character: Character;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-3 p-3 rounded-lg border text-left transition-colors w-full"
      style={{
        backgroundColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--bg-secondary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--border-primary)',
        color: isSelected ? 'white' : 'var(--text-primary)',
      }}
    >
      <div
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
        style={{
          borderColor: isSelected ? 'white' : 'var(--border-primary)',
          backgroundColor: isSelected ? 'white' : 'transparent',
        }}
      >
        {isSelected && (
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{character.name}</div>
        <div className="text-sm truncate" style={{ opacity: 0.8 }}>
          {formatCharacterSummary(
            character.level,
            character.race,
            character.class
          )}
        </div>
      </div>
      <div className="text-sm" style={{ opacity: 0.7 }}>
        HP: {character.currentHitPoints || 0}
      </div>
    </button>
  );
}
