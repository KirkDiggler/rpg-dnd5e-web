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
 * Generate a random 6-character join code
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * LobbyScreen - Main container for multiplayer lobby functionality
 *
 * States:
 * - 'tabs': Showing Create/Join tabs
 * - 'waiting': In a lobby waiting room
 *
 * For Phase 1, uses mock data. API integration in Phase 2.
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

  // Lobby Data (will come from API in Phase 2)
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
  const [isReady, setIsReady] = useState(false);

  // Loading states
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Mock: Create a new lobby
  const handleCreateLobby = async () => {
    if (!selectedCharacterId) return;

    setCreateLoading(true);
    // TODO: Replace with actual API call
    // const response = await createEncounter(selectedCharacterId);

    // Mock response
    await new Promise((resolve) => setTimeout(resolve, 500));
    const mockEncounterId = `encounter-${Date.now()}`;
    const mockJoinCode = generateJoinCode();
    const selectedChar = availableCharacters.find(
      (c) => c.id === selectedCharacterId
    );

    setEncounterId(mockEncounterId);
    setJoinCode(mockJoinCode);
    setIsHost(true);
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
    setCreateLoading(false);
  };

  // Mock: Join an existing lobby
  const handleJoinLobby = async (code: string) => {
    setJoinLoading(true);
    setJoinError(null);

    // TODO: Replace with actual API call
    // const response = await joinEncounter(code);

    // Mock: Simulate join (50% chance of success for demo)
    await new Promise((resolve) => setTimeout(resolve, 500));
    const success = Math.random() > 0.3; // 70% success rate for demo

    if (!success) {
      setJoinError('Invalid join code. Please check and try again.');
      setJoinLoading(false);
      return;
    }

    // Mock successful join
    const mockEncounterId = `encounter-${code}`;
    setEncounterId(mockEncounterId);
    setJoinCode(code);
    setIsHost(false);
    setSelectedCharacterId(null);
    setPartyMembers([
      {
        playerId: 'host-player',
        playerName: 'Host Player',
        character: undefined, // Mock: host character unknown
        isReady: true,
        isHost: true,
      },
      {
        playerId: currentPlayerId,
        playerName: currentPlayerName,
        character: undefined,
        isReady: false,
        isHost: false,
      },
    ]);
    setLobbyState('waiting');
    setJoinLoading(false);
  };

  // Handle character selection in waiting room
  const handleSelectCharacter = (characterId: string) => {
    const character = availableCharacters.find((c) => c.id === characterId);
    setSelectedCharacterId(characterId);

    // Update party members to show our character
    setPartyMembers((prev) =>
      prev.map((m) =>
        m.playerId === currentPlayerId ? { ...m, character } : m
      )
    );
  };

  // Handle ready toggle
  const handleToggleReady = () => {
    const newReady = !isReady;
    setIsReady(newReady);

    // Update party members
    setPartyMembers((prev) =>
      prev.map((m) =>
        m.playerId === currentPlayerId ? { ...m, isReady: newReady } : m
      )
    );

    // TODO: Call setReady API
  };

  // Handle start combat
  const handleStartCombat = async () => {
    if (!encounterId) return;

    setStartLoading(true);
    // TODO: Call startCombat API
    await new Promise((resolve) => setTimeout(resolve, 500));
    onStartCombat(encounterId);
  };

  // Handle leave
  const handleLeave = () => {
    // TODO: Call leaveEncounter API
    setLobbyState('tabs');
    setEncounterId(null);
    setJoinCode('');
    setIsHost(false);
    setPartyMembers([]);
    setSelectedCharacterId(null);
    setIsReady(false);
  };

  return (
    <div
      className="rounded-lg shadow-xl p-6 max-w-lg mx-auto"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
      }}
    >
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
                color: activeTab === 'create' ? 'white' : 'var(--text-primary)',
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
              error={joinError}
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
  );
}
