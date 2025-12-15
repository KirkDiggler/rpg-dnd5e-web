import { formatCharacterSummary } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export interface PartyMember {
  playerId: string;
  character?: Character;
  isReady: boolean;
  isHost: boolean;
}

interface PartyMemberCardProps {
  member: PartyMember;
  isCurrentPlayer?: boolean;
}

/**
 * PartyMemberCard - Displays a single party member in the lobby
 *
 * Shows:
 * - Player name with host badge if applicable
 * - Selected character info or "Selecting..." placeholder
 * - Ready status indicator
 * - Highlighted border if current player
 */
export function PartyMemberCard({
  member,
  isCurrentPlayer = false,
}: PartyMemberCardProps) {
  const { playerId, character, isReady, isHost } = member;

  // Use character name if available, otherwise show player ID
  const displayName = character?.name || playerId;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg transition-colors"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: isCurrentPlayer
          ? '2px solid var(--accent-primary)'
          : '1px solid var(--border-primary)',
      }}
    >
      {/* Ready indicator */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
        style={{
          backgroundColor: isReady
            ? 'var(--accent-success, #22c55e)'
            : 'var(--bg-tertiary, #374151)',
        }}
      >
        {isReady ? '✓' : '⏳'}
      </div>

      {/* Player and character info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-semibold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {displayName}
          </span>
          {isHost && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              Host
            </span>
          )}
          {isCurrentPlayer && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              (You)
            </span>
          )}
        </div>
        <div
          className="text-sm truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          {character ? (
            `${character.name} - ${formatCharacterSummary(character.level, character.race, character.class)}`
          ) : (
            <span className="italic">Selecting character...</span>
          )}
        </div>
      </div>

      {/* Ready status text */}
      <div
        className="flex-shrink-0 text-sm font-medium"
        style={{
          color: isReady
            ? 'var(--accent-success, #22c55e)'
            : 'var(--text-muted)',
        }}
      >
        {isReady ? 'Ready' : 'Not Ready'}
      </div>
    </div>
  );
}
