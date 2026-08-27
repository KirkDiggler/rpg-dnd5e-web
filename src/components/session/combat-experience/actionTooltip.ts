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
 * So this shows the damage type it does have, and the moment the seam grows a
 * display-only damage string, `damageLine` is the one place that changes.
 */
import {
  Slot,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { damageTypeWord } from '../combatBeat';

export interface ActionTooltipLine {
  label: string;
  value: string;
}

export interface ActionTooltip {
  title: string;
  lines: readonly ActionTooltipLine[];
  /** Provider-authored refusal copy; present iff the offer is unavailable. */
  refusal?: string;
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
  const title =
    declaration.verb === Verb.ATTACK
      ? declaration.attack?.name || 'Attack'
      : declaration.verb === Verb.ACTIVATE
        ? declaration.ability?.name || 'Ability'
        : 'Move';

  const lines: ActionTooltipLine[] = [];

  const damage = damageLine(declaration);
  if (damage) lines.push(damage);

  lines.push({ label: 'Costs', value: slotLabel(declaration.slot) });

  if (declaration.verb === Verb.MOVE && declaration.remaining !== undefined) {
    // Verbatim, per the field's own contract: display this number, do not
    // convert it to cells or price a path with it.
    lines.push({
      label: 'Movement',
      value: `${declaration.remaining} ft left`,
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
    refusal: declaration.available
      ? undefined
      : declaration.why?.text || 'Unavailable',
  };
}

/** Flattened one-line form, for a native `title` or an aria description. */
export function actionTooltipText(tooltip: ActionTooltip): string {
  const parts = tooltip.lines.map((line) => `${line.label}: ${line.value}`);
  if (tooltip.refusal) parts.push(`Unavailable — ${tooltip.refusal}`);
  return [tooltip.title, ...parts].join(' · ');
}
