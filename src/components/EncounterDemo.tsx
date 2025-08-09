import { useDungeonStart, useEndTurn } from '@/api/encounterHooks';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { HexGrid } from './HexGrid';

export function EncounterDemo() {
  const { dungeonStart, loading, error } = useDungeonStart();
  const { endTurn, loading: endTurnLoading } = useEndTurn();
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const handleStartEncounter = async () => {
    try {
      // Start with 3 test characters
      const response = await dungeonStart(['char-1', 'char-2', 'char-3']);

      if (response.encounterId) {
        setEncounterId(response.encounterId);
      }

      if (response.room) {
        setRoom(response.room);
      }

      if (response.combatState) {
        setCombatState(response.combatState);
        // Select the current turn entity by default
        if (response.combatState.currentTurn?.entityId) {
          setSelectedEntity(response.combatState.currentTurn.entityId);
        }
      }
    } catch (err) {
      console.error('Failed to start dungeon:', err);
    }
  };

  const handleEntityClick = (entityId: string) => {
    setSelectedEntity(entityId);
    console.log('Selected entity:', entityId);
  };

  const handleCellClick = (x: number, y: number) => {
    console.log('Cell clicked:', x, y);
    // TODO: Implement movement when it's the selected entity's turn
  };

  const handleEndTurn = async () => {
    if (!encounterId) {
      console.error('No encounter ID available');
      return;
    }

    try {
      const response = await endTurn(encounterId);

      if (response.combatState) {
        setCombatState(response.combatState);
        // Update selected entity to the new current turn
        if (response.combatState.currentTurn?.entityId) {
          setSelectedEntity(response.combatState.currentTurn.entityId);
        }
      }
    } catch (err) {
      console.error('Failed to end turn:', err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Encounter Demo</h1>

      {/* Start button */}
      {!room && (
        <div className="mb-6">
          <button
            onClick={handleStartEncounter}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Encounter'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
              Error: {error.message}
            </div>
          )}
        </div>
      )}

      {/* Main game area */}
      {room && combatState && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Hex grid - 3 columns */}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Battle Map</h2>
              <HexGrid
                room={room}
                selectedCharacter={selectedEntity}
                onEntityClick={handleEntityClick}
                onCellClick={handleCellClick}
              />
            </div>
          </div>

          {/* Initiative order - 1 column */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Initiative Order</h2>
              <div className="space-y-2">
                {combatState.turnOrder.map((entry, index) => {
                  const isActive = index === combatState.activeIndex;
                  const isSelected = entry.entityId === selectedEntity;

                  return (
                    <div
                      key={entry.entityId}
                      className={`p-3 rounded cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-green-600 text-white'
                          : isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      onClick={() => setSelectedEntity(entry.entityId)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">
                            {entry.entityId.slice(-8)}
                          </div>
                          <div className="text-sm opacity-75">
                            {entry.entityType}
                          </div>
                        </div>
                        <div className="text-lg font-bold">
                          {entry.initiative || 10}
                        </div>
                      </div>
                      {isActive && (
                        <div className="mt-1 text-xs">Current Turn</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Turn controls */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Turn Info</h3>
                <div className="space-y-2 text-sm">
                  <div>Round: {combatState.round}</div>
                  <div>
                    Current:{' '}
                    {combatState.currentTurn?.entityId?.slice(-8) || 'None'}
                  </div>
                  {combatState.currentTurn && (
                    <>
                      <div>
                        Movement: {combatState.currentTurn.movementUsed || 0}/
                        {combatState.currentTurn.movementMax || 30}
                      </div>
                      <div>
                        Action: {combatState.currentTurn.actionUsed ? '✗' : '✓'}
                      </div>
                      <div>
                        Bonus:{' '}
                        {combatState.currentTurn.bonusActionUsed ? '✗' : '✓'}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={handleEndTurn}
                  disabled={endTurnLoading}
                  className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {endTurnLoading ? 'Processing...' : 'End Turn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
