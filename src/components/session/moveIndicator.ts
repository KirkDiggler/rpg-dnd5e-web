/**
 * moveIndicator — pure selection logic for the session route's hover
 * indicator (rpg-dnd5e-web#762 slice 4): given the cell under the cursor
 * and the local player's own state, decides what should be drawn there.
 * Framework-free by design — no React, no Three.js — so it is unit
 * testable in isolation and so the render layer can never accidentally
 * grow a second opinion about what's walkable.
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
 * rather than a false `'invalid'` (rpg-dnd5e-web#768, Copilot review on
 * PR #768 — `SessionCanvas.tsx`'s own `pathIndex` doc comment already said
 * "null...simply means nothing is drawn," but this file's code
 * contradicted it before this fix). `SessionEncounterView.tsx` now also
 * pins `pathIndex` to the last successfully-loaded atlas rather than the
 * live (possibly refetch-nulled) one, so in practice this `null` branch is
 * only ever reached before the FIRST successful atlas load — a background
 * refetch failure after that no longer routes through it at all.
 *
 * # Fight lock overrides everything in 'move' mode
 *
 * A fight-locked member cannot walk anywhere, full stop — so `fightLocked`
 * is checked before any pathfinding, and every hover reads `'locked'`
 * regardless of whether the hovered cell would otherwise be reachable.
 *
 * # The 'target' mode seam
 *
 * `mode: 'target'` is combat's seam, not combat itself: this module only
 * threads through which entity (if any) sits under the cursor. Deciding
 * what a target hover MEANS (can attack? in range? whose turn?) is out of
 * scope for this slice and stays combat's job when it lands.
 *
 * # `maxCells` — the server's movement bound, never a client rule
 *
 * On the turn clock, a Move declaration's `remaining` (feet) bounds how
 * far a path preview may run (rpg-dnd5e-web#762, toolkit#1169). `maxCells`
 * is that figure ALREADY converted to whole cells by the caller
 * (`Math.floor(remaining / 5)` — `Declaration.remaining`'s own doc comment:
 * "a client may round this figure down to whole cells to grey out a
 * preview, and nothing more" — five feet per cell is the server's own
 * arithmetic, not a rule this module derives). A path longer than the
 * bound reads `'invalid'`, same as an unreachable cell — the PREVIEW is a
 * courtesy; `useSessionWalk`'s real `Move` call still gets refused whole by
 * the server if a race lets a stale bound through, and that refusal names
 * the actual shortfall ("movement: 20 ft needed, 15 ft left"), not this
 * module's guess. `undefined` means unbounded (free roam, or `'target'`
 * mode, where this check never runs).
 */
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import type { AtlasPathIndex } from './atlasPath';
import { findAtlasPath } from './atlasPath';

export type MoveIndicatorMode = 'move' | 'target';

export type MoveIndicatorSelection =
  | { kind: 'path'; path: CubeCoord[] }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'target'; entityId: string | null };

export interface SelectMoveIndicatorArgs {
  mode: MoveIndicatorMode;
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
  /** Mirrors `useSessionWalk`'s `fightLocked`. */
  fightLocked: boolean;
  /** `'target'` mode only — the entity id under the hovered cell, if any.
   * Ignored in `'move'` mode. */
  hoveredEntityId?: string | null;
  /** The server's own movement bound for THIS turn, already rounded down
   * to whole cells — see this module's own doc comment. `undefined` means
   * unbounded (free roam). Ignored in `'target'` mode. */
  maxCells?: number;
}

export function selectMoveIndicator(
  args: SelectMoveIndicatorArgs
): MoveIndicatorSelection | null {
  const {
    mode,
    hovered,
    from,
    pathIndex,
    fightLocked,
    hoveredEntityId,
    maxCells,
  } = args;

  if (!hovered) return null;

  if (mode === 'target') {
    return { kind: 'target', entityId: hoveredEntityId ?? null };
  }

  if (fightLocked) return { kind: 'locked' };
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
