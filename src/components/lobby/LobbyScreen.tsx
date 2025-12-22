import {
  useCreateEncounter,
  useJoinEncounter,
  useLeaveEncounter,
  useSetReady,
  useStartCombat,
} from '@/api/lobbyHooks';
import { useEncounterStream } from '@/api/useEncounterStream';
import { Button } from '@/components/ui/Button';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatStartedEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import { DEFAULT_DUNGEON_CONFIG, type DungeonConfig } from './dungeonConfig';
import type { PartyMember } from './PartyMemberCard';
import { WaitingRoom } from './WaitingRoom';

type LobbyState = 'main' | 'waiting';

interface LobbyScreenProps {
  availableCharacters: Character[];
  charactersLoading: boolean;
  currentPlayerId: string;
  currentPlayerName: string;
  preSelectedCharacterId?: string | null;
  onBack: () => void;
  onStartCombat: (encounterId: string, event: CombatStartedEvent) => void;
}

/**
 * LobbyScreen - Simplified multiplayer lobby
 *
 * Single view with:
 * - Large CREATE GAME button (primary action)
 * - Join section with code input (secondary action)
 */
export function LobbyScreen({
  availableCharacters,
  charactersLoading,
  currentPlayerId,
  currentPlayerName: _playerName,
  preSelectedCharacterId,
  onBack,
  onStartCombat,
}: LobbyScreenProps) {
  // _playerName is kept for API compatibility but not currently used
  void _playerName;

  // UI State
  const [lobbyState, setLobbyState] = useState<LobbyState>('main');
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Lobby Data
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    preSelectedCharacterId || null
  );
  const [isReady, setIsReady] = useState(false);
  const [dungeonConfig, setDungeonConfig] = useState<DungeonConfig>(
    DEFAULT_DUNGEON_CONFIG
  );

  // API Hooks
  const { createEncounter, loading: createLoading } = useCreateEncounter();
  const { joinEncounter, loading: joinLoading } = useJoinEncounter();
  const { setReady: callSetReady } = useSetReady();
  const { startCombat: callStartCombat, loading: startLoading } =
    useStartCombat();
  const { leaveEncounter } = useLeaveEncounter();

  // Get the selected character data
  const selectedCharacter = availableCharacters.find(
    (c) => c.id === selectedCharacterId
  );

  // Streaming hook - connects when encounterId is set
  const { connectionState } = useEncounterStream(encounterId, currentPlayerId, {
    onPlayerJoined: (event) => {
      if (event.member) {
        setPartyMembers((prev) => [
          ...prev,
          {
            playerId: event.member!.playerId,
            character: event.member!.character,
            isReady: event.member!.isReady,
            isHost: event.member!.isHost,
          },
        ]);
      }
    },

    onPlayerLeft: (event) => {
      setPartyMembers((prev) =>
        prev.filter((m) => m.playerId !== event.playerId)
      );
    },

    onPlayerReady: (event) => {
      setPartyMembers((prev) =>
        prev.map((m) =>
          m.playerId === event.playerId ? { ...m, isReady: event.isReady } : m
        )
      );
      if (event.playerId === currentPlayerId) {
        setIsReady(event.isReady);
      }
    },

    onCombatStarted: (event) => {
      if (encounterId) {
        onStartCombat(encounterId, event);
      }
    },
  });

  // Create a new lobby
  const handleCreateLobby = async () => {
    if (!selectedCharacterId) return;

    try {
      const response = await createEncounter([selectedCharacterId]);

      setEncounterId(response.encounterId);
      setJoinCode(response.joinCode);
      setIsHost(true);

      // Initialize party members with host (us)
      setPartyMembers([
        {
          playerId: currentPlayerId,
          character: selectedCharacter,
          isReady: false,
          isHost: true,
        },
      ]);

      setLobbyState('waiting');
    } catch (error) {
      console.error('Failed to create encounter:', error);
    }
  };

  // Join an existing lobby
  const handleJoinLobby = async () => {
    if (!selectedCharacterId || joinCodeInput.length !== 6) return;

    setJoinError(null);

    try {
      const code = joinCodeInput.trim().toUpperCase();
      const response = await joinEncounter(code, [selectedCharacterId]);

      setEncounterId(response.encounterId);
      setJoinCode(code);
      setIsHost(false);

      const partyFromResponse: PartyMember[] = response.party.map((p) => ({
        playerId: p.playerId,
        character: p.character,
        isReady: p.isReady,
        isHost: p.isHost,
      }));

      setPartyMembers(partyFromResponse);
      setLobbyState('waiting');
    } catch (error) {
      console.error('Failed to join encounter:', error);
      setJoinError('Invalid code or lobby not found');
    }
  };

  // Handle character selection in waiting room
  const handleSelectCharacter = async (characterId: string) => {
    if (!encounterId) return;

    setSelectedCharacterId(characterId);

    try {
      await callSetReady(encounterId, currentPlayerId, isReady);
    } catch (error) {
      console.error('Failed to update character:', error);
    }
  };

  // Handle ready toggle
  const handleToggleReady = async () => {
    if (!encounterId) return;

    const newReady = !isReady;

    try {
      await callSetReady(encounterId, currentPlayerId, newReady);
    } catch (error) {
      console.error('Failed to toggle ready:', error);
    }
  };

  // Handle start combat
  const handleStartCombat = async () => {
    if (!encounterId) return;

    try {
      await callStartCombat(encounterId);
    } catch (error) {
      console.error('Failed to start combat:', error);
    }
  };

  // Handle leave
  const handleLeave = async () => {
    if (!encounterId) return;

    try {
      await leaveEncounter(encounterId, currentPlayerId);
    } catch {
      // Clear state regardless of error
    }

    // Clear local state
    setLobbyState('main');
    setEncounterId(null);
    setJoinCode('');
    setJoinCodeInput('');
    setIsHost(false);
    setPartyMembers([]);
    setIsReady(false);
    setDungeonConfig(DEFAULT_DUNGEON_CONFIG);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().slice(0, 6);
    setJoinCodeInput(value);
    setJoinError(null);
  };

  const canJoin =
    joinCodeInput.length === 6 && selectedCharacterId && !joinLoading;
  const canCreate = selectedCharacterId && !createLoading;

  return (
    <div className="flex justify-center w-full py-8">
      <div
        className="rounded-xl shadow-xl p-8"
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '2px solid var(--border-primary)',
          width: '100%',
          maxWidth: '32rem',
        }}
      >
        {/* Connection status banner */}
        {connectionState === 'disconnected' && (
          <div className="bg-yellow-500/20 text-yellow-200 px-4 py-2 text-center mb-4 rounded">
            Reconnecting...
          </div>
        )}

        {connectionState === 'error' && (
          <div className="bg-red-500/20 text-red-200 px-4 py-2 text-center mb-4 rounded">
            Connection lost.{' '}
            <button onClick={handleLeave} className="underline">
              Return to menu
            </button>
          </div>
        )}

        {lobbyState === 'main' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <Button variant="ghost" size="md" onClick={onBack}>
                ← Back
              </Button>
              <h2
                className="text-2xl font-bold"
                style={{
                  fontFamily: 'Cinzel, serif',
                  color: 'var(--text-primary)',
                }}
              >
                Game Lobby
              </h2>
              <div className="w-20" /> {/* Spacer for centering */}
            </div>

            {/* Character info */}
            {selectedCharacter && (
              <div
                className="text-center mb-8 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <p
                  className="text-sm mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Playing as
                </p>
                <p
                  className="text-xl font-bold"
                  style={{
                    fontFamily: 'Cinzel, serif',
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedCharacter.name}
                </p>
              </div>
            )}

            {/* Loading state */}
            {charactersLoading && (
              <div
                className="text-center py-8"
                style={{ color: 'var(--text-muted)' }}
              >
                Loading characters...
              </div>
            )}

            {/* No character warning */}
            {!charactersLoading && !selectedCharacterId && (
              <div
                className="text-center py-8 mb-6 rounded-lg border-2 border-dashed"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-muted)',
                }}
              >
                <p className="mb-2">No character selected</p>
                <p className="text-sm">
                  Go back and select a character to play
                </p>
              </div>
            )}

            {/* Create Game - Primary Action */}
            {selectedCharacterId && (
              <div className="space-y-6">
                <Button
                  size="xl"
                  variant="primary"
                  fullWidth
                  onClick={handleCreateLobby}
                  loading={createLoading}
                  disabled={!canCreate}
                  className="rounded-xl py-6 text-xl"
                >
                  Create Game
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div
                    className="flex-1 h-px"
                    style={{ backgroundColor: 'var(--border-primary)' }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>or</span>
                  <div
                    className="flex-1 h-px"
                    style={{ backgroundColor: 'var(--border-primary)' }}
                  />
                </div>

                {/* Join Game Section */}
                <div>
                  <p
                    className="text-center mb-4"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Have a code?
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={handleCodeChange}
                      placeholder="ABC123"
                      className="flex-1 px-4 py-4 rounded-xl text-center text-xl font-mono font-bold tracking-widest uppercase"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                      autoComplete="off"
                    />
                    <Button
                      size="xl"
                      variant="secondary"
                      onClick={handleJoinLobby}
                      loading={joinLoading}
                      disabled={!canJoin}
                      className="rounded-xl px-8"
                    >
                      Join
                    </Button>
                  </div>
                  {joinError && (
                    <p
                      className="mt-2 text-center text-sm"
                      style={{ color: 'var(--danger)' }}
                    >
                      {joinError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <WaitingRoom
            joinCode={joinCode}
            partyMembers={partyMembers}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            availableCharacters={availableCharacters}
            selectedCharacterId={selectedCharacterId}
            isReady={isReady}
            dungeonConfig={dungeonConfig}
            onDungeonConfigChange={setDungeonConfig}
            onSelectCharacter={handleSelectCharacter}
            onToggleReady={handleToggleReady}
            onStartCombat={handleStartCombat}
            onLeave={handleLeave}
            startLoading={startLoading}
          />
        )}
      </div>
    </div>
  );
}
