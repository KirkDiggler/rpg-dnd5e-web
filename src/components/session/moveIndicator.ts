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
}

export function selectMoveIndicator(
  args: SelectMoveIndicatorArgs
): MoveIndicatorSelection | null {
  const { mode, hovered, from, pathIndex, fightLocked, hoveredEntityId } = args;

  if (!hovered) return null;

  if (mode === 'target') {
    return { kind: 'target', entityId: hoveredEntityId ?? null };
  }

  if (fightLocked) return { kind: 'locked' };
  if (!from || !pathIndex) return { kind: 'invalid' };

  const path = findAtlasPath(pathIndex, from, hovered);
  if (path.length === 0) return { kind: 'invalid' };

  return { kind: 'path', path };
}
