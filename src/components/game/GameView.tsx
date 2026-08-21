/**
 * GameView — the live game path's successor to LobbyView (design.md's
 * Target Shape). Slice 2 (#440) built the two pieces that exist today:
 * LobbyFlow (party assembly on the new LobbyService) and EncounterView (the
 * shared harness stack). Equipment, the result overlay, and multi-room are
 * later slices; this component's job is just the state machine between the
 * two: lobby until `encounter_started`, then the encounter.
 *
 * Slice 3 (#447) deleted LobbyView.tsx, which App.tsx no longer referenced
 * once it was mounting GameView on the same route.
 *
 * W3 slice 2 (rpg-project#227, issue #762 slice 1): `StartEncounter` now
 * builds a session on `dnd5e.api.session.v1alpha1` — rpg-api#801 deleted
 * the old `EncounterService` stack `dev` used to serve, so the id
 * `onEncounterStarted` receives is a SESSION id, not an old-wire encounter
 * id. This mounts `SessionEncounterView` (the new wire's renderer) instead
 * of `EncounterView` (the old wire's, left in place and untouched —
 * deleting it is a later slice, not this one). The local state below is
 * named `sessionId` (not `encounterId`) to say so — it holds a session id
 * from mount to unmount, and `LobbyFlow`'s own `onEncounterStarted` prop
 * name is the one piece of the old vocabulary left, since renaming it is
 * LobbyFlow's own call, not this component's (Copilot review, PR #764).
 */

import { useState } from 'react';
import { SessionEncounterView } from '../session/SessionEncounterView';
import { LobbyFlow } from './LobbyFlow';

export interface GameViewProps {
  /**
   * The character selected on the home screen. Optional: resume-after-
   * refresh (#444) mounts this component with only playerId — GetMyActiveLobby
   * carries no characterId, so this is undefined on that path. LobbyFlow
   * recovers it from the roster (`LobbyMember.characterId`) and reports it
   * with the encounter start, so the session view is placed correctly even
   * on resume; only the initialEncounterId path (a RUNNING encounter, no
   * lobby to read) still reaches SessionEncounterView without one, and it
   * shows a clear "no character selected" state there.
   */
  characterId?: string;
  playerId: string;
  onBack: () => void;
  /**
   * Resume-after-refresh (#444): an already-running encounter to drop
   * straight into, skipping LobbyFlow entirely — the server-driven version
   * of the dev-only /playtest ?encounterId= gate.
   */
  initialEncounterId?: string;
  /**
   * Resume-after-refresh (#444): an already-existing WAITING lobby to land
   * back in — passed through to LobbyFlow, which seeds its lobbyId state
   * from it directly.
   */
  initialLobbyId?: string;
}

export function GameView({
  characterId,
  playerId,
  onBack,
  initialEncounterId,
  initialLobbyId,
}: GameViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(
    initialEncounterId ?? null
  );
  // The lobby roster's answer for "which character am I" wins over the
  // home-screen prop: on resume-after-refresh the prop is undefined, and the
  // roster is where the server said which seat is ours.
  const [lobbyCharacterId, setLobbyCharacterId] = useState<string | undefined>(
    undefined
  );
  const handleEncounterStarted = (id: string, memberCharacterId?: string) => {
    setLobbyCharacterId(memberCharacterId);
    setSessionId(id);
  };

  if (sessionId) {
    return (
      <SessionEncounterView
        sessionId={sessionId}
        characterId={lobbyCharacterId ?? characterId}
        playerId={playerId}
        onBack={onBack}
      />
    );
  }

  return (
    <LobbyFlow
      characterId={characterId}
      playerId={playerId}
      onEncounterStarted={handleEncounterStarted}
      onBack={onBack}
      initialLobbyId={initialLobbyId}
    />
  );
}
