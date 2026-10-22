/**
 * combatBeat — the damage-type word the story and the action tooltip print.
 *
 * The v1 beat-line formatter that lived here read the v1 event stream; it
 * left with the stream (rpg-dnd5e-web#1305). Stories read acts
 * (`combat-experience/describeAct.ts`).
 */
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

const DAMAGE_TYPE_WORD: Partial<Record<DamageType, string>> = {
  [DamageType.ACID]: 'acid',
  [DamageType.BLUDGEONING]: 'bludgeoning',
  [DamageType.COLD]: 'cold',
  [DamageType.FIRE]: 'fire',
  [DamageType.FORCE]: 'force',
  [DamageType.LIGHTNING]: 'lightning',
  [DamageType.NECROTIC]: 'necrotic',
  [DamageType.PIERCING]: 'piercing',
  [DamageType.POISON]: 'poison',
  [DamageType.PSYCHIC]: 'psychic',
  [DamageType.RADIANT]: 'radiant',
  [DamageType.SLASHING]: 'slashing',
  [DamageType.THUNDER]: 'thunder',
};

/** "slashing", "bludgeoning" — a closed set (`DamageType`'s own doc
 * comment: "the UI branches on it"). `''` for an unrecognised/unset
 * value, so a caller building "N <word>" degrades to a bare number
 * rather than "N ". */
export function damageTypeWord(type: DamageType | undefined): string {
  if (type === undefined) return '';
  return DAMAGE_TYPE_WORD[type] ?? '';
}
