/**
 * PartyMemberCard — one row per lobby member, replacing PartyRoster's plain
 * `<li>` text row. Layout harvested from the pre-clean-slate
 * `PartyMemberCard` (deleted at 975f1a4, `src/components/lobby/
 * PartyMemberCard.tsx`) — ready-state badge, host pill, "(You)" tag,
 * character line — rebuilt on today's `LobbyMember` (lobby.v1alpha1), which
 * only carries `characterName`/`characterId`, not the full `Character`
 * object the old card read `level`/`race`/`class` from. No fabricated
 * level/class line here — see rpg-dnd5e-web docs/architecture for the
 * lobby-surface contract.
 *
 * Connection state (`isConnected`) has no equivalent in the pre-clean-slate
 * spec (predates resume-after-refresh) — folded in as a small dot next to
 * the name plus the existing whole-row dimming, rather than dropped.
 *
 * Inline styles throughout, not Tailwind utility classNames, for anything
 * spacing/radius/typography — verified live that this project's Tailwind
 * v4 dev build isn't generating several utility classes used here (padding,
 * gap, and bare "rounded" all confirmed missing from every loaded
 * stylesheet, project-wide, not just this worktree — a real pre-existing
 * gap, out of scope to fix here). "flex", "flex-1", and "flex-shrink-0" ARE
 * present and kept as classNames.
 */

import type { LobbyMember } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';

export interface PartyMemberCardProps {
  member: LobbyMember;
  isCurrentPlayer: boolean;
}

export function PartyMemberCard({
  member,
  isCurrentPlayer,
}: PartyMemberCardProps) {
  const displayName = member.characterName || member.characterId;

  return (
    <div
      data-testid={`party-member-${member.playerId}`}
      className="flex"
      style={{
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'var(--bg-secondary, #1a1a1a)',
        border: isCurrentPlayer
          ? '2px solid var(--accent-primary, #5865F2)'
          : '1px solid var(--border-primary, #333)',
        opacity: member.isConnected ? 1 : 0.5,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Ready indicator */}
      <div
        className="flex flex-shrink-0"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          backgroundColor: member.isReady
            ? 'var(--accent-success, #22c55e)'
            : 'var(--bg-tertiary, #374151)',
        }}
        title={member.isReady ? 'Ready' : 'Not ready'}
      >
        {member.isReady ? '✓' : '⏳'}
      </div>

      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
          <span
            data-testid={`party-member-connected-${member.playerId}`}
            title={member.isConnected ? 'connected' : 'disconnected'}
            style={{
              color: member.isConnected
                ? 'var(--accent-success, #22c55e)'
                : 'var(--text-muted, #666)',
              fontSize: 10,
            }}
          >
            ●
          </span>
          <span
            style={{
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-primary, #fff)',
            }}
          >
            {displayName}
          </span>
          {member.isHost && (
            <span
              className="flex-shrink-0"
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                backgroundColor: 'var(--accent-primary, #5865F2)',
                color: 'white',
              }}
            >
              Host
            </span>
          )}
          {isCurrentPlayer && (
            <span
              className="flex-shrink-0"
              style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}
            >
              (You)
            </span>
          )}
        </div>
      </div>

      <div
        data-testid={`party-member-ready-${member.playerId}`}
        className="flex-shrink-0"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: member.isReady
            ? 'var(--accent-success, #22c55e)'
            : 'var(--text-muted, #888)',
        }}
      >
        {member.isReady ? 'Ready' : 'Not ready'}
      </div>
    </div>
  );
}
