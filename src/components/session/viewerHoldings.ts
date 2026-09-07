/**
 * viewerHoldings — what the local member is carrying, projected from the
 * beats (rpg-project#368 §5).
 *
 * # Why this is derived and not read
 *
 * Nothing on the session wire reports a member's CURRENT holdings.
 * `Exited.holding` says what left with them, at the moment of departure,
 * and that is the only place the word appears. So the one client that
 * needs to warn a carrier before they leave has to keep the count itself,
 * from the three beats that move a holding: HELD takes one, DROPPED puts
 * one down, EXITED ends the member's run.
 *
 * # It under-claims rather than over-claims
 *
 * A client that joined after the HELD beat never saw it and will show no
 * warning. That is the right way round to be wrong: the warning is a
 * courtesy on top of a rule the server enforces either way, and a button
 * that threatens to drop something the member is not carrying is a worse
 * lie than one that stays quiet. The Leave tooltip states the general rule
 * regardless, so the cost is never entirely unstated.
 *
 * ONLY THE LOCAL MEMBER. Who else is carrying what is on the beats for
 * everyone to see, but nothing in this client asks the question, and a
 * per-member ledger nobody reads is state waiting to go stale.
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';

/**
 * The member's holdings after this beat. Returns the SAME array when
 * nothing changed, so a caller may use it as a `useState` reducer without
 * re-rendering on every unrelated beat.
 *
 * Placement ids, deduplicated: a HELD beat delivered twice leaves one
 * holding, because the member picked up one thing.
 */
export function nextViewerHoldings(
  current: readonly string[],
  event: SessionEvent,
  member: string
): readonly string[] {
  switch (event.body?.case) {
    case 'held': {
      const beat = event.body.value;
      if (beat.holder !== member || !beat.prop) return current;
      if (current.includes(beat.prop)) return current;
      return [...current, beat.prop];
    }
    case 'dropped': {
      const beat = event.body.value;
      if (beat.member !== member || !current.includes(beat.prop)) {
        return current;
      }
      return current.filter((prop) => prop !== beat.prop);
    }
    case 'exited': {
      // The member's run is over and whatever they held went with them —
      // or was dropped on the way out, which the DROPPED beat has already
      // said. Either way they are carrying nothing here any more.
      if (event.body.value.member !== member) return current;
      return current.length === 0 ? current : [];
    }
    default:
      return current;
  }
}
