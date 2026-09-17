/**
 * AuthorView — the Dungeon Builder's in-game home (`/author` AppView).
 * Mounts `DungeonBuilder` live against this build's server and owns the
 * one verb the builder cannot do alone: **Save & Play** (design §1) —
 * after `PutDungeon` stores the file, create a lobby for the character
 * picked on Home, ready up, `StartEncounter{lobby_id, dungeon_key}`, and
 * hand the encounter id up so `App` routes to the real game on the
 * authored dungeon.
 *
 * The launch sequence itself lives in `usePlayAuthoredDungeon`, shared
 * with the World Builder's room publishing panel — one sequence, one set
 * of fencing guarantees (plan §1).
 *
 * The button that routes here (`DungeonBuilderHomeButton`) is gated by
 * `useAuthoringGate`; by the time this mounts the gate has said yes.
 */
import { ThemeSelector } from '@/components/ThemeSelector';
import type { CompositionSource } from '@/compositions/compositionSource';
import { useCallback } from 'react';
import { DungeonBuilder } from './DungeonBuilder';
import { usePlayAuthoredDungeon } from './usePlayAuthoredDungeon';

interface AuthorViewProps {
  onBack: () => void;
  /** The character selected on Home, if any — Save & Play needs one to
   * seat in the lobby. */
  characterId?: string | null;
  /** Routes to the game on the started encounter. */
  onPlay: (encounterId: string, characterId: string) => void;
  compositionSource?: CompositionSource;
}

export function AuthorView({
  onBack,
  characterId,
  onPlay,
  compositionSource,
}: AuthorViewProps) {
  const {
    play: playAuthored,
    launching,
    error: launchError,
  } = usePlayAuthoredDungeon({ characterId, onPlay });

  /** DungeonBuilder's onPlay is a fire-and-forget `Promise<void>`; the
   * shared hook reports failures in `error` instead of throwing. */
  const play = useCallback(
    async (dungeonKey: string) => {
      await playAuthored(dungeonKey);
    },
    [playAuthored]
  );

  return (
    // A viewport-tall flex column: one header row, then the builder taking
    // every pixel that is left. `min-h-0` on the body is what lets the
    // builder's own panes scroll internally instead of stretching this
    // column past the bottom of the window.
    <div className="h-screen flex flex-col gap-3 p-4">
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          disabled={launching}
          title={launching ? 'Starting the encounter…' : undefined}
          className="px-3 py-1.5 rounded text-sm disabled:opacity-50"
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
        {/* The shell skips its own header row for full-bleed views, so the
            theme control rides here rather than costing a second row. */}
        <div className="ml-auto">
          <ThemeSelector />
        </div>
      </div>
      {launchError && (
        <div role="alert" className="text-red-500 text-sm">
          {launchError}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <DungeonBuilder
          onPlay={play}
          compositionSource={compositionSource}
          playDisabledReason={
            characterId ? null : 'Pick a character on Home to play'
          }
        />
      </div>
    </div>
  );
}
