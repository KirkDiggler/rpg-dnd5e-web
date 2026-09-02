/**
 * railLayout — how wide the builder's right rail is, and whether the
 * inspector above the YAML is folded away.
 *
 * The rail defaults to `clamp(340px, 24%, 560px)` in CSS and stays there
 * until somebody drags it, so nothing moves for an author who never touches
 * it. What forced the handle: a region's cell row is one line per row of the
 * dungeon, and a real one runs past a hundred characters —
 *
 *     - [[-1,-2],[0,-2],[1,-2], ... ,[12,-2]]
 *
 * — while the rail fits roughly fifty at its measured 376px. No amount of
 * vertical room fixes a line clipped in half, which is why the width is the
 * control that matters and the fold is the complement.
 *
 * Both live in localStorage rather than the document: they are how ONE person
 * likes to look at the builder, not a fact about the dungeon, and a dungeon
 * that round-trips differently because of a pane width would be a bug.
 */

/** Narrowest useful rail — the old CSS floor, kept as the floor. */
export const RAIL_MIN = 340;

/** The canvas keeps at least this much, so dragging the rail can never
 * swallow the thing being authored. */
export const CANVAS_MIN = 360;

/** The palette column's fixed track, plus the grid's two 12px gaps. */
const PALETTE_AND_GAPS = 220 + 12 + 12;

const WIDTH_KEY = 'dg.rail.width';
const FOLD_KEY = 'dg.rail.inspectorFolded';

/**
 * The width a drag lands on, clamped so the rail stays readable and the
 * canvas stays usable.
 *
 * `dx` is the pointer's movement in page coordinates; the grip sits on the
 * rail's LEFT edge, so moving left (negative dx) makes the rail wider —
 * hence the subtraction. Pure and exported because jsdom has no layout: this
 * is the part worth testing, and a test that drove real pointer events would
 * only ever measure zeroes.
 */
export function nextRailWidth(
  startWidth: number,
  dx: number,
  rootWidth: number
): number {
  const room = rootWidth - PALETTE_AND_GAPS - CANVAS_MIN;
  // A viewport too small to honour both floors gives the rail its minimum
  // rather than an inverted clamp (Math.max(RAIL_MIN, ...) would otherwise
  // read as "max wins" and quietly hand the rail more than the room).
  const max = Math.max(RAIL_MIN, room);
  return Math.round(Math.min(max, Math.max(RAIL_MIN, startWidth - dx)));
}

/** The stored width, or null for "whatever the CSS says" — the default is an
 * absence, so clearing the key restores it exactly. */
export function readRailWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= RAIL_MIN ? n : null;
  } catch {
    return null;
  }
}

/** Persist the width, or clear it back to the CSS default with null. */
export function writeRailWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(WIDTH_KEY);
    else window.localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // A blocked or full localStorage costs this author their pane width and
    // nothing else, so it is swallowed rather than surfaced.
  }
}

/** Whether the inspector is folded away. Defaults to OPEN: an author who has
 * never folded it should see the panel they have always seen. */
export function readInspectorFolded(): boolean {
  try {
    return window.localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the fold. */
export function writeInspectorFolded(folded: boolean): void {
  try {
    if (folded) window.localStorage.setItem(FOLD_KEY, '1');
    else window.localStorage.removeItem(FOLD_KEY);
  } catch {
    // See writeRailWidth.
  }
}
