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
 */

import { useState } from 'react';
import { EncounterView } from './EncounterView';
import { LobbyFlow } from './LobbyFlow';

export interface GameViewProps {
  /** The character selected on the home screen. */
  characterId: string;
  playerId: string;
  onBack: () => void;
}

export function GameView({ characterId, playerId, onBack }: GameViewProps) {
  const [encounterId, setEncounterId] = useState<string | null>(null);

  if (encounterId) {
    return (
      <EncounterView
        encounterId={encounterId}
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
    />
  );
}
