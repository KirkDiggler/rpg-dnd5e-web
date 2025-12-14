import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

interface CreateGameTabProps {
  characters: Character[];
  selectedCharacterId: string | null;
  onSelectCharacter: (characterId: string) => void;
  onCreateLobby: () => void;
  loading: boolean;
  charactersLoading: boolean;
}

/**
 * CreateGameTab - Tab content for creating a new multiplayer lobby
 *
 * Shows:
 * - Character selection list
 * - Create Lobby button
 */
export function CreateGameTab({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onCreateLobby,
  loading,
  charactersLoading,
}: CreateGameTabProps) {
  return (
    <div className="space-y-4">
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
            <p className="text-sm">Create a character first to host a game</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
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

      <button
        onClick={onCreateLobby}
        disabled={loading || !selectedCharacterId}
        className="w-full px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
        style={{
          backgroundColor:
            loading || !selectedCharacterId
              ? 'var(--bg-secondary)'
              : 'var(--accent-primary)',
          color: 'white',
        }}
      >
        {loading ? 'Creating Lobby...' : 'Create Lobby'}
      </button>
    </div>
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
