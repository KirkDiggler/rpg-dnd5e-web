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
 * # Attack is a hover state, not a mode (rpg-project#249)
 *
 * The old `'move' | 'target'` toggle is gone: on your own turn you can
 * walk AND fight without switching anything, exactly per the design's own
 * walkthrough ("Enemies in reach are highlighted; hovering one shows
 * 'Attack skeleton-1'. Clicking it swings"). `attackable` is the caller's
 * own answer to "is THIS hovered subject one `combatPanel.ts`'s
 * `attackTargets` actually named" (already turn-gated and reach-gated
 * there — this module makes no such judgment of its own) — when true, the
 * hover reads `'target'` regardless of what a path to that cell would
 * otherwise look like; every other hover falls through to the ordinary
 * walk-preview logic below.
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
 * `locked` mirrors "not this member's turn" (`combatPanel.ts`'s own
 * turn-ownership gate) — a locked member cannot walk anywhere, so every
 * non-attackable hover reads `'locked'` regardless of what a path would
 * otherwise look like. It is checked AFTER the `attackable` branch above
 * only as a matter of order, never as a race: `attackable` is already
 * false whenever it isn't this member's turn, because `combatPanel.ts`
 * only ever populates `attackTargets` on your own turn.
 *
 * # `maxCells` — the server's movement bound, never a client rule
 *
 * On the turn clock, a Move declaration's `remaining` (feet) bounds how
 * far a path preview may run (rpg-project#249, rpg-toolkit#1169).
 * `maxCells` is that figure ALREADY converted to whole cells by the
 * caller (`Math.floor(remaining / 5)` — `Declaration.remaining`'s own
 * doc comment: "a client may round this figure down to whole cells to
 * grey out a preview, and nothing more" — five feet per cell is the
 * server's own arithmetic, not a rule this module derives). A path
 * longer than the bound reads `'invalid'`, same as an unreachable cell —
 * the PREVIEW is a courtesy; `useSessionWalk`'s real `Move` call still
 * gets refused whole by the server if a race lets a stale bound through,
 * and that refusal names the actual shortfall ("movement: 20 ft needed,
 * 15 ft left"), not this module's guess. `undefined` means unbounded
 * (free roam).
 */
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import type { AtlasPathIndex } from './atlasPath';
import { findAtlasPath } from './atlasPath';

export type MoveIndicatorSelection =
  | { kind: 'path'; path: CubeCoord[] }
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
  /** True iff `hoveredEntityId` is one of `combatPanel.ts`'s own
   * `attackTargets` — this module trusts the caller's answer rather than
   * re-deriving reach/turn-ownership. Ignored when `hoveredEntityId` is
   * unset. */
  attackable?: boolean;
  /** The server's own movement bound for THIS turn, already rounded down
   * to whole cells — see this module's own doc comment. `undefined` means
   * unbounded (free roam). */
  maxCells?: number;
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
    maxCells,
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

  // path[0] is the start cell (findAtlasPath's own convention), so
  // path.length - 1 is the number of cells actually walked — the figure
  // maxCells bounds. See this module's own doc comment on `maxCells`.
  if (maxCells !== undefined && path.length - 1 > maxCells) {
    return { kind: 'invalid' };
  }

  return { kind: 'path', path };
}
