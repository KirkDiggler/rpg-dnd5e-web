/**
 * PartyRoster — renders LobbyFlow's member list. Presence (is_host /
 * is_ready / is_connected) is rendered exactly as the server sends it, never
 * inferred — the roster comes from StreamLobby's snapshot-then-deltas
 * (lobby-surface.md's LobbyMember contract).
 */

import type { LobbyMember } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';

export interface PartyRosterProps {
  members: LobbyMember[];
}

export function PartyRoster({ members }: PartyRosterProps) {
  if (members.length === 0) {
    return (
      <div data-testid="party-roster-empty" style={{ opacity: 0.6 }}>
        (waiting for the party roster…)
      </div>
    );
  }

  return (
    <ul data-testid="party-roster" style={{ listStyle: 'none', padding: 0 }}>
      {members.map((member) => (
        <li
          key={member.playerId}
          data-testid={`party-member-${member.playerId}`}
          className="flex items-center gap-3 rounded-md px-3 py-2"
          style={{
            background: 'var(--bg-secondary, #1a1a1a)',
            opacity: member.isConnected ? 1 : 0.5,
            marginBottom: 6,
          }}
        >
          <span
            data-testid={`party-member-connected-${member.playerId}`}
            title={member.isConnected ? 'connected' : 'disconnected'}
            style={{ color: member.isConnected ? '#8f8' : '#666' }}
          >
            {member.isConnected ? '●' : '○'}
          </span>
          <span style={{ flex: 1 }}>
            {member.characterName || member.characterId}
            {member.isHost && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                (host)
              </span>
            )}
          </span>
          <span
            data-testid={`party-member-ready-${member.playerId}`}
            style={{ color: member.isReady ? '#8f8' : '#888', fontSize: 12 }}
          >
            {member.isReady ? 'ready' : 'not ready'}
          </span>
        </li>
      ))}
    </ul>
  );
}
