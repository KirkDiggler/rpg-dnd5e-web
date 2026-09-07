/**
 * moveController — one place that knows every actor's movement-in-progress,
 * whoever they are and wherever the movement came from.
 *
 * # Why this exists
 *
 * Until now `movePath`/`moveSeq` had exactly one producer: `useSessionWalk`,
 * building them from `MoveResponse.steps` — the answer to the Move RPC THIS
 * client sent. So only the local player could ever have a movement, and
 * `SessionCanvas` passed the pair to one `HexEntity` and to nobody else.
 * Every other actor rendered with a bare `position`, which `useHexMovePath`
 * treats as "not a genuine move" and snaps. Other players, monsters and NPCs
 * slid between hexes in their idle pose (rpg-dnd5e-web#961).
 *
 * The assumption underneath was that the only actor whose movement needs
 * presenting is the one holding the mouse. This module deletes it: a movement
 * is the same object whether its route arrived whole (the local player's own
 * RPC answer) or a cell at a time (anyone else's steps off the stream).
 *
 * # Presentation only, and per viewer
 *
 * A movement here is something to WATCH, never something the rules wait on.
 * Speeds are a local preference and are deliberately not synced between
 * players — moving faster must never get you an outcome any faster. Nothing
 * authoritative may be gated on a movement reported here.
 *
 * # What it reports, and what it refuses to decide
 *
 * This module reports arrival; it does not decide what waits on one — the
 * same relationship `AttackDie3D` has to `useDiceSettleGate`, where the die
 * reports coming to rest and knows nothing about attacks. Reveal gating and
 * the collapsed combat-log line are deliberately NOT here; they are later
 * subscribers to what this already knows.
 *
 * `reached` is that seam. It counts cells the presentation has actually
 * painted, not merely started/finished, so releasing something at the cell
 * where a room opens is an extra call to `movementPainted` rather than a
 * rewrite of the shape. Today only arrival at the end is reported.
 *
 * Pure and React-free on purpose, so it is testable without a WebGL canvas —
 * the same reason `useHexMovePath` keeps `computeMoveStart`/`advanceFrame` as
 * plain functions.
 */
import type { CubeCoord } from '../hex-grid/hexMath';

/** One actor's movement-in-progress. */
export interface Movement {
  /**
   * The cells being walked THROUGH, oldest first — the actor's starting cell
   * is not included, matching `MoveResponse.steps` and the arriving stream
   * beats alike. `useHexMovePath` prepends wherever the actor is currently
   * drawn, so a route never has to carry its own origin.
   */
  readonly route: readonly CubeCoord[];
  /**
   * Bumped once per genuine movement. `useHexMovePath` animates on this
   * CHANGING, so two walks that happen to end on the same cell each still
   * register.
   */
  readonly seq: number;
  /** How many cells of `route` the presentation has actually painted. */
  readonly reached: number;
}

export type Movements = ReadonlyMap<string, Movement>;

export function emptyMovements(): Movements {
  return new Map();
}

/**
 * One arriving cell for an actor whose steps reach us one at a time (anyone
 * but the local player — the wire sends one movement beat per cell).
 */
export function stepArrived(
  prev: Movements,
  member: string,
  to: CubeCoord
): Movements {
  const existing = prev.get(member);
  // Still walking? Then this cell belongs to the SAME journey — the wire
  // sends one beat per cell, so a four-cell walk reaches us as four of
  // these. Once the previous route has been painted to its end, the actor
  // is standing still and this is the start of a new one.
  const inFlight =
    existing !== undefined && existing.reached < existing.route.length;
  const next = new Map(prev);
  next.set(member, {
    route: inFlight ? [...existing.route, to] : [to],
    // Bumped on EVERY step, not once per journey. The beats of one walk are
    // delivered together, so React coalesces them into a single render
    // holding the whole route with a changed sequence — one smooth walk. If
    // they ever arrive split across ticks instead, each bump simply
    // re-animates from wherever the actor is drawn, which walks the same
    // route a cell at a time rather than dropping the appended cells (a
    // sequence that did NOT change is precisely what `useHexMovePath` reads
    // as "nothing new to animate").
    seq: (existing?.seq ?? 0) + 1,
    reached: inFlight ? existing.reached : 0,
  });
  return next;
}

/**
 * A whole route known at once — the local player's own `MoveResponse.steps`,
 * which is "what ACTUALLY happened" and may be shorter than what was asked
 * for. Always a new journey: the answer to a fresh Move RPC is never a
 * continuation of an older one.
 *
 * An empty route changes nothing. A move refused at its very first cell
 * returns no steps, and there is no journey to animate or to reconcile.
 */
export function beginRoute(
  prev: Movements,
  member: string,
  route: readonly CubeCoord[]
): Movements {
  if (route.length === 0) return prev;
  const next = new Map(prev);
  next.set(member, {
    route: [...route],
    seq: (prev.get(member)?.seq ?? 0) + 1,
    reached: 0,
  });
  return next;
}

/**
 * The presentation reporting how far it has actually painted — an
 * observation of the drawn thing, in the spirit of the die reporting that it
 * came to rest rather than a timer guessing when it might have.
 *
 * Keyed by `seq` so a stale report can never credit the movement that
 * replaced it, the same guard `useDiceSettleGate` keys by attack id. Today
 * only arrival at the final cell is reported; a caller that later wants to
 * release something partway through calls this per cell instead, which is an
 * added call rather than a changed shape.
 */
export function movementPainted(
  prev: Movements,
  member: string,
  seq: number,
  reached: number
): Movements {
  const existing = prev.get(member);
  if (!existing || existing.seq !== seq) return prev;
  if (reached <= existing.reached) return prev;
  const next = new Map(prev);
  next.set(member, {
    ...existing,
    reached: Math.min(reached, existing.route.length),
  });
  return next;
}
