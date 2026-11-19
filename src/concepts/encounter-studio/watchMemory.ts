/**
 * The run this tab is watching from the studio, across a reload
 * (rpg-project#1008).
 *
 * A watched run is an ordinary open run, so resume-after-refresh (#444)
 * would put a reload straight into the GAME on it, with no way back to the
 * studio. App reads this mark on load: a resumed run that this tab was
 * watching goes back to the studio watching it instead. Every other run
 * resumes as it always did.
 *
 * Per tab (sessionStorage): another tab never watched the run. Keyed by
 * player, so a different sign-in in the same tab does not inherit it.
 * Cleared when the watch ends (Stop watching, leaving the studio), when
 * the studio cannot reopen it, and when a load's resume lookup finds no
 * running encounter for the player.
 */
import type { WatchedRun } from './runWatch';

const KEY = 'rpg.studio.watching';

interface Mark {
  player: string;
  session: string;
  member: string;
  /** The studio draft the run was started from. */
  room?: string;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function read(): Mark | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as Partial<Mark>;
    return typeof mark.player === 'string' &&
      typeof mark.session === 'string' &&
      typeof mark.member === 'string'
      ? (mark as Mark)
      : null;
  } catch {
    return null;
  }
}

/** This tab's player is watching this run from the studio. */
export function rememberWatching(player: string, run: WatchedRun): void {
  try {
    storage()?.setItem(
      KEY,
      JSON.stringify({
        player,
        session: run.session,
        member: run.member,
        room: run.room,
      } satisfies Mark)
    );
  } catch {
    // Storage unavailable: a reload resumes the run in the game, as before.
  }
}

/** The watched run this tab remembers for this player and session, or
 * null when the session is not one it was watching. */
export function watchingOf(player: string, session: string): WatchedRun | null {
  const mark = read();
  if (!mark || mark.player !== player || mark.session !== session) return null;
  return mark.room === undefined
    ? { session: mark.session, member: mark.member }
    : { session: mark.session, member: mark.member, room: mark.room };
}

/** Forget this player's watched run. */
export function forgetWatching(player: string): void {
  const mark = read();
  if (!mark || mark.player !== player) return;
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to forget with.
  }
}
