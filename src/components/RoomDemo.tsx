import { useDungeonStart } from '@/api';
import { useDiscord } from '@/discord';
import { useState } from 'react';
import { HexGrid } from './HexGrid';

export function RoomDemo() {
  const { dungeonStart, loading, error, data } = useDungeonStart();
  const [characterIds, setCharacterIds] = useState<string[]>([
    'char1',
    'char2',
    'char3',
  ]);
  const discord = useDiscord();
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');

  const handleGenerateRoom = async () => {
    try {
      await dungeonStart(characterIds);
    } catch (error) {
      console.error('Failed to generate room:', error);
    }
  };

  const handleAddCharacter = () => {
    const newId = `char${characterIds.length + 1}`;
    setCharacterIds([...characterIds, newId]);
  };

  const handleRemoveCharacter = (index: number) => {
    setCharacterIds(characterIds.filter((_, i) => i !== index));
  };

  const handleCharacterIdChange = (index: number, newId: string) => {
    const newIds = [...characterIds];
    newIds[index] = newId;
    setCharacterIds(newIds);
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
              <li>Configure character IDs for the party</li>
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

          {/* Character ID Configuration */}
          <div className="mb-6">
            <h3
              className="text-md font-semibold mb-3"
              style={{ color: 'var(--text-primary)' }}
            >
              Party Configuration
            </h3>
            <div className="space-y-2">
              {characterIds.map((id, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={id}
                    onChange={(e) =>
                      handleCharacterIdChange(index, e.target.value)
                    }
                    className="px-3 py-1 border rounded flex-1"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-primary)',
                    }}
                    placeholder={`Character ${index + 1} ID`}
                  />
                  <button
                    onClick={() => handleRemoveCharacter(index)}
                    disabled={characterIds.length <= 1}
                    className="px-3 py-1 text-sm rounded transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddCharacter}
                className="px-4 py-2 text-sm rounded transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                Add Character
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <div className="text-center mb-6">
            <button
              onClick={handleGenerateRoom}
              disabled={loading || characterIds.length === 0}
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
                    {data.room.entities.length}
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

              {/* Hex Grid */}
              <div className="flex justify-center">
                <HexGrid room={data.room} cellSize={35} />
              </div>

              {/* Entity Details */}
              {data.room.entities.length > 0 && (
                <div className="mt-6">
                  <h4
                    className="text-md font-semibold mb-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Entity Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.room.entities.map((entity) => (
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
                          {entity.entityId}
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Type: {entity.entityType}
                        </div>
                        {entity.position && (
                          <div
                            className="text-sm"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Position: ({entity.position.x}, {entity.position.y})
                          </div>
                        )}
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
            Player ID: {playerId} | Character IDs: {characterIds.join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
}
