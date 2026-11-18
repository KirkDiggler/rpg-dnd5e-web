import type { SpeakTarget } from '@/api/useSessionSpeak';
import { getSkillDisplay, getSkillEnum } from '@/utils/enumDisplay';
import { refId, refLabel } from '@/utils/refs';
import type {
  Declaration,
  InteractOption,
  SpeakOption,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * READING A SPEAK OFFER (rpg-project#569): who can be spoken to, and what can
 * be said to each.
 *
 * Both answers are the server's. `Declaration.speak_options` is one row per
 * (target, option) pair across every target in sight, each carrying its own
 * `available`. This module only groups those rows; it decides nothing about
 * who may hear whom or which line a character qualifies for.
 *
 * AN UNAVAILABLE LINE IS NOT SHOWN. The offer already gated it (a `requires`
 * the actor does not meet), and drawing it greyed would tell the player a
 * line exists that their character has no way to know about.
 *
 * A PENDING LINE IS SHOWN, AND NEVER SENT (rpg-project#924). `pending` says a
 * speaker's waiting roll holds the line. It arrives with `available` false
 * and `SHORTFALL_REASON_LINE_RESERVED`, but it is not a gated line: the
 * player qualifies and the line frees itself once the roll is decided. So
 * every reader here lists an available OR pending row (the player can see the
 * conversation is waiting) and the panel draws it as waiting. The waiting
 * state keys on `pending` alone, never on `pending_on_member_id` or on the
 * shortfall reason.
 */

/** Whether a row is drawn: the player may say it now, or will once it frees. */
function shown(option: SpeakOption): boolean {
  return (option.available || option.pending) && option.optionId.length > 0;
}

/**
 * The label a waiting line carries: the holder by name when the server named
 * one the client knows, else no name at all. The id is never shown raw — a
 * holder the viewer cannot place is "a roll", not a string of hex.
 */
export function speakLineWaitingLabel(
  option: Pick<SpeakOption, 'pendingOnMemberId'>,
  memberNames: ReadonlyMap<string, string>
): string {
  const holder = option.pendingOnMemberId
    ? memberNames.get(option.pendingOnMemberId)
    : undefined;
  return holder ? `Waiting on ${holder}'s roll` : 'Waiting on a roll';
}

/** The row's target, unwrapped of the empty arm, or null for a malformed row. */
function targetOf(option: SpeakOption): SpeakTarget | null {
  const { target } = option;
  if (target.case === 'memberId' && target.value) {
    return { case: 'memberId', value: target.value };
  }
  if (target.case === 'propId' && target.value) {
    return { case: 'propId', value: target.value };
  }
  return null;
}

/** Whether two targets name the same creature or the same prop. */
export function sameSpeakTarget(
  a: SpeakTarget | null | undefined,
  b: SpeakTarget | null | undefined
): boolean {
  return Boolean(a && b && a.case === b.case && a.value === b.value);
}

/**
 * The lines drawn for one target: that target's AVAILABLE or PENDING rows,
 * in the order the server sent them. A pending row is drawn, never sent.
 */
export function speakLinesFor(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined
): SpeakOption[] {
  if (!declaration || !target) return [];
  return declaration.speakOptions.filter(
    (option) => shown(option) && sameSpeakTarget(targetOf(option), target)
  );
}

/**
 * THINGS TO DO ON A PROP (rpg-project#959): seen, not heard. They ride the
 * Speak row's `interact_options` and are read exactly as its lines are: an
 * available or pending row is drawn, a pending one never sent, a gated one
 * not drawn at all. Only a prop offers them.
 */
function shownThing(option: InteractOption): boolean {
  return (
    (option.available || option.pending) &&
    option.optionId.length > 0 &&
    option.propId.length > 0
  );
}

/** The things to do drawn for one target, in the order the server sent
 * them; none for a creature. */
export function interactThingsFor(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined
): InteractOption[] {
  if (!declaration || target?.case !== 'propId') return [];
  return declaration.interactOptions.filter(
    (option) => shownThing(option) && option.propId === target.value
  );
}

/** The one drawn thing for this prop and option id, or undefined: exactly
 * one, as `speakLine`. */
export function interactThing(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined,
  optionId: string
): InteractOption | undefined {
  const matches = interactThingsFor(declaration, target).filter(
    (option) => option.optionId === optionId
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Whether a target offers anything at all: a line, or a thing to do. */
export function offersAnything(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined
): boolean {
  return (
    speakLinesFor(declaration, target).length > 0 ||
    interactThingsFor(declaration, target).length > 0
  );
}

/**
 * Every target with at least one available or pending line or thing to do,
 * each once, in first-seen order (lines first, then props that only offer
 * things). A target whose every row is gated is not listed: there is nothing
 * the player could say to it or do with it.
 */
export function speakTargetsOf(
  declaration: Declaration | null | undefined
): SpeakTarget[] {
  if (!declaration) return [];
  const targets: SpeakTarget[] = [];
  const add = (target: SpeakTarget | null): void => {
    if (target && !targets.some((seen) => sameSpeakTarget(seen, target)))
      targets.push(target);
  };
  for (const option of declaration.speakOptions)
    if (shown(option)) add(targetOf(option));
  for (const option of declaration.interactOptions)
    if (shownThing(option)) add({ case: 'propId', value: option.propId });
  return targets;
}

/**
 * The one drawn row for this target and option id, or undefined (the caller
 * refuses to send a pending one). Exactly
 * one, never the first of several: a duplicated pair is a producer defect and
 * the client must not guess which of them the player meant.
 */
export function speakLine(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined,
  optionId: string
): SpeakOption | undefined {
  const matches = speakLinesFor(declaration, target).filter(
    (option) => option.optionId === optionId
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * The skill a `Spoke` beat rolled, as the client already names skills
 * everywhere else: "dnd5e:skills:sleight-of-hand" reads "Sleight of Hand".
 *
 * THE ONE SKILL DISPLAY PATH. The content id is read off the ref and handed
 * to `getSkillEnum`/`getSkillDisplay`, so the log and the character sheet
 * cannot disagree on a name. A skill the enum does not know falls back to
 * the ref's own label rather than to "Unknown" — the beat carries the skill
 * opaquely, and an unknown word is still the author's word.
 */
export function speakSkillName(skill: string): string {
  const id = refId(skill) ?? skill;
  const known = getSkillEnum(id);
  return known === Skill.UNSPECIFIED ? refLabel(skill) : getSkillDisplay(known);
}
