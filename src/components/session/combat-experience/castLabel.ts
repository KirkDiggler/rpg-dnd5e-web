import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * What a Cast row calls itself.
 *
 * ONE PLACE, BECAUSE THREE SURFACES ASK THE SAME QUESTION. The dock's row
 * label, its tooltip title and the armed-target prompt must all name the same
 * spell, and three copies of that answer are three chances for two of them to
 * disagree — the shape `AttackRef.name` and `AbilityRef.name` avoid by being
 * read straight off the declaration at each site.
 *
 * THE NAME IS THE SERVER'S, NEVER DERIVED FROM A REF. `SpellRef` carries a
 * display name authored by the spell itself for exactly this reason: a client
 * that mapped `dnd5e:spells:vicious-mockery` to "Vicious Mockery" would go
 * stale the first time a spell was renamed, which is why the ability row
 * refuses to keep such a table (design rpg-project#405).
 *
 * TODAY IT RETURNS THE VERB, AND THAT IS THE HONEST ANSWER. `Declaration` in
 * the pinned protos has no spell field — it ends at `reaction = 14` — so
 * there is nothing here to name a row with, and a bard's two cantrips read as
 * two rows both saying "Cast". `SpellRef spell = 15` is landing
 * (rpg-api-protos#311); when this repo re-pins to the generated sha, the body
 * below becomes `declaration.spell?.name || declaration.spell?.ref || 'Cast'`
 * and no call site changes.
 */
export function castLabel(declaration: Declaration): string {
  void declaration;
  return 'Cast';
}
