import {
  useCreateEncounter,
  useJoinEncounter,
  useLeaveEncounter,
  useSetReady,
  useStartCombat,
} from '@/api/lobbyHooks';
import { useEncounterStream } from '@/api/useEncounterStream';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { CreateGameTab } from './CreateGameTab';
import { JoinGameTab } from './JoinGameTab';
import type { PartyMember } from './PartyMemberCard';
import { WaitingRoom } from './WaitingRoom';

type LobbyState = 'tabs' | 'waiting';
type TabId = 'create' | 'join';

interface LobbyScreenProps {
  availableCharacters: Character[];
  charactersLoading: boolean;
  currentPlayerId: string;
  currentPlayerName: string;
  onBack: () => void;
  onStartCombat: (encounterId: string) => void;
}

/**
 * LobbyScreen - Main container for multiplayer lobby functionality
 *
 * States:
 * - 'tabs': Showing Create/Join tabs
 * - 'waiting': In a lobby waiting room
 *
 * Integrates with encounter streaming for real-time multiplayer synchronization.
 */
export function LobbyScreen({
  availableCharacters,
  charactersLoading,
  currentPlayerId,
  currentPlayerName,
  onBack,
  onStartCombat,
}: LobbyScreenProps) {
  // UI State
  const [lobbyState, setLobbyState] = useState<LobbyState>('tabs');
  const [activeTab, setActiveTab] = useState<TabId>('create');

  // Lobby Data
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
  const [isReady, setIsReady] = useState(false);

  // API Hooks
  const { createEncounter, loading: createLoading } = useCreateEncounter();
  const {
    joinEncounter,
    loading: joinLoading,
    error: joinError,
  } = useJoinEncounter();
  const { setReady: callSetReady } = useSetReady();
  const { startCombat: callStartCombat, loading: startLoading } =
    useStartCombat();
  const { leaveEncounter } = useLeaveEncounter();

  // Streaming hook - connects when encounterId is set
  const { connectionState } = useEncounterStream(encounterId, currentPlayerId, {
    onPlayerJoined: (event) => {
      setPartyMembers((prev) => [
        ...prev,
        {
          playerId: event.playerId,
          playerName: event.playerName,
          character: event.character,
          isReady: false,
          isHost: false,
        },
      ]);
    },

    onPlayerLeft: (event) => {
      setPartyMembers((prev) =>
        prev.filter((m) => m.playerId !== event.playerId)
      );
    },

    onPlayerReady: (event) => {
      setPartyMembers((prev) =>
        prev.map((m) =>
          m.playerId === event.playerId
            ? { ...m, isReady: event.isReady, character: event.character }
            : m
        )
      );
      // Sync local ready state if it's us
      if (event.playerId === currentPlayerId) {
        setIsReady(event.isReady);
      }
    },

    onCombatStarted: () => {
      // Transition to combat view
      if (encounterId) {
        onStartCombat(encounterId);
      }
    },
  });

  // Create a new lobby
  const handleCreateLobby = async () => {
    if (!selectedCharacterId) return;

    try {
      const response = await createEncounter([selectedCharacterId]);

      // Set encounter state from response
      setEncounterId(response.encounterId);
      setJoinCode(response.joinCode);
      setIsHost(true);

      // Initialize party members with host (us)
      const selectedChar = availableCharacters.find(
        (c) => c.id === selectedCharacterId
      );
      setPartyMembers([
        {
          playerId: currentPlayerId,
          playerName: currentPlayerName,
          character: selectedChar,
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
  const handleJoinLobby = async (code: string) => {
    try {
      // Join without a character initially - can select in waiting room
      const response = await joinEncounter(code, []);

      // Set encounter state from response
      setEncounterId(response.encounterId);
      setJoinCode(code);
      setIsHost(false);

      // Initialize party members from response
      // The response contains the current party state
      const partyFromResponse: PartyMember[] = response.party.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        character: p.character,
        isReady: p.isReady,
        isHost: p.isHost,
      }));

      setPartyMembers(partyFromResponse);
      setLobbyState('waiting');
    } catch (error) {
      console.error('Failed to join encounter:', error);
      // Error is already set in the hook state
    }
  };

  // Handle character selection in waiting room
  const handleSelectCharacter = async (characterId: string) => {
    if (!encounterId) return;

    setSelectedCharacterId(characterId);

    // Call setReady with the new character
    // This will trigger a PlayerReady event from the stream which updates state
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

    // Call setReady API - stream will update state via PlayerReady event
    try {
      await callSetReady(encounterId, currentPlayerId, newReady);
    } catch (error) {
      console.error('Failed to toggle ready:', error);
    }
  };

  // Handle start combat
  const handleStartCombat = async () => {
    if (!encounterId) return;

    // Call startCombat API - stream will deliver CombatStarted event
    // which triggers navigation via onCombatStarted callback
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

      // Clear local state
      setLobbyState('tabs');
      setEncounterId(null);
      setJoinCode('');
      setIsHost(false);
      setPartyMembers([]);
      setSelectedCharacterId(null);
      setIsReady(false);
    } catch (error) {
      console.error('Failed to leave encounter:', error);
      // Clear state anyway
      setLobbyState('tabs');
      setEncounterId(null);
      setJoinCode('');
      setIsHost(false);
      setPartyMembers([]);
      setSelectedCharacterId(null);
      setIsReady(false);
    }
  };

  return (
    <div className="flex justify-center w-full py-8">
      <div
        className="rounded-lg shadow-xl p-6"
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '2px solid var(--border-primary)',
          width: '100%',
          maxWidth: '28rem', // 448px - same as max-w-md
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

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={lobbyState === 'waiting' ? handleLeave : onBack}
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            ← {lobbyState === 'waiting' ? 'Leave Lobby' : 'Back'}
          </button>
          <h2
            className="text-xl font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {lobbyState === 'waiting' ? 'Game Lobby' : 'Multiplayer'}
          </h2>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>

        {lobbyState === 'tabs' ? (
          <>
            {/* Tab buttons */}
            <div
              className="flex mb-6 rounded-lg overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <button
                onClick={() => setActiveTab('create')}
                className="flex-1 px-4 py-3 font-medium transition-colors"
                style={{
                  backgroundColor:
                    activeTab === 'create'
                      ? 'var(--accent-primary)'
                      : 'transparent',
                  color:
                    activeTab === 'create' ? 'white' : 'var(--text-primary)',
                }}
              >
                Create Game
              </button>
              <button
                onClick={() => setActiveTab('join')}
                className="flex-1 px-4 py-3 font-medium transition-colors"
                style={{
                  backgroundColor:
                    activeTab === 'join'
                      ? 'var(--accent-primary)'
                      : 'transparent',
                  color: activeTab === 'join' ? 'white' : 'var(--text-primary)',
                }}
              >
                Join Game
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'create' ? (
              <CreateGameTab
                characters={availableCharacters}
                selectedCharacterId={selectedCharacterId}
                onSelectCharacter={setSelectedCharacterId}
                onCreateLobby={handleCreateLobby}
                loading={createLoading}
                charactersLoading={charactersLoading}
              />
            ) : (
              <JoinGameTab
                onJoinLobby={handleJoinLobby}
                loading={joinLoading}
                error={joinError?.message ?? null}
              />
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
