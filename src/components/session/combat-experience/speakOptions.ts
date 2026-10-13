import type { SpeakTarget } from '@/api/useSessionSpeak';
import { getSkillDisplay, getSkillEnum } from '@/utils/enumDisplay';
import { refId, refLabel } from '@/utils/refs';
import type {
  Declaration,
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
 */

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
 * The lines the actor may say to one target: that target's AVAILABLE rows,
 * in the order the server sent them.
 */
export function speakLinesFor(
  declaration: Declaration | null | undefined,
  target: SpeakTarget | null | undefined
): SpeakOption[] {
  if (!declaration || !target) return [];
  return declaration.speakOptions.filter(
    (option) =>
      option.available &&
      option.optionId.length > 0 &&
      sameSpeakTarget(targetOf(option), target)
  );
}

/**
 * Every target with at least one available line, each once, in first-seen
 * order. A target whose every line is gated is not listed: there is nothing
 * the player could say to it.
 */
export function speakTargetsOf(
  declaration: Declaration | null | undefined
): SpeakTarget[] {
  if (!declaration) return [];
  const targets: SpeakTarget[] = [];
  for (const option of declaration.speakOptions) {
    if (!option.available || option.optionId.length === 0) continue;
    const target = targetOf(option);
    if (!target) continue;
    if (!targets.some((seen) => sameSpeakTarget(seen, target))) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * The one available row for this target and option id, or undefined. Exactly
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
