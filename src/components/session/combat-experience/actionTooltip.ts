/**
 * actionTooltip — what the action bar says about an offer on hover.
 *
 * Pure projection of the Declaration the server sent. Every line is a field
 * read verbatim; nothing here computes a rule, a cost, or a refusal of its
 * own. The refusal line in particular is `why.text` as authored — the server
 * already writes "movement: 20 ft needed, 15 ft left", and a client composing
 * its own version of that sentence is how the two drift apart.
 *
 * # Damage dice are NOT here, and that is a wire gap, not an oversight
 *
 * Kirk asked for "what damage the weapon does". The session `AttackRef`
 * carries ref, name and damage TYPE and, in its own words, "nothing of its
 * arithmetic" — so "1d8+3" is not on this seam at all. `WeaponData.damageDice`
 * exists, but in the character/equipment domain (`dnd5e.api.v1alpha1`), which
 * the combat panel does not load and which would be a second, unversioned
 * source of truth about the weapon being swung.
 *
 * So this shows the damage type it does have. Carrying the number across the
 * seam is rpg-project#307 (deferred, deliberately): when that lands,
 * `damageLine` is the one place that changes.
 *
 * # Effect rows are drawn, never recognised (rpg-project#520)
 *
 * `Declaration.effects` lists the acting member's effects bearing on this
 * action, each with the rule's own answer. Every field is shown as written:
 * nothing here knows which effect a row is (no branch on `ref` or `name`, no
 * ref-to-name or description table), sums a `benefit`, or lets a row touch
 * `available`. A target's answers ride its candidate and replace state, reason
 * and benefit for the row with the same `id`; the declaration keeps the
 * description and participation.
 */
import {
  EffectParticipation,
  EffectState,
  Slot,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { damageTypeWord } from '../combatBeat';
import { castLabel } from './castLabel';

export interface ActionTooltipLine {
  label: string;
  value: string;
}

/**
 * How a row reads. `later` is an applying later choice: available after the
 * roll, never already added. `unknown` is an UNSPECIFIED (or unrecognised)
 * state — a producer defect, shown as such rather than hidden or guessed.
 */
export type EffectTone =
  | 'applies'
  | 'later'
  | 'does-not-apply'
  | 'depends'
  | 'unavailable'
  | 'unknown';

export interface ActionEffectLine {
  id: string;
  name: string;
  description: string;
  state: EffectState;
  tone: EffectTone;
  stateWord: string;
  reason: string;
  /** Rule-authored, verbatim; empty when the rule wrote none. */
  benefit: string;
}

export interface ActionTooltip {
  title: string;
  lines: readonly ActionTooltipLine[];
  /** The declaration's own rows, before any target is considered. */
  effects: readonly ActionEffectLine[];
  /** Provider-authored refusal copy; present iff the offer is unavailable. */
  refusal?: string;
}

export function effectStateWord(state: EffectState): string {
  switch (state) {
    case EffectState.APPLIES:
      return 'Applies';
    case EffectState.DOES_NOT_APPLY:
      return 'Does not apply';
    case EffectState.DEPENDS:
      return 'Depends';
    case EffectState.UNAVAILABLE:
      return 'Unavailable';
    default:
      return 'State unknown';
  }
}

function effectTone(
  state: EffectState,
  participation: EffectParticipation
): EffectTone {
  switch (state) {
    case EffectState.APPLIES:
      return participation === EffectParticipation.LATER_CHOICE
        ? 'later'
        : 'applies';
    case EffectState.DOES_NOT_APPLY:
      return 'does-not-apply';
    case EffectState.DEPENDS:
      return 'depends';
    case EffectState.UNAVAILABLE:
      return 'unavailable';
    default:
      return 'unknown';
  }
}

/**
 * The rows bearing on `declaration`, with `candidateMember`'s answers laid
 * over the declaration's by `id`. An answer whose id names no declaration row
 * is ignored; a candidate with no answer of its own reads the declaration's.
 */
export function effectLinesFor(
  declaration: Declaration,
  candidateMember?: string | null
): ActionEffectLine[] {
  const candidate = candidateMember
    ? declaration.candidates.find((item) => item.member === candidateMember)
    : undefined;
  const answers = new Map(
    (candidate?.effects ?? []).map((answer) => [answer.id, answer])
  );
  return (declaration.effects ?? []).map((row) => {
    const answer = answers.get(row.id);
    const state = answer ? answer.state : row.state;
    const tone = effectTone(state, row.participation);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      state,
      tone,
      stateWord:
        tone === 'later' ? 'Available after the roll' : effectStateWord(state),
      reason: answer ? answer.reason : row.reason,
      benefit: answer ? answer.benefit : row.benefit,
    };
  });
}

export function slotLabel(slot: Slot): string {
  switch (slot) {
    case Slot.ACTION:
      return 'Action';
    case Slot.BONUS:
      return 'Bonus action';
    case Slot.REACTION:
      return 'Reaction';
    case Slot.NONE:
      return 'No turn slot';
    default:
      return 'Provider slot unavailable';
  }
}

/**
 * The damage the offer deals, as far as this seam knows it. Today that is the
 * TYPE only; see this module's own doc comment for why the dice are absent.
 */
function damageLine(declaration: Declaration): ActionTooltipLine | null {
  if (declaration.verb !== Verb.ATTACK) return null;
  const word = damageTypeWord(declaration.attack?.damageType);
  if (!word) return null;
  return { label: 'Damage', value: word };
}

export function buildActionTooltip(declaration: Declaration): ActionTooltip {
  // THE SEVENTH HAND-WRITTEN VERB SITE, which rpg-dnd5e-web#1104 did not
  // enumerate and the walk found: a social verb fell through to the 'Move'
  // default here exactly as it did in the two label functions, so the dock
  // drew a row called "Persuade" whose own tooltip was titled "Move".
  //
  // Both social verbs name themselves, for the label functions' reason: the
  // server compiles no action definition for either, so there is no authored
  // title to prefer.
  const title =
    declaration.verb === Verb.ATTACK
      ? declaration.attack?.name || 'Attack'
      : declaration.verb === Verb.ACTIVATE
        ? declaration.ability?.name || 'Ability'
        : declaration.verb === Verb.DEATH_SAVE
          ? declaration.deathSave?.name || 'Death Save'
          : declaration.verb === Verb.CAST
            ? castLabel(declaration)
            : declaration.verb === Verb.INTIMIDATE
              ? 'Intimidate'
              : declaration.verb === Verb.PERSUADE
                ? 'Persuade'
                : 'Move';

  const lines: ActionTooltipLine[] = [];

  const damage = damageLine(declaration);
  if (damage) lines.push(damage);

  const providerCosts = (declaration.cost ?? [])
    .filter((component) => component.needed > 0 && component.label)
    .map((component) => `${component.needed} ${component.label}`);
  // A COST LINE ONLY WHEN THERE IS A COST (rpg-project#457 R3). A row the
  // server sent at `Slot.NONE` with nothing else to spend costs nothing, and
  // "Costs: No turn slot" is a sentence about a turn economy — which on the
  // world clock does not exist. The badge is already suppressed for the same
  // reason; a tooltip that still said it would just move the wrong claim one
  // hover away, which is what the walk found.
  //
  // THE SLOT IS THE TEST, NOT THE CLOCK, so a death save keeps its "No turn
  // slot" line on the turn clock where that IS a statement, as long as
  // anything else is priced — and a row that arrives priced anywhere keeps
  // its line whole.
  const free =
    declaration.slot === Slot.NONE || declaration.slot === Slot.UNSPECIFIED;
  if (!free || providerCosts.length > 0) {
    lines.push({
      label: 'Costs',
      value: free
        ? providerCosts.join(', ')
        : [slotLabel(declaration.slot), ...providerCosts].join(', '),
    });
  }

  if (declaration.verb === Verb.MOVE && declaration.remaining !== undefined) {
    // Verbatim, per the field's own contract: display this number, do not
    // convert it to cells or price a path with it.
    lines.push({
      label: 'Movement',
      value: `${declaration.remaining} ft left`,
    });
  }

  if (declaration.verb === Verb.CAST && declaration.maxTargets > 0) {
    lines.push({
      label: 'Targets',
      value:
        declaration.minTargets === declaration.maxTargets
          ? `${declaration.minTargets}`
          : `${declaration.minTargets}–${declaration.maxTargets}`,
    });
  }

  // How many things this offer can actually be pointed at. The server owns the
  // candidate universe; this only counts what it sent.
  if (declaration.candidates.length > 0) {
    lines.push({
      label: 'In reach',
      value:
        declaration.candidates.length === 1
          ? '1 target'
          : `${declaration.candidates.length} targets`,
    });
  }

  return {
    title,
    lines,
    effects: effectLinesFor(declaration),
    refusal: declaration.available
      ? undefined
      : declaration.why?.text || 'Unavailable',
  };
}

/** Flattened one-line form, for a native `title` or an aria description. */
export function actionTooltipText(tooltip: ActionTooltip): string {
  const parts = tooltip.lines.map((line) => `${line.label}: ${line.value}`);
  for (const effect of tooltip.effects) {
    parts.push(
      `${effect.name}: ${effect.stateWord}${effect.reason ? ` — ${effect.reason}` : ''}${effect.benefit ? ` (${effect.benefit})` : ''}`
    );
  }
  if (tooltip.refusal) parts.push(`Unavailable — ${tooltip.refusal}`);
  return [tooltip.title, ...parts].join(' · ');
}
