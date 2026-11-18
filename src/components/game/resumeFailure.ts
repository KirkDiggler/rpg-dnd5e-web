/**
 * A running encounter whose game view failed to render (rpg-project#1004).
 *
 * Resume-after-refresh (#444) routes every load into the player's running
 * encounter, so a game view that cannot render would trap every load in the
 * failure. The mark breaks that loop ONCE: the load right after a failure
 * skips the automatic resume and Home says so, with a Resume control. Every
 * later load resumes as usual. The mark is keyed by player and encounter, and
 * is cleared when the player enters that encounter successfully, presses
 * Resume, or leaves it.
 */
const KEY = 'rpg.game.openFailed';

interface Mark {
  player: string;
  encounter: string;
  /** The load that skipped the resume; a later load does not skip again. */
  skippedBy?: string;
}

/** This load's identity: React may run an effect twice, and both runs are
 * the same load, so both skip. */
const LOAD = `${Date.now()}-${Math.random()}`;

function read(): Mark | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as Partial<Mark>;
    return typeof mark.player === 'string' && typeof mark.encounter === 'string'
      ? (mark as Mark)
      : null;
  } catch {
    return null;
  }
}

function write(mark: Mark | null): void {
  try {
    if (mark) window.localStorage.setItem(KEY, JSON.stringify(mark));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the boundary's own way out still works.
  }
}

/** The game view of this player's encounter failed to render. */
export function rememberFailedOpen(player: string, encounter: string): void {
  write({ player, encounter });
}

/** Whether this load skips the automatic resume of this player's encounter.
 * True only on the first load after the failure (and again within it). */
export function skipResumeOnce(player: string, encounter: string): boolean {
  const mark = read();
  if (!mark || mark.player !== player || mark.encounter !== encounter)
    return false;
  if (mark.skippedBy && mark.skippedBy !== LOAD) {
    write(null);
    return false;
  }
  write({ ...mark, skippedBy: LOAD });
  return true;
}

/** Forget the failure: entered successfully, resumed on purpose, or left.
 * With no encounter, any mark of this player's is forgotten. */
export function clearFailedOpen(player: string, encounter?: string): void {
  const mark = read();
  if (!mark || mark.player !== player) return;
  if (encounter !== undefined && mark.encounter !== encounter) return;
  write(null);
}
