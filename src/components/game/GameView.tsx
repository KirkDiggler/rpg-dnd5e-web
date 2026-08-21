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
 * deleting it is a later slice, not this one).
 */

import { useState } from 'react';
import { SessionEncounterView } from '../session/SessionEncounterView';
import { LobbyFlow } from './LobbyFlow';

export interface GameViewProps {
  /**
   * The character selected on the home screen. Optional: resume-after-
   * refresh (#444) mounts this component with only playerId — GetMyActiveLobby
   * carries no characterId, so this is undefined on that path and each child
   * resolves what it needs from server state instead (SessionEncounterView
   * shows a clear "no character selected" state; LobbyFlow doesn't need it
   * at all once initialLobbyId is set, since it skips the create/join RPCs
   * that are the only place characterId is used).
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
  const [encounterId, setEncounterId] = useState<string | null>(
    initialEncounterId ?? null
  );

  if (encounterId) {
    return (
      <SessionEncounterView
        sessionId={encounterId}
        characterId={characterId}
        playerId={playerId}
        onBack={onBack}
      />
    );
  }

  return (
    <LobbyFlow
      characterId={characterId}
      playerId={playerId}
      onEncounterStarted={setEncounterId}
      onBack={onBack}
      initialLobbyId={initialLobbyId}
    />
  );
}
