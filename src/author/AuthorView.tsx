/**
 * AuthorView — the Dungeon Builder's in-game home (`/author` AppView).
 * Mounts `DungeonBuilder` live against this build's server and owns the
 * one verb the builder cannot do alone: **Save & Play** (design §1) —
 * after `PutDungeon` stores the file, create a lobby for the character
 * picked on Home, ready up, `StartEncounter{lobby_id, dungeon_key}`, and
 * hand the encounter id up so `App` routes to the real game on the
 * authored dungeon.
 *
 * The button that routes here (`DungeonBuilderHomeButton`) is gated by
 * `useAuthoringGate`; by the time this mounts the gate has said yes.
 */
import { useCreateLobby } from '@/api/useCreateLobby';
import { useSetLobbyReady } from '@/api/useSetLobbyReady';
import { useStartLobbyEncounter } from '@/api/useStartLobbyEncounter';
import { useCallback } from 'react';
import { DungeonBuilder } from './DungeonBuilder';

/** Matches `LobbyFlow.tsx`'s own dev campaign. */
const DEV_CAMPAIGN_ID = 'default-campaign';

interface AuthorViewProps {
  onBack: () => void;
  /** The character selected on Home, if any — Save & Play needs one to
   * seat in the lobby. */
  characterId?: string | null;
  /** Routes to the game on the started encounter. */
  onPlay: (encounterId: string, characterId: string) => void;
}

export function AuthorView({ onBack, characterId, onPlay }: AuthorViewProps) {
  const { createLobby } = useCreateLobby();
  const { setReady } = useSetLobbyReady();
  const { startEncounter } = useStartLobbyEncounter();

  const play = useCallback(
    async (dungeonKey: string) => {
      if (!characterId) return;
      const lobby = await createLobby({
        campaignId: DEV_CAMPAIGN_ID,
        characterId,
      });
      await setReady({ lobbyId: lobby.lobbyId, ready: true });
      const started = await startEncounter({
        lobbyId: lobby.lobbyId,
        dungeonKey,
      });
      onPlay(started.encounterId, characterId);
    },
    [characterId, createLobby, setReady, startEncounter, onPlay]
  );

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded text-sm"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          Back
        </button>
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Dungeon Builder
        </h1>
      </div>
      <DungeonBuilder
        onPlay={play}
        playDisabledReason={
          characterId ? null : 'Pick a character on Home to play'
        }
      />
    </div>
  );
}
