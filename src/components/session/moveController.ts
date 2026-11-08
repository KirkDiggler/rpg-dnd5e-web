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
import type { MoveKind } from '../hex-grid/moveKind';

/** One actor's movement-in-progress. */
export interface Movement {
  /**
   * The cells being walked THROUGH, oldest first — the actor's starting cell
   * is not included, matching `MoveResponse.steps` and the arriving stream
   * beats alike. `useHexMovePath` prepends wherever the actor is currently
   * drawn, so a route never has to carry its own origin.
   */
  readonly route: readonly CubeCoord[];
  /** How the body moves, supplied by the act; absent means its own walk. */
  readonly kind?: MoveKind;
  /**
   * Bumped once per genuine movement. `useHexMovePath` animates on this
   * CHANGING, so two walks that happen to end on the same cell each still
   * register.
   */
  readonly seq: number;
  /** How many cells of `route` the presentation has actually painted. */
  readonly reached: number;
  /**
   * Set only when this sequence CONTINUES the journey the previous sequence
   * was still painting (`continueRoute`): the cells before this index are
   * that earlier sequence's, already being walked, and only the cells from
   * here on are new. `useHexMovePath` appends them to the walk in flight
   * instead of re-walking the route from its start. Absent means the route
   * is a journey of its own.
   */
  readonly continuedFrom?: number;
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
 * continuation of an older one. The one way a journey goes on after its
 * answer is `continueRoute`, fed by `continuedWalk` from the member's own
 * walk acts on the stream (rpg-project#890); nothing else extends a route
 * that `beginRoute` started.
 *
 * An empty route changes nothing. A move refused at its very first cell
 * returns no steps, and there is no journey to animate or to reconcile.
 */
export function beginRoute(
  prev: Movements,
  member: string,
  route: readonly CubeCoord[],
  kind: MoveKind = 'own'
): Movements {
  if (route.length === 0) return prev;
  const next = new Map(prev);
  next.set(member, {
    route: [...route],
    ...(kind !== 'own' ? { kind } : {}),
    seq: (prev.get(member)?.seq ?? 0) + 1,
    reached: 0,
  });
  return next;
}

/**
 * More cells of the SAME journey (rpg-project#890): the local player's walk
 * going on after its Move answer, cells arriving from their own walk acts on
 * the stream once `continuedWalk` has trimmed what the answer already
 * carried.
 *
 * Still walking? Then the cells are appended to the route in flight and
 * `continuedFrom` marks where they start, so the presentation appends them to
 * the walk it is painting rather than re-walking the route from its first
 * cell. Already standing still? Then the cells are a route of their own,
 * walked from wherever the body is drawn, exactly as `stepArrived` starts a
 * fresh route once the last one is painted.
 *
 * The sequence is bumped either way: a sequence that did not change is what
 * `useHexMovePath` reads as "nothing new to animate". An empty list changes
 * nothing.
 */
export function continueRoute(
  prev: Movements,
  member: string,
  cells: readonly CubeCoord[]
): Movements {
  if (cells.length === 0) return prev;
  const existing = prev.get(member);
  const inFlight = isWalking(existing);
  const next = new Map(prev);
  next.set(member, {
    route: inFlight ? [...existing!.route, ...cells] : [...cells],
    ...(inFlight && existing!.kind ? { kind: existing!.kind } : {}),
    seq: (existing?.seq ?? 0) + 1,
    reached: inFlight ? existing!.reached : 0,
    ...(inFlight ? { continuedFrom: existing!.route.length } : {}),
  });
  return next;
}

/**
 * THE WALK GOES ON AFTER THE ANSWER (rpg-project#879 S1, #890). A Move may
 * answer with the walker's own steps only up to the point the world's pace
 * comes due (`MoveResponse.continues`); the step that pays the round, the
 * raise and the remaining steps run after the answer and reach this client
 * as the member's own walk acts on the act stream. A `Continuation` is how
 * the controller knows, per member, that such a walk is still going on and
 * where on the stream it picks up.
 *
 * It is set by `moveAnswered` and nothing else: a continuing answer sets it,
 * and EVERY answer replaces whatever was there, so a second Move's answer
 * always starts a new journey and the first walk's continuation is gone.
 *
 * Ordering is by act id, compared as strings: the act stream's ids are
 * record ids, "an ordering key, not a counter", and two are ordered by
 * comparing them as strings (`Act.id`, protos v1alpha2). Acts sharing an id
 * are one delivery unit; each carries the unit's id, and a walk act at or
 * before `after` folds only steps the answer already carried.
 */
export interface Continuation {
  /**
   * Own walk acts with an id after this one continue the journey. Starts at
   * the answer's `through` (the record id of its last step; empty when the
   * answer carried no steps, which every id is after) and advances to each
   * continued act's id, so the same act can never be played twice.
   */
  readonly after: string;
  /**
   * The act (`<verb>:<id>`) the continuation belongs to, learned from the
   * first own walk act after `through`. The walk is one act, and the stream
   * delivers it whole before any later verb's acts, so a later own walk under
   * another act (a next Move whose answer has not landed yet) is not this
   * journey.
   */
  readonly act?: string;
  /** Every cell this journey has walked so far, the answer's first. */
  readonly walked: readonly CubeCoord[];
}

export type Continuations = ReadonlyMap<string, Continuation>;

export function emptyContinuations(): Continuations {
  return new Map();
}

/** What a Move answer says about the walk going on after it. */
export interface MoveAnswer {
  /** The answer's steps, in order (`MoveResponse.steps`). */
  readonly route: readonly CubeCoord[];
  /** `MoveResponse.continues`: the walk goes on after the answer. */
  readonly continues: boolean;
  /** `MoveResponse.through`: the record id of the last step in `route`. */
  readonly through: string;
}

/**
 * A Move answer arrived for `member`. Any earlier continuation is over —
 * the server serialises verbs, so a later answer means the earlier walk has
 * finished — and a continuing answer starts a new one after its `through`.
 * Returns the same object when nothing changes.
 */
export function moveAnswered(
  prev: Continuations,
  member: string,
  answer: MoveAnswer
): Continuations {
  if (!answer.continues && !prev.has(member)) return prev;
  const next = new Map(prev);
  if (answer.continues)
    next.set(member, { after: answer.through, walked: [...answer.route] });
  else next.delete(member);
  return next;
}

/** One of the member's own walk acts, as the stream delivered it. */
export interface OwnWalk {
  /** `Act.id`: the record id of the last step this act folds. */
  readonly id: string;
  /** `Act.act`: the act this walk segment belongs to. */
  readonly act: string;
  /** The walk's cells in order (`WalkAct.path`). */
  readonly cells: readonly CubeCoord[];
}

/**
 * The cells of an own walk act that continue `member`'s journey, and the
 * advanced state; undefined when the act does not continue it (no
 * continuation, at or before `after`, or another act's walk).
 *
 * TRIMMING. An act folds every step of one segment from the segment's first
 * step, and its id is the LAST step's, so the first act after `through` can
 * also carry steps the answer already played (a segment that straddles
 * `through`). A later segment of the same walk restates the cell the last
 * one left the mover on as its first cell. Both are a prefix of the act's
 * path that repeats the tail of what was already walked; that prefix is
 * dropped, keeping at least the act's last cell, which is past `through` by
 * the act's own id. A server path that doubled back over its own last cells
 * could be over-trimmed; the body still ends where the server put it,
 * because the resting position comes from `where`, not from the route.
 */
export function continuedWalk(
  prev: Continuations,
  member: string,
  walk: OwnWalk
): { continuations: Continuations; cells: CubeCoord[] } | undefined {
  const current = prev.get(member);
  if (!current) return undefined;
  if (walk.id <= current.after) return undefined;
  if (current.act !== undefined && walk.act !== current.act) return undefined;
  const repeated = repeatedTail(current.walked, walk.cells);
  const cells = walk.cells.slice(repeated);
  const next = new Map(prev);
  next.set(member, {
    after: walk.id,
    act: walk.act,
    walked: [...current.walked, ...cells],
  });
  return { continuations: next, cells };
}

/** The longest prefix of `path`, shorter than `path`, that is the tail of
 * `walked`. */
function repeatedTail(
  walked: readonly CubeCoord[],
  path: readonly CubeCoord[]
): number {
  for (let k = Math.min(walked.length, path.length - 1); k > 0; k--) {
    const tail = walked.length - k;
    let same = true;
    for (let i = 0; i < k && same; i++)
      same = sameCell(walked[tail + i]!, path[i]!);
    if (same) return k;
  }
  return 0;
}

function sameCell(a: CubeCoord, b: CubeCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Forget every member the viewer is not currently sighting live.
 *
 * The wire sends a movement beat for the WHOLE roster, seen or not — the
 * audience for a step is `rosterIDs()`, and the only narrowing is a
 * concealed-region step, which withholds the beat entirely rather than
 * trimming it. So without this, an actor the viewer cannot see accumulates a
 * route anyway, and `useHexMovePath` replays it the instant that actor is
 * sighted again: a remembered skeleton walks across the map instead of
 * simply being at its new cell. While it is remembered `HexEntity` passes
 * `moveSeq` as `undefined`, which clears `seenSeq` — so the stored sequence
 * reads as brand new on return, and "brand new" is exactly what that hook
 * means by a genuine move.
 *
 * Dropping the entry is what makes the return a snap: with nothing stored
 * there is no route to replay, and the next real beat starts at 1.
 *
 * Also the honest reading of what a movement IS here. This module presents
 * what the viewer watches happen; an actor they cannot see is not something
 * they are watching, whatever the wire chose to tell them.
 *
 * Returns the same object when nothing is dropped, so the common case adds
 * no referential churn to the memo feeding the canvas.
 */
export function forgetUnsighted(
  prev: Movements,
  sighted: ReadonlySet<string>
): Movements {
  let next: Map<string, Movement> | undefined;
  for (const member of prev.keys()) {
    if (sighted.has(member)) continue;
    if (!next) next = new Map(prev);
    next.delete(member);
  }
  return next ?? prev;
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

/** Discard one unavailable presentation without erasing a newer route. */
export function forgetRoute(
  prev: Movements,
  member: string,
  seq: number
): Movements {
  if (prev.get(member)?.seq !== seq) return prev;
  const next = new Map(prev);
  next.delete(member);
  return next;
}

/** True while the canvas has not painted `movement` to its last cell. */
export function isWalking(movement: Movement | undefined): boolean {
  return movement !== undefined && movement.reached < movement.route.length;
}

/**
 * THE END FACING WAITS FOR THE TOKEN (rpg-project#630). A walk arrives as one
 * act, and the view it triggers already states where the walker faces when
 * it STOPS. Handed to the token at once, that facing turns it before it has
 * taken a step, and it walks the whole path facing its destination's view.
 * While it walks it carries no wire facing, so it faces the way it goes; the
 * stated facing lands once the walk is painted to its end.
 */
export function facingWhileWalking(
  facingDegrees: number | undefined,
  movement: Movement | undefined
): number | undefined {
  return isWalking(movement) ? undefined : facingDegrees;
}
