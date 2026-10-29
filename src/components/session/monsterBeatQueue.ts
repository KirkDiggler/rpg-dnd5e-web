/**
 * monsterBeatQueue — pure sequencing logic behind "the monster's turn as a
 * moment" (rpg-project#254, design rpg-project#252, slice 2 of the combat
 * turn journey rpg-project#253/#91). Framework-free, same split every other
 * pure selector on this route keeps (`combatBeat.ts`, combat-experience
 * selection) — `useCombatStoryPacing.ts` owns the timers, this module owns the
 * decisions about WHAT plays next.
 *
 * # The problem this solves
 *
 * The server now drives an unplayed member's whole turn in one pass and
 * narrates it as a burst: `moved` (one per cell), then `struck`/`missed`,
 * then `turn_ended` — all of which can land within milliseconds of each
 * other. Shown as fast as they arrive, a four-cell approach and a swing
 * would flash by unreadably. `useCombatStoryPacing` queues these four event
 * kinds (walks, swings and turn ends) and replays them at a
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
 * walks, swings and turn ends whose actor isn't `member` gets
 * queued. A real second human player's own actions would also flow
 * through this same floor — harmless, since a human's own pace is already
 * far slower than the queue's minimum gap, and this avoids a second,
 * `MemberKind`-aware code path for a distinction the wire doesn't need to
 * draw. If that assumption stops holding once real multiplayer ships, the
 * fix is a narrower `needsPacing` gate, not a rewrite of this module.
 *
 * # `nextBeatStep` — pure, so the pacing itself is unit-testable
 *
 * The queue is a plain array the caller owns (`useCombatStoryPacing`'s
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
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

/**
 * One paced story row: an act and its place in its same-id run
 * (rpg-project#630). On the act stream a walk is one act carrying its path,
 * so the paced beats are a walk, a swing, and the turn's end.
 */
export interface QueuedBeat {
  readonly act: Act;
  readonly index: number;
  /** World walks share completion order but never announce a combat turn. */
  readonly scope: 'turn' | 'world';
  /** Discarded is terminal for this queued motion, not for its story row. */
  readonly walkPresentation: 'none' | 'eligible' | 'discarded';
}

export function beatActor(act: Act): string | undefined {
  const body = act.body;
  switch (body.case) {
    case 'walk':
      return body.value.mover?.id;
    case 'attack':
      return body.value.by?.id;
    case 'clock':
      return body.value.mark === ClockMark.TURN_ENDED
        ? body.value.turn?.member?.id
        : undefined;
    default:
      return undefined;
  }
}

/**
 * True for a turn's end by somebody other than `member`, and for a walk or a
 * swing by another member of the viewer's fight (`fight`). A walk or swing by
 * somebody outside it is world pace, not a turn (rpg-project#685). World walks
 * can wait for visible completion without a turn announcement. A turn's end is
 * the fight's own clock, so it is always a turn.
 */
export function needsPacing(
  act: Act,
  member: string,
  fight: ReadonlySet<string>
): boolean {
  const actor = beatActor(act);
  if (actor === undefined || actor === member) return false;
  return isTurnEnd(act) || fight.has(actor);
}

export function isTurnEnd(act: Act): boolean {
  return (
    act.body.case === 'clock' && act.body.value.mark === ClockMark.TURN_ENDED
  );
}

export type BeatStep =
  | { type: 'idle' }
  | { type: 'announce'; actor: string }
  | { type: 'process'; beat: QueuedBeat; actor: string };

/**
 * Pure: decides the next step from the queue's current head and which
 * actor's turn has already been announced. Never mutates `queue` — an
 * `announce` step leaves the head in place; a `process` step's caller is the
 * one that shifts it off. `announcedActor` resets to `null` once a turn's end
 * for that actor has been processed, so the NEXT actor's first beat announces.
 */
export function nextBeatStep(
  queue: readonly QueuedBeat[],
  announcedActor: string | null
): BeatStep {
  const beat = queue[0];
  if (!beat) return { type: 'idle' };
  const actor = beatActor(beat.act);
  if (actor === undefined) {
    return { type: 'process', beat, actor: announcedActor ?? '' };
  }
  if (beat.scope === 'turn' && actor !== announcedActor) {
    return { type: 'announce', actor };
  }
  return { type: 'process', beat, actor };
}
