import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

interface PartySetupPanelProps {
  availableCharacters: Character[];
  selectedCharacterIds: string[];
  onCharacterToggle: (characterId: string) => void;
  onStartEncounter: () => void;
  loading: boolean;
  charactersLoading: boolean;
  error: Error | null;
}

export function PartySetupPanel({
  availableCharacters,
  selectedCharacterIds,
  onCharacterToggle,
  onStartEncounter,
  loading,
  charactersLoading,
  error,
}: PartySetupPanelProps) {
  const getSelectedCharacters = (): Character[] => {
    return availableCharacters.filter((char) =>
      selectedCharacterIds.includes(char.id)
    );
  };

  return (
    <div
      className="rounded-lg shadow-xl p-6"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
      }}
    >
      <h2
        className="text-xl font-semibold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Party Configuration
      </h2>

      {charactersLoading ? (
        <div className="text-center p-4" style={{ color: 'var(--text-muted)' }}>
          Loading characters...
        </div>
      ) : availableCharacters.length === 0 ? (
        <div
          className="p-4 rounded border-2 border-dashed text-center"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
          }}
        >
          <p className="mb-2">No characters available</p>
          <p className="text-sm">
            Create some characters first to use them in encounters
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h3
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Select Characters ({availableCharacters.length} available)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {availableCharacters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isSelected={selectedCharacterIds.includes(character.id)}
                  onToggle={() => onCharacterToggle(character.id)}
                />
              ))}
            </div>
          </div>

          {selectedCharacterIds.length > 0 && (
            <SelectedPartyDisplay
              characters={getSelectedCharacters()}
              onRemove={onCharacterToggle}
            />
          )}
        </>
      )}

      <div className="flex justify-center">
        <button
          onClick={onStartEncounter}
          disabled={loading || selectedCharacterIds.length === 0}
          className="px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
          style={{
            backgroundColor: loading
              ? 'var(--bg-secondary)'
              : 'var(--accent-primary)',
            color: 'white',
            border: 'none',
          }}
        >
          {loading ? 'Starting Encounter...' : 'Start Encounter'}
        </button>
      </div>

      {error && (
        <div
          className="mt-4 p-4 rounded"
          style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
        >
          <h3 className="font-semibold mb-1">Error:</h3>
          <p className="text-sm">{error.message}</p>
        </div>
      )}
    </div>
  );
}

// Character selection card
function CharacterCard({
  character,
  isSelected,
  onToggle,
}: {
  character: Character;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-opacity-80 transition-colors"
      style={{
        backgroundColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--bg-secondary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--border-primary)',
        color: isSelected ? 'white' : 'var(--text-primary)',
      }}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="rounded"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1">
        <div className="font-semibold">{character.name}</div>
        <div className="text-sm opacity-90">
          {formatCharacterSummary(
            character.level,
            character.race,
            character.class
          )}
        </div>
      </div>
      <div className="text-sm opacity-75">
        HP: {character.currentHitPoints || 0}
      </div>
    </div>
  );
}

// Selected party display
function SelectedPartyDisplay({
  characters,
  onRemove,
}: {
  characters: Character[];
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="p-3 rounded mb-4"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <h4
        className="text-sm font-medium mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Selected Party ({characters.length} members)
      </h4>
      <div className="flex flex-wrap gap-2">
        {characters.map((character) => (
          <span
            key={character.id}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
            }}
          >
            {character.name}
            <button
              onClick={() => onRemove(character.id)}
              className="ml-1 text-white hover:text-gray-200"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
