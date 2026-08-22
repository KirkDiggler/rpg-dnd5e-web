/**
 * turnShapeText — the non-visual half of `Shape.tsx`: the shape ordering
 * and declaration-row text formatting shared between `TurnHud.tsx` and
 * `CombatPanel.tsx` (rpg-dnd5e-web#762 "grow the HUD into a panel" — the
 * same three shapes are now one row inside a bigger panel, not a second
 * visual language). Split into its own file (rather than living beside
 * `Shape` in one module) because a `.tsx` file that exports both a
 * component and plain values breaks React Fast Refresh
 * (`react-refresh/only-export-components`) — this file has no JSX at all,
 * `Shape.tsx` has nothing else.
 */
import { Verb } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { TurnHudDeclarationRow, TurnHudSlotName } from './turnHud';

export const SHAPE_ORDER: TurnHudSlotName[] = ['action', 'bonus', 'reaction'];

// Only VERB_ATTACK exists on the wire today (Verb's own doc comment: "one
// value because v1 has exactly one gated verb"). A verb this client
// doesn't recognise (a future addition, or VERB_UNSPECIFIED) falls back
// to its raw number rather than rendering blank or throwing — the same
// "deliver it, don't drop it" spirit `EventKind.UNKNOWN` keeps on the
// stream side.
const VERB_LABEL: Partial<Record<Verb, string>> = {
  [Verb.ATTACK]: 'Attack',
};

export function verbLabel(verb: Verb): string {
  return VERB_LABEL[verb] ?? `Verb ${verb}`;
}

/** "Attack — ready" when affordable, "Attack — action: 1 needed, 0 left"
 * otherwise — `shortfall` is already the server's own refusal wording
 * (`Declaration.shortfall`'s own doc comment), so this never invents
 * currency language of its own. */
export function declarationRowText(row: TurnHudDeclarationRow): string {
  const label = verbLabel(row.verb);
  return row.affordable ? `${label} — ready` : `${label} — ${row.shortfall}`;
}
