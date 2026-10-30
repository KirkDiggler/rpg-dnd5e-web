/**
 * A cell and a route, as the row form writes them (rpg-project#720, S6 of
 * rpg-project#714).
 *
 * THE FORM WRITES THE SHAPES THE READER ALREADY READS. `answerTableShape`
 * decodes `toward: { at: { q, r } }` and `toward: { path: [{ q, r, wait?,
 * facing? }, …] }`, keeping each waypoint's keys in the order q, r, then the
 * pause; every helper here builds exactly that, so a route the form writes
 * and the same route typed by hand are the same bytes (the castle's
 * round-trip test pins it).
 *
 * IT DECIDES NOTHING. A route that retraces its own cells, a waypoint off the
 * floor, a leg through a wall: each is the ENGINE's refusal, said through the
 * validate-only `PutDungeon` at the row (R17). The one thing this module
 * keeps from being written is a facing without a wait — the reader itself
 * refuses that shape, so the form never offers it.
 */
import {
  ANSWER_AT_SELECTOR,
  ANSWER_PATH_SELECTOR,
} from '@/author/answerVocabulary';
import type {
  AnswerCellShape,
  AnswerSelectorShape,
  AnswerWaypointShape,
} from './answerTableShape';

/** Whether a table word walks to a place, so it may take a cell or a route:
 * the words the declaration names (`toward`, and the engine's `dash`, a run
 * toward, rpg-project#671 R17). */
export function wordTakesCell(word: string): boolean {
  return ANSWER_AT_SELECTOR.words.includes(word);
}

export function wordTakesRoute(word: string): boolean {
  return ANSWER_PATH_SELECTOR.words.includes(word);
}

/** A waypoint in the reader's key order: q, r, then wait, then facing. A
 * facing is kept only beside a positive wait (the facing is the stand's). */
export function waypointOf(
  cell: AnswerCellShape,
  pause: { wait?: number; facing?: string } = {}
): AnswerWaypointShape {
  const out: AnswerWaypointShape = { q: cell.q, r: cell.r };
  if (pause.wait !== undefined) out.wait = pause.wait;
  if (pause.facing !== undefined && (pause.wait ?? 0) > 0)
    out.facing = pause.facing;
  return out;
}

/** `{ at: { q, r } }`. */
export function cellSelector(cell: AnswerCellShape): AnswerSelectorShape {
  return { at: { q: cell.q, r: cell.r } };
}

/** `{ path: [...] }`, each waypoint rebuilt in the reader's key order. */
export function routeSelector(
  route: readonly AnswerWaypointShape[]
): AnswerSelectorShape {
  return { path: route.map((w) => waypointOf(w, w)) };
}

/** A clicked cell, appended as the route's last waypoint. Clicking the cell
 * the route already ends on appends it again: the engine refuses that route
 * in its own sentence, and the form does not pre-judge it. */
export function appendWaypoint(
  route: readonly AnswerWaypointShape[],
  cell: AnswerCellShape
): AnswerWaypointShape[] {
  return [...route, waypointOf(cell)];
}

export function removeWaypoint(
  route: readonly AnswerWaypointShape[],
  index: number
): AnswerWaypointShape[] {
  return route.filter((_, i) => i !== index);
}

/** Move a waypoint one place earlier (`by` -1) or later (+1). */
export function moveWaypoint(
  route: readonly AnswerWaypointShape[],
  index: number,
  by: -1 | 1
): AnswerWaypointShape[] {
  const to = index + by;
  if (index < 0 || index >= route.length || to < 0 || to >= route.length)
    return [...route];
  const next = [...route];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Set or clear a waypoint's wait, in whole rounds. A wait of 0 is no stand
 * and is not written (the engine's default). Clearing it, or setting it to 0,
 * also clears its facing: a facing with no stand is a shape the
 * reader refuses, and leaving it behind would write a known-bad file. */
export function setWaypointWait(
  route: readonly AnswerWaypointShape[],
  index: number,
  wait: number | undefined
): AnswerWaypointShape[] {
  return route.map((w, i) => {
    if (i !== index) return w;
    if (!wait) return waypointOf(w);
    return waypointOf(w, { wait, facing: w.facing });
  });
}

/** Set or clear a waypoint's facing. Only a waypoint with a wait takes one. */
export function setWaypointFacing(
  route: readonly AnswerWaypointShape[],
  index: number,
  facing: string | undefined
): AnswerWaypointShape[] {
  return route.map((w, i) =>
    i === index ? waypointOf(w, { wait: w.wait, facing }) : w
  );
}

/** A wait typed into the field: a whole number of rounds, 0 or more, or
 * undefined for an empty field. Anything else is not written. */
export function parseWait(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Whether a value is a route as a `with:` gives one to a bundle's `$path`:
 * a list of `{ q, r, … }` waypoints with integer cells. */
export function isRouteValue(value: unknown): value is AnswerWaypointShape[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (w) =>
        typeof w === 'object' &&
        w !== null &&
        Number.isInteger((w as { q?: unknown }).q) &&
        Number.isInteger((w as { r?: unknown }).r)
    )
  );
}

/** "waits 1, faces ne" — a waypoint's pause, or nothing. */
export function pauseText(waypoint: AnswerWaypointShape): string {
  const parts = [
    ...(waypoint.wait !== undefined ? [`waits ${waypoint.wait}`] : []),
    ...(waypoint.facing !== undefined ? [`faces ${waypoint.facing}`] : []),
  ];
  return parts.join(', ');
}
