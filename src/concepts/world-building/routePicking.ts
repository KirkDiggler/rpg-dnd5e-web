/**
 * Pick on map: the row form asks the studio for a cell or a route
 * (rpg-project#720).
 *
 * THE TABLES AND THE LAYOUT ARE TWO HOMES. A row is edited under Encounter;
 * the cells it walks are on the Layout under Build. The row hands the studio a
 * request — what to pick, what it already holds, and where to write the
 * answer — and the studio opens the Layout armed for it, the way a
 * concealment's "Add members" does. Each click appends a waypoint (or, for a
 * cell, is the answer); Done writes the route back through the row's own
 * commit, as ONE edit.
 *
 * ABSENT, NO PICKER. Outside the studio (the world builder's inspector) there
 * is no Layout to click, so the context is undefined and the row shows the
 * route's chips and fields without the Pick on map button.
 */
import { createContext, useContext, useRef } from 'react';
import type { AnswerCellShape, AnswerWaypointShape } from './answerTableShape';

/** A cell (one click answers), a route (clicks in walking order), or a set
 * of cells (each click adds or takes away one; rpg-project#975 C). */
export type RoutePickMode = 'cell' | 'route' | 'cells';

export interface RoutePickRequest {
  mode: RoutePickMode;
  /** What the pick is for, in words: "gate-patrol time entry 9". */
  label: string;
  /** The waypoints already held; clicks append to them. A cell pick starts
   * empty and ends on its first click. */
  route: readonly AnswerWaypointShape[];
  /** The answer: the route as picked, or one cell. */
  onDone(route: AnswerWaypointShape[]): void;
  /** The file path of what the pick is for: landed on and marked when the
   * studio returns to it. */
  revealPath?: string;
}

export interface RoutePicking {
  arm(request: RoutePickRequest): void;
}

export const RoutePickContext = createContext<RoutePicking | undefined>(
  undefined
);

export function useRoutePicking(): RoutePicking | undefined {
  return useContext(RoutePickContext);
}

/** One cell, as a pick answers it. */
export function firstCell(
  route: readonly AnswerWaypointShape[]
): AnswerCellShape | undefined {
  const first = route[0];
  return first ? { q: first.q, r: first.r } : undefined;
}

/** A function that always calls the newest `fn` it was rendered with.
 *
 * A PICK OUTLIVES THE RENDER THAT ARMED IT. Arming switches the studio to the
 * Layout, which retires every callback of the render before it (the studio
 * fences a commit made through a stale presentation). Done therefore writes
 * through the row's commit as of the row's LAST render, which belongs to the
 * presentation that is current when the author presses it. */
export function useLatest<Args extends unknown[]>(
  fn: (...args: Args) => void
): (...args: Args) => void {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef((...args: Args) => ref.current(...args));
  return stable.current;
}

/** A set of cells with one cell added, or taken away when it is already
 * there (rpg-project#975 C): a click in a `cells` pick. */
export function toggledCell(
  cells: readonly AnswerWaypointShape[],
  cell: AnswerCellShape
): AnswerWaypointShape[] {
  const held = cells.some((c) => c.q === cell.q && c.r === cell.r);
  return held
    ? cells.filter((c) => !(c.q === cell.q && c.r === cell.r))
    : [...cells, { q: cell.q, r: cell.r }];
}

/** The cells a `cells` pick holds after one click (rpg-project#975 C
 * review): a floor cell is added, or taken away when held; a click on a
 * cell that is not floor changes nothing — the pick is a map tool, and the
 * map shows its floor. A held cell that is no longer floor can still be
 * clicked away. */
export function pickedCells(
  cells: readonly AnswerWaypointShape[],
  cell: AnswerCellShape,
  isFloor: (cell: AnswerCellShape) => boolean
): AnswerWaypointShape[] {
  const held = cells.some((c) => c.q === cell.q && c.r === cell.r);
  if (!held && !isFloor(cell)) return [...cells];
  return toggledCell(cells, cell);
}
