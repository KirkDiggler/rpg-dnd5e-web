/**
 * monsterBeatQueue — pure sequencing logic behind "the monster's turn as a
 * moment" (rpg-project#254, design rpg-project#252, slice 2 of the combat
 * turn journey rpg-project#253/#91). Framework-free, same split every other
 * pure selector on this route keeps (`combatBeat.ts`, `combatPanel.ts`,
 * `turnHud.ts`) — `useCombatPanel.ts` owns the timers, this module owns the
 * decisions about WHAT plays next.
 *
 * # The problem this solves
 *
 * The server now drives an unplayed member's whole turn in one pass and
 * narrates it as a burst: `moved` (one per cell), then `struck`/`missed`,
 * then `turn_ended` — all of which can land within milliseconds of each
 * other. Shown as fast as they arrive, a four-cell approach and a swing
 * would flash by unreadably. `useCombatPanel` queues these four event
 * kinds (`moved`/`struck`/`missed`/`turnEnded`) and replays them at a
 * fixed human-followable pace; every OTHER kind (`downed`, `fightStarted`,
 * `fightEnded`, and anything the local player caused themselves) bypasses
 * the queue entirely and is handled immediately, exactly as before this
 * slice.
 *
 * # "Other member," not "monster" specifically
 *
 * Despite the module's name (kept for continuity with the design's own
 * vocabulary — today the only member whose turn the server ever drives is
 * a monster), the actual test here is simply "not the local player": any
 * `moved`/`struck`/`missed`/`turnEnded` whose actor isn't `member` gets
 * queued. A real second human player's own actions would also flow
 * through this same floor — harmless, since a human's own pace is already
 * far slower than the queue's minimum gap, and this avoids a second,
 * `MemberKind`-aware code path for a distinction the wire doesn't need to
 * draw. If that assumption stops holding once real multiplayer ships, the
 * fix is a narrower `needsPacing` gate, not a rewrite of this module.
 *
 * # `nextBeatStep` — pure, so the pacing itself is unit-testable
 *
 * The queue is a plain array the caller owns (`useCombatPanel`'s
 * `queueRef`); this module never touches it directly. `nextBeatStep`
 * READS the queue's head and the currently-announced actor and decides
 * one of three things, without any side effect or timer of its own:
 *
 * - `idle` — nothing queued.
 * - `announce` — the head belongs to a DIFFERENT actor than the one last
 *   announced (a new driven turn is starting): the caller shows
 *   "<name>'s turn." and calls back after its own pace delay WITHOUT
 *   consuming the event, so the very first real beat of that turn is
 *   still there to process next.
 * - `process` — the head belongs to the already-announced actor: the
 *   caller shifts it off the queue and applies its own side effects
 *   (refetching GetView on `moved`, formatting a beat on `struck`/
 *   `missed`, finalizing on `turnEnded`).
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';

/** The four beat kinds a driven turn narrates, in the order the wire
 * always delivers them for one turn: zero or more `moved`, then zero or
 * one `struck`/`missed`, then exactly one `turnEnded`. */
type PacedCase = 'moved' | 'struck' | 'missed' | 'turnEnded';

const PACED_CASES: ReadonlySet<string> = new Set<PacedCase>([
  'moved',
  'struck',
  'missed',
  'turnEnded',
]);

/**
 * The acting member for one of the four paced kinds — `undefined` for
 * every other kind (this module has no opinion on who a `downed`'s
 * `member` field "acts for"; that's the victim, not a turn owner). Also
 * `undefined` for `case: undefined` (an untyped/legacy event fixture).
 */
export function beatActor(event: SessionEvent): string | undefined {
  switch (event.body?.case) {
    case 'moved':
      return event.body.value.member;
    case 'struck':
    case 'missed':
      return event.body.value.attacker;
    case 'turnEnded':
      return event.body.value.member;
    default:
      return undefined;
  }
}

/**
 * True when this event belongs on the paced queue rather than the
 * immediate path — one of the four paced kinds, with a resolvable actor
 * that isn't `member`. See this module's own doc comment for why the
 * test is "not me," not "is a monster."
 */
export function needsPacing(event: SessionEvent, member: string): boolean {
  const kind = event.body?.case;
  if (kind === undefined || !PACED_CASES.has(kind)) return false;
  const actor = beatActor(event);
  return actor !== undefined && actor !== member;
}

export type BeatStep =
  | { type: 'idle' }
  | { type: 'announce'; actor: string }
  | { type: 'process'; event: SessionEvent; actor: string };

/**
 * Pure: decides the next step from the queue's current head and which
 * actor's turn has already been announced. Never mutates `queue` — an
 * `announce` step leaves the head in place (there's nothing to process
 * yet, just something to say first); a `process` step's caller is the one
 * that shifts it off. `announcedActor` resets to `null` once a
 * `turnEnded` for that actor has been processed (`useCombatPanel`'s own
 * job), so the NEXT actor's first beat announces in turn.
 */
export function nextBeatStep(
  queue: readonly SessionEvent[],
  announcedActor: string | null
): BeatStep {
  const event = queue[0];
  if (!event) return { type: 'idle' };
  const actor = beatActor(event);
  if (actor === undefined) {
    // Defensive only — a queue built exclusively from `needsPacing`-true
    // events never reaches this branch. Treat it as immediately
    // processable under whichever actor is already announced (or none)
    // rather than stall the queue on a malformed entry.
    return { type: 'process', event, actor: announcedActor ?? '' };
  }
  if (actor !== announcedActor) {
    return { type: 'announce', actor };
  }
  return { type: 'process', event, actor };
}
