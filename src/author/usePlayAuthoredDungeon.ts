/**
 * usePlayAuthoredDungeon — the ONE launch sequence both authoring editors
 * share (plan §1): after a successful save of the authored dungeon, create
 * a lobby for the character picked on Home, ready the party up,
 * `StartEncounter{lobby_id, dungeon_key}`, and hand the encounter id up so
 * `App.handlePlayAuthored` routes to the real game on the authored dungeon.
 *
 * Legacy `AuthorView` owned this sequence inline; the World Builder now
 * runs the exact same flow through this hook. No new RPC, no fake
 * encounter, no pending route: the SDK lobby path is the only path.
 *
 * Fencing (plan §1): every launch holds a monotonic owner token. A
 * continuation may act only while its token is still THE owner of a live
 * mount — an identity change, a new launch or an unmount retires the
 * token permanently, so an abandoned request cannot resurrect when the
 * character identity returns (A→B→A) and cannot initiate its next step,
 * navigate, or clobber a newer operation's busy state.
 */
import { useCreateLobby } from '@/api/useCreateLobby';
import { useSetLobbyReady } from '@/api/useSetLobbyReady';
import { useStartLobbyEncounter } from '@/api/useStartLobbyEncounter';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches `LobbyFlow.tsx`'s own dev campaign. */
export const DEV_CAMPAIGN_ID = 'default-campaign';

/** The real asynchronous seams of a launch, in order. Failure messages
 * name the seam that refused so the author knows how far it got. */
export type LobbyLaunchPhase = 'create-lobby' | 'ready' | 'start-encounter';

export interface UsePlayAuthoredDungeonInput {
  /** The character selected on Home, if any — a launch needs one to seat. */
  characterId?: string | null;
  /** Routes to the game on the started encounter (App.handlePlayAuthored). */
  onPlay: (encounterId: string, characterId: string) => void;
}

export interface UsePlayAuthoredDungeonResult {
  /** True while a launch transaction is in flight. */
  launching: boolean;
  /** The seam the in-flight launch is waiting on; null when idle. */
  phase: LobbyLaunchPhase | null;
  /** The last failure's phase-named message; null when idle or succeeded. */
  error: string | null;
  /**
   * Runs createLobby → setReady → StartEncounter → `onPlay` for one
   * already-saved dungeon key. Resolves `true` exactly when navigation was
   * handed to `onPlay`; `false` when refused (no character, duplicate
   * launch), retired as stale, or failed at a named seam.
   */
  play: (dungeonKey: string) => Promise<boolean>;
  /** Retires the in-flight launch, monotonically: the retired token never
   * becomes current again, no later step runs, no navigation happens, and
   * a parent transaction cancelling its child can never clobber a newer
   * launch (there is none while the latch is held, and a no-op when idle).
   * No-op when nothing is in flight. */
  cancel: () => void;
}

/** One launch at a time; the token is the single authority for "is this
 * continuation still the current operation of this live mount". */
interface LaunchOwner {
  identity: string;
}

export function usePlayAuthoredDungeon({
  characterId,
  onPlay,
}: UsePlayAuthoredDungeonInput): UsePlayAuthoredDungeonResult {
  const { createLobby } = useCreateLobby();
  const { setReady } = useSetLobbyReady();
  const { startEncounter } = useStartLobbyEncounter();

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [launching, setLaunching] = useState(false);
  const [phase, setPhase] = useState<LobbyLaunchPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Only ONE launch may run, and only the CURRENT owner may act. Each
   * launch receives a fresh object token; reference identity prevents a
   * retired owner from becoming current again, even when the character
   * identity returns to the abandoned launch's character. */
  const ownerRef = useRef<LaunchOwner | null>(null);

  /** A character-identity change retires any in-flight launch started for
   * a different character — monotonically, not by comparing identities at
   * each step (A→B→A must not resurrect the abandoned request). */
  useEffect(() => {
    const owner = ownerRef.current;
    if (owner && owner.identity !== characterId) {
      ownerRef.current = null;
      if (mounted.current) {
        setLaunching(false);
        setPhase(null);
      }
    }
  }, [characterId]);

  /** Parent-side cancellation: the publishing transaction retires its
   * child launch when the request identity (key, source, room, character,
   * client) it was authorized under changes mid-flight. Monotonic by the
   * same token rule — a retired token can never act again, and cancelling
   * never clobbers a newer operation because there cannot be one while
   * the retired owner held the latch. */
  const cancel = useCallback(() => {
    const owner = ownerRef.current;
    if (!owner) return;
    ownerRef.current = null;
    if (mounted.current) {
      setLaunching(false);
      setPhase(null);
    }
  }, []);

  const play = useCallback(
    async (dungeonKey: string): Promise<boolean> => {
      if (!characterId) return false;
      if (ownerRef.current) return false;
      const owner: LaunchOwner = { identity: characterId };
      ownerRef.current = owner;
      setLaunching(true);
      setError(null);
      /** A continuation may act only while its token is still the current
       * owner of a live mount. */
      const isCurrent = () => mounted.current && ownerRef.current === owner;
      // Local progress marker: state updates are async, the seam a failure
      // must name is not. Set alongside each setPhase.
      let reached: LobbyLaunchPhase = 'create-lobby';
      try {
        setPhase(reached);
        const lobby = await createLobby({
          campaignId: DEV_CAMPAIGN_ID,
          characterId: owner.identity,
        });
        if (!isCurrent()) return false;
        reached = 'ready';
        setPhase(reached);
        await setReady({ lobbyId: lobby.lobbyId, ready: true });
        if (!isCurrent()) return false;
        reached = 'start-encounter';
        setPhase(reached);
        const started = await startEncounter({
          lobbyId: lobby.lobbyId,
          dungeonKey,
        });
        if (!isCurrent()) return false;
        onPlay(started.encounterId, owner.identity);
        return true;
      } catch (err) {
        if (!isCurrent()) return false;
        const message = err instanceof Error ? err.message : String(err);
        setError(
          reached === 'ready'
            ? `Could not ready the lobby: ${message}`
            : reached === 'start-encounter'
              ? `Could not start the encounter: ${message}`
              : `Could not create the lobby: ${message}`
        );
        return false;
      } finally {
        // Only the current owner may release the busy latch: a retired or
        // unmounted continuation must not clobber a newer operation's
        // busy state (or setState after unmount at all).
        if (ownerRef.current === owner) {
          ownerRef.current = null;
          if (mounted.current) {
            setLaunching(false);
            setPhase(null);
          }
        }
      }
    },
    [characterId, createLobby, setReady, startEncounter, onPlay]
  );

  return { launching, phase, error, play, cancel };
}
