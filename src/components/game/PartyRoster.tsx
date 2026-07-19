/**
 * PartyRoster — renders LobbyFlow's member list. Presence (is_host /
 * is_ready / is_connected) is rendered exactly as the server sends it, never
 * inferred — the roster comes from StreamLobby's snapshot-then-deltas
 * (lobby-surface.md's LobbyMember contract). Card layout lives in
 * PartyMemberCard (visual spec harvested from the pre-clean-slate lobby UI,
 * see its doc comment).
 */

import type { LobbyMember } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { PartyMemberCard } from './PartyMemberCard';

export interface PartyRosterProps {
  members: LobbyMember[];
  /** The local player's id — flags their own card with a "(You)" tag. */
  currentPlayerId: string;
}

export function PartyRoster({ members, currentPlayerId }: PartyRosterProps) {
  if (members.length === 0) {
    return (
      <div data-testid="party-roster-empty" style={{ opacity: 0.6 }}>
        (waiting for the party roster…)
      </div>
    );
  }

  return (
    <div
      data-testid="party-roster"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {members.map((member) => (
        <PartyMemberCard
          key={member.playerId}
          member={member}
          isCurrentPlayer={member.playerId === currentPlayerId}
        />
      ))}
    </div>
  );
}
