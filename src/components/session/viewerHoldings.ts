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
 * from the three acts that move a holding: a hold takes one, a drop puts
 * one down, a departure ends the member's run.
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
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

/**
 * The member's holdings after this act (rpg-project#630): a hold takes one
 * up, a drop puts one down, and a departure clock entry ends the member's
 * run. Returns the SAME array when nothing changed, so a caller may use it as
 * a `useState` reducer without re-rendering on every unrelated act, and a
 * hold delivered twice leaves one holding.
 */
export function nextViewerHoldingsFromAct(
  current: readonly string[],
  act: Act,
  member: string
): readonly string[] {
  const body = act.body;
  switch (body.case) {
    case 'hold': {
      const prop = body.value.prop?.id;
      if (body.value.by?.id !== member || !prop) return current;
      if (current.includes(prop)) return current;
      return [...current, prop];
    }
    case 'drop': {
      const prop = body.value.prop?.id;
      if (body.value.by?.id !== member || !prop || !current.includes(prop)) {
        return current;
      }
      return current.filter((held) => held !== prop);
    }
    case 'clock': {
      if (body.value.mark !== ClockMark.EXITED) return current;
      if (body.value.departure?.member?.id !== member) return current;
      return current.length === 0 ? current : [];
    }
    default:
      return current;
  }
}
