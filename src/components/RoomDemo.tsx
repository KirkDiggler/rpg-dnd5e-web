import { useDungeonStart, useListCharacters } from '@/api';
import { useDiscord } from '@/discord';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useState } from 'react';
import { Equipment } from './Equipment';
import { HexGrid } from './HexGrid';
import { TestModal } from './TestModal';

// Helper functions for display names
function getRaceDisplayName(raceEnum: Race): string {
  const raceNames: Record<Race, string> = {
    [Race.UNSPECIFIED]: 'Unknown',
    [Race.HUMAN]: 'Human',
    [Race.ELF]: 'Elf',
    [Race.DWARF]: 'Dwarf',
    [Race.HALFLING]: 'Halfling',
    [Race.DRAGONBORN]: 'Dragonborn',
    [Race.GNOME]: 'Gnome',
    [Race.HALF_ELF]: 'Half-Elf',
    [Race.HALF_ORC]: 'Half-Orc',
    [Race.TIEFLING]: 'Tiefling',
  };
  return raceNames[raceEnum] || 'Unknown Race';
}

function getClassDisplayName(classEnum: Class): string {
  const classNames: Record<Class, string> = {
    [Class.UNSPECIFIED]: 'Unknown',
    [Class.BARBARIAN]: 'Barbarian',
    [Class.BARD]: 'Bard',
    [Class.CLERIC]: 'Cleric',
    [Class.DRUID]: 'Druid',
    [Class.FIGHTER]: 'Fighter',
    [Class.MONK]: 'Monk',
    [Class.PALADIN]: 'Paladin',
    [Class.RANGER]: 'Ranger',
    [Class.ROGUE]: 'Rogue',
    [Class.SORCERER]: 'Sorcerer',
    [Class.WARLOCK]: 'Warlock',
    [Class.WIZARD]: 'Wizard',
  };
  return classNames[classEnum] || 'Unknown Class';
}

export function RoomDemo() {
  const { dungeonStart, loading, error, data } = useDungeonStart();
  const discord = useDiscord();
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');

  // Fetch user's characters
  const { data: availableCharacters, loading: charactersLoading } =
    useListCharacters({
      playerId,
      sessionId: isDevelopment ? 'test-session' : undefined,
    });

  // Selected characters for the party
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  // Selected character for movement/actions
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    null
  );
  // Hovered entity info
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  // Equipment modal state
  const [equipmentCharacterId, setEquipmentCharacterId] = useState<
    string | null
  >(null);
  // Test modal state
  const [showTestModal, setShowTestModal] = useState(false);

  const handleGenerateRoom = async () => {
    try {
      await dungeonStart(selectedCharacterIds);
    } catch (error) {
      console.error('Failed to generate room:', error);
    }
  };

  const handleCharacterToggle = (characterId: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((id) => id !== characterId)
        : [...prev, characterId]
    );
  };

  const getSelectedCharacters = (): Character[] => {
    return availableCharacters.filter((char) =>
      selectedCharacterIds.includes(char.id)
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCellClick = (_x: number, _y: number) => {
    // TODO: Implement movement logic when selectedCharacter is set
    if (selectedCharacter) {
      // Moving character to new position
    }
  };

  const handleEntityClick = (entityId: string) => {
    // If it's a character in our party, select it for movement
    const character = availableCharacters.find((c) => c.id === entityId);
    if (character && selectedCharacterIds.includes(entityId)) {
      setSelectedCharacter(selectedCharacter === entityId ? null : entityId);
    }
  };

  const handleEntityHover = (entityId: string | null) => {
    setHoveredEntity(entityId);
  };

  const getEntityDisplayInfo = (entityId: string) => {
    if (!entityId || !data?.room) return null;

    const entity = Object.values(data.room.entities).find(
      (e) => e.entityId === entityId
    );
    if (!entity) return null;

    const character = availableCharacters.find((c) => c.id === entityId);
    if (character) {
      return {
        name: character.name,
        details: `Level ${character.level} ${getRaceDisplayName(character.race)} ${getClassDisplayName(character.class)}`,
        hp: `${character.currentHitPoints} HP`,
        type: 'Player Character',
      };
    }

    return {
      name: entity.entityId,
      details: `Type: ${entity.entityType}`,
      position: entity.position
        ? `(${entity.position.x}, ${entity.position.y})`
        : 'Unknown position',
      type: entity.entityType,
    };
  };

  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Hex Grid Room Demo
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            Generate and visualize D&D 5e dungeon rooms with hex grids
          </p>
        </div>

        <div
          className="rounded-lg shadow-xl p-6 mb-6"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '2px solid var(--border-primary)',
          }}
        >
          <div
            className="mb-4 p-4 rounded"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              How it works:
            </h2>
            <ol
              className="list-decimal list-inside space-y-1 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <li>Select characters from your character list for the party</li>
              <li>
                Click "Generate Room" to call the EncounterService.DungeonStart
                RPC
              </li>
              <li>
                View the generated 10x10 hex grid room with pointy-top
                orientation
              </li>
              <li>See characters and monsters placed on the grid</li>
            </ol>
          </div>

          {/* Character Selection */}
          <div className="mb-6">
            <h3
              className="text-md font-semibold mb-3"
              style={{ color: 'var(--text-primary)' }}
            >
              Party Configuration
            </h3>

            {charactersLoading ? (
              <div
                className="text-center p-4"
                style={{ color: 'var(--text-muted)' }}
              >
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
                  <h4
                    className="text-sm font-medium mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Available Characters ({availableCharacters.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {availableCharacters.map((character) => (
                      <div
                        key={character.id}
                        className="flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-opacity-80 transition-colors"
                        style={{
                          backgroundColor: selectedCharacterIds.includes(
                            character.id
                          )
                            ? 'var(--accent-primary)'
                            : 'var(--bg-secondary)',
                          borderColor: selectedCharacterIds.includes(
                            character.id
                          )
                            ? 'var(--accent-primary)'
                            : 'var(--border-primary)',
                          color: selectedCharacterIds.includes(character.id)
                            ? 'white'
                            : 'var(--text-primary)',
                        }}
                        onClick={() => handleCharacterToggle(character.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCharacterIds.includes(character.id)}
                          onChange={() => handleCharacterToggle(character.id)}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <div className="font-semibold">{character.name}</div>
                          <div className="text-sm opacity-90">
                            Level {character.level}{' '}
                            {getRaceDisplayName(character.race)}{' '}
                            {getClassDisplayName(character.class)}
                          </div>
                        </div>
                        <div className="text-sm opacity-75">
                          HP: {character.currentHitPoints || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedCharacterIds.length > 0 && (
                  <div
                    className="p-3 rounded"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <h4
                      className="text-sm font-medium mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Selected Party ({selectedCharacterIds.length})
                    </h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {getSelectedCharacters().map((character) => (
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
                            onClick={() => handleCharacterToggle(character.id)}
                            className="ml-1 text-white hover:text-gray-200"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Equipment Management Buttons */}
                    <div className="pt-3 border-t border-gray-600">
                      <h5
                        className="text-xs font-medium mb-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Manage Equipment:
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {getSelectedCharacters().map((character) => (
                          <button
                            key={`equipment-${character.id}`}
                            onClick={() => {
                              setEquipmentCharacterId(character.id);
                            }}
                            className="px-3 py-1 rounded text-sm font-medium transition-colors hover:opacity-90"
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-primary)',
                            }}
                          >
                            {character.name} Equipment
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Generate Button */}
          <div className="text-center mb-6">
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleGenerateRoom}
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
                {loading ? 'Generating Room...' : 'Generate Room'}
              </button>
              <button
                onClick={() => setShowTestModal(true)}
                className="px-4 py-2 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--accent-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                Test Modal
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div
              className="p-4 rounded mb-6"
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            >
              <h3 className="font-semibold mb-1">Error:</h3>
              <p className="text-sm">{error.message}</p>
            </div>
          )}

          {/* Room Visualization */}
          {data?.room && (
            <div>
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Generated Room: {data.room.type} (ID: {data.encounterId})
              </h3>

              {/* Room Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Dimensions
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {data.room.width} × {data.room.height}
                  </div>
                </div>
                <div
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Grid Type
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Hex Pointy-Top
                  </div>
                </div>
                <div
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Entities
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {Object.keys(data.room.entities).length}
                  </div>
                </div>
                <div
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Room Type
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {data.room.type}
                  </div>
                </div>
              </div>

              {/* Character Controls */}
              {selectedCharacterIds.length > 0 && (
                <div className="mb-6">
                  <h4
                    className="text-md font-semibold mb-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Character Controls
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {getSelectedCharacters().map((character) => {
                      const isSelected = selectedCharacter === character.id;
                      return (
                        <button
                          key={character.id}
                          onClick={() =>
                            setSelectedCharacter(
                              isSelected ? null : character.id
                            )
                          }
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            isSelected ? 'ring-2 ring-orange-500' : ''
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? 'var(--accent-primary)'
                              : 'var(--bg-secondary)',
                            color: isSelected ? 'white' : 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                          }}
                        >
                          {character.name}
                          {isSelected && (
                            <span className="ml-1 text-xs">(Active)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCharacter && (
                    <p
                      className="text-sm mt-2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Click on a hex cell to move{' '}
                      {
                        getSelectedCharacters().find(
                          (c) => c.id === selectedCharacter
                        )?.name
                      }
                    </p>
                  )}

                  {/* Equipment Management */}
                  <div className="mt-4">
                    <h5
                      className="text-sm font-medium mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Equipment Management
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {getSelectedCharacters().map((character) => (
                        <button
                          key={`equipment-${character.id}`}
                          onClick={() => {
                            setEquipmentCharacterId(character.id);
                          }}
                          className="px-3 py-1 rounded text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            color: 'white',
                            border: '1px solid var(--border-primary)',
                          }}
                        >
                          {character.name} Equipment
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Hex Grid */}
              <div className="flex justify-center">
                <HexGrid
                  room={data.room}
                  cellSize={35}
                  selectedCharacter={selectedCharacter}
                  onCellClick={handleCellClick}
                  onEntityClick={handleEntityClick}
                  onEntityHover={handleEntityHover}
                />
              </div>

              {/* Entity Info Display */}
              {hoveredEntity && (
                <div className="mt-4">
                  <div
                    className="p-3 rounded border"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    {(() => {
                      const info = getEntityDisplayInfo(hoveredEntity);
                      if (!info) return null;
                      return (
                        <div>
                          <h5
                            className="font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {info.name}
                          </h5>
                          <p
                            className="text-sm"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {info.details}
                          </p>
                          {info.hp && (
                            <p
                              className="text-sm"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {info.hp}
                            </p>
                          )}
                          {info.position && (
                            <p
                              className="text-sm"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Position: {info.position}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Entity Details */}
              {Object.keys(data.room.entities).length > 0 && (
                <div className="mt-6">
                  <h4
                    className="text-md font-semibold mb-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Entity Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.values(data.room.entities).map((entity) => (
                      <div
                        key={entity.entityId}
                        className="p-3 rounded border"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderColor: 'var(--border-primary)',
                        }}
                      >
                        <div
                          className="font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {(() => {
                            const character = availableCharacters.find(
                              (c) => c.id === entity.entityId
                            );
                            return character ? character.name : entity.entityId;
                          })()}
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {(() => {
                            const character = availableCharacters.find(
                              (c) => c.id === entity.entityId
                            );
                            return character
                              ? `Level ${character.level} ${getRaceDisplayName(character.race)} ${getClassDisplayName(character.class)}`
                              : `Type: ${entity.entityType}`;
                          })()}
                        </div>
                        {entity.position && (
                          <div
                            className="text-sm"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Position: ({entity.position.x}, {entity.position.y})
                          </div>
                        )}
                        {(() => {
                          const character = availableCharacters.find(
                            (c) => c.id === entity.entityId
                          );
                          return (
                            character && (
                              <div
                                className="text-sm"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                HP: {character.currentHitPoints} | AC:{' '}
                                {character.combatStats?.armorClass || 10}
                              </div>
                            )
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="mt-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Player ID: {playerId} | Selected Characters:{' '}
            {getSelectedCharacters()
              .map((c) => c.name)
              .join(', ') || 'None'}
            {selectedCharacter && (
              <span>
                {' '}
                | Active:{' '}
                {
                  getSelectedCharacters().find(
                    (c) => c.id === selectedCharacter
                  )?.name
                }
              </span>
            )}
          </p>
        </div>

        {/* Test Modal */}
        {showTestModal && <TestModal onClose={() => setShowTestModal(false)} />}

        {/* Equipment Modal */}
        {equipmentCharacterId && (
          <Equipment
            characterId={equipmentCharacterId}
            onClose={() => {
              setEquipmentCharacterId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
