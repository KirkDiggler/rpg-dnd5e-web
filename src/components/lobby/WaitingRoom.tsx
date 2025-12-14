import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { JoinCodeDisplay } from './JoinCodeDisplay';
import { PartyMemberCard, type PartyMember } from './PartyMemberCard';

interface WaitingRoomProps {
  joinCode: string;
  partyMembers: PartyMember[];
  currentPlayerId: string;
  isHost: boolean;
  availableCharacters: Character[];
  selectedCharacterId: string | null;
  isReady: boolean;
  onSelectCharacter: (characterId: string) => void;
  onToggleReady: () => void;
  onStartCombat: () => void;
  onLeave: () => void;
  startLoading: boolean;
}

/**
 * WaitingRoom - The lobby view after creating or joining
 *
 * Shows:
 * - Join code with copy button
 * - List of party members with ready status
 * - Character selector dropdown
 * - Ready toggle button
 * - Start Combat button (host only)
 * - Leave button
 */
export function WaitingRoom({
  joinCode,
  partyMembers,
  currentPlayerId,
  isHost,
  availableCharacters,
  selectedCharacterId,
  isReady,
  onSelectCharacter,
  onToggleReady,
  onStartCombat,
  onLeave,
  startLoading,
}: WaitingRoomProps) {
  const allReady = partyMembers.every((m) => m.isReady);
  const readyCount = partyMembers.filter((m) => m.isReady).length;

  return (
    <div className="space-y-6">
      {/* Join Code Section */}
      <div className="text-center">
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
          Share this code with friends to join
        </p>
        <JoinCodeDisplay code={joinCode} />
      </div>

      {/* Party Members Section */}
      <div>
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Party Members ({readyCount}/{partyMembers.length} ready)
        </h3>
        <div className="space-y-2">
          {partyMembers.map((member) => (
            <PartyMemberCard
              key={member.playerId}
              member={member}
              isCurrentPlayer={member.playerId === currentPlayerId}
            />
          ))}
        </div>
      </div>

      {/* Character Selection (for players who haven't selected yet) */}
      <div>
        <label
          htmlFor="character-select"
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Your Character
        </label>
        <select
          id="character-select"
          value={selectedCharacterId || ''}
          onChange={(e) => onSelectCharacter(e.target.value)}
          disabled={isReady}
          className="w-full px-4 py-3 rounded-lg"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
            opacity: isReady ? 0.6 : 1,
          }}
        >
          <option value="">Select a character...</option>
          {availableCharacters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name} -{' '}
              {formatCharacterSummary(
                character.level,
                character.race,
                character.class
              )}
            </option>
          ))}
        </select>
        {isReady && (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Unready to change character
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {/* Ready Toggle */}
        <button
          onClick={onToggleReady}
          disabled={!selectedCharacterId}
          className="flex-1 px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
          style={{
            backgroundColor: isReady
              ? 'var(--accent-success, #22c55e)'
              : 'var(--bg-secondary)',
            border: isReady ? 'none' : '2px solid var(--border-primary)',
            color: isReady ? 'white' : 'var(--text-primary)',
          }}
        >
          {isReady ? '✓ Ready' : 'Ready Up'}
        </button>

        {/* Start Combat (host only) */}
        {isHost && (
          <button
            onClick={onStartCombat}
            disabled={!allReady || startLoading}
            className="flex-1 px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
            style={{
              backgroundColor:
                allReady && !startLoading
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'white',
            }}
          >
            {startLoading
              ? 'Starting...'
              : allReady
                ? 'Start Combat'
                : `Waiting (${readyCount}/${partyMembers.length})`}
          </button>
        )}
      </div>

      {/* Leave Button */}
      <button
        onClick={onLeave}
        className="w-full px-4 py-2 rounded-lg text-sm transition-colors"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid var(--border-primary)',
          color: 'var(--text-muted)',
        }}
      >
        Leave Lobby
      </button>
    </div>
  );
}
