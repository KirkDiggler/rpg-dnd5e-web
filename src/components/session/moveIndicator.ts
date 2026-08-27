/**
 * moveIndicator — pure selection logic for the session route's hover
 * indicator: given the cell under the cursor and the local player's own
 * state, decides what should be drawn there (rpg-dnd5e-web#762 slice 4,
 * grown for the combat turn — rpg-project#249 — to fold Attack into the
 * SAME hover, rather than a separate `mode` toggle). Framework-free by
 * design — no React, no Three.js — so it is unit testable in isolation
 * and so the render layer can never accidentally grow a second opinion
 * about what's walkable or attackable.
 *
 * # One selector, so preview and click can't diverge
 *
 * `selectMoveIndicator`'s `'path'` case calls `findAtlasPath(pathIndex,
 * from, hovered)` — the EXACT call `useSessionWalk.walkTo` makes with the
 * same `pathIndex`/`from`/target when the hovered cell is clicked. Because
 * both sides call the same pure function with the same inputs, the drawn
 * preview and the path a click actually walks are the same array by
 * construction, not by two implementations being kept in sync by hand.
 *
 * # Attack is an armed hover state, not a movement mode
 *
 * Walking remains available without switching modes. `attackable` is the
 * caller's answer from the exact currently armed declaration candidate; this
 * module performs no reach, availability, turn, or action-selection logic.
 * When true, the hover reads `'target'`; every other hover falls through to
 * the ordinary walk-preview logic below.
 *
 * # Why "already there" and "unreachable" both read as 'invalid'
 *
 * `findAtlasPath`'s own doc comment: an empty result means "nothing to
 * walk" either way — the hovered cell is where the player already stands,
 * or no route exists at all (a wall with no doorway, an isolated pocket,
 * or a cell off the atlas). `useSessionWalk.walkTo` treats both as an
 * identical silent no-op for the same reason, so this module folds them
 * into the same `'invalid'` reading rather than inventing a fourth kind
 * ("here") the click handler doesn't distinguish either.
 *
 * # `null` means "nothing to judge yet", not "invalid"
 *
 * `'invalid'` is a COMPUTED answer — it asserts "I looked, and there is no
 * route." Missing inputs (`from`/`pathIndex` not `null` — no `GetWhere`
 * answer yet, or the atlas hasn't loaded) are not that: there is nothing
 * to look UP yet, so `selectMoveIndicator` returns `null` (draw nothing)
 * rather than a false `'invalid'`.
 *
 * # `locked` overrides walk pathfinding, never the attack hover
 *
 * `locked` mirrors "not this member's turn" — a locked member cannot walk
 * anywhere, so every non-attackable hover reads `'locked'`. It is checked
 * after `attackable`; the production caller supplies no armed candidates when
 * the viewer does not own the turn.
 *
 * # The budget marks the path, it never shortens or blocks it
 *
 * `budgetFeet` is the MOVE declaration's `remaining`. A `'path'` selection
 * still carries the WHOLE route — the same array a click sends, so the law
 * above survives intact — and reports `affordable`, how many of its leading
 * cells this turn's movement actually pays for. The renderer draws the rest
 * as overflow.
 *
 * This is a PREVIEW, never a verdict. The client does not refuse the click,
 * shorten the request, or predict the server's answer: an over-budget path is
 * still sent whole and still refused whole, by the server, exactly as before.
 * Note that `Declaration.remaining`'s own proto comment tells clients not to
 * convert the value to cells — this module does, at the server's own
 * documented five-feet-per-cell rate, purely to shade an overlay. That
 * tension is deliberate and unresolved — it wants a ruling, not a quiet
 * client-side reading of a field whose comment forbids it.
 *
 * `budgetFeet` undefined means "no budget applies" (free roam, or no single
 * MOVE declaration to read) — every cell reads affordable, which is the
 * pre-budget behavior unchanged.
 */
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import type { AtlasPathIndex } from './atlasPath';
import { findAtlasPath } from './atlasPath';

export type MoveIndicatorSelection =
  | { kind: 'path'; path: CubeCoord[]; affordable: number }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'target'; entityId: string };

export interface SelectMoveIndicatorArgs {
  /** The floor cell currently under the cursor, or `null` when nothing is
   * hovered (pointer off the raycast target, or off the floor mask
   * entirely — `useHexInteraction`'s own gate already filters that case
   * out before it reaches here). */
  hovered: CubeCoord | null;
  /** The local player's current resting cell — `useSessionWalk`'s
   * `displayPosition` (or its known-good fallback), the same position the
   * player's own `HexEntity` is drawn at. `null` before the first
   * `GetWhere` answer arrives. */
  from: CubeCoord | null;
  pathIndex: AtlasPathIndex | null;
  /** Not this member's turn — see this module's own doc comment. */
  locked: boolean;
  /** The entity id under the hovered cell, if any. */
  hoveredEntityId?: string | null;
  /** True iff `hoveredEntityId` is available on the currently armed exact
   * declaration. Ignored when `hoveredEntityId` is unset. */
  attackable?: boolean;
  /** Feet of movement left this turn — the MOVE declaration's `remaining`.
   * `undefined` when no budget applies; see this module's own doc comment. */
  budgetFeet?: number;
}

/** The server's documented price for a walk: five feet per cell entered
 * (`Walk`'s own RPC comment). The cell the walker already stands on is not
 * entered, so an N-cell path — start cell included, as `findAtlasPath`
 * returns it — costs `(N - 1) * 5`. */
export const FEET_PER_CELL = 5;

/**
 * How many leading cells of `path` the budget pays for, start cell included.
 *
 * The start cell is always affordable: standing still is free. A budget of 0
 * therefore returns 1 — "you are here, and you are not going anywhere" — not
 * 0, which would mean the walker cannot even occupy their own cell.
 */
export function affordableCellCount(
  pathLength: number,
  budgetFeet: number | undefined
): number {
  if (pathLength === 0) return 0;
  if (budgetFeet === undefined) return pathLength;
  const steps = Math.floor(Math.max(0, budgetFeet) / FEET_PER_CELL);
  return Math.min(pathLength, steps + 1);
}

export function selectMoveIndicator(
  args: SelectMoveIndicatorArgs
): MoveIndicatorSelection | null {
  const {
    hovered,
    from,
    pathIndex,
    locked,
    hoveredEntityId,
    attackable,
    budgetFeet,
  } = args;

  if (!hovered) return null;

  if (hoveredEntityId && attackable) {
    return { kind: 'target', entityId: hoveredEntityId };
  }

  if (locked) return { kind: 'locked' };
  // Not enough to judge yet (no GetWhere answer, or no atlas) — draw
  // nothing rather than a false 'invalid'. See this module's own doc
  // comment ("`null` means 'nothing to judge yet'").
  if (!from || !pathIndex) return null;

  const path = findAtlasPath(pathIndex, from, hovered);
  if (path.length === 0) return { kind: 'invalid' };
  return {
    kind: 'path',
    path,
    affordable: affordableCellCount(path.length, budgetFeet),
  };
}
