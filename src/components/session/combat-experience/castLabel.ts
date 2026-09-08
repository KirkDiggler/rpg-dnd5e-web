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
 * THE REF IS THE LAST RESORT, NOT A FALLBACK TO PRETTIFY. An unresolvable
 * ref is shown as itself so it looks unresolved; `'Cast'` covers the case
 * where the server sent no spell at all, which on a VERB_CAST row would be a
 * server bug the player should still be able to see and click past.
 */
export function castLabel(declaration: Declaration): string {
  return declaration.spell?.name || declaration.spell?.ref || 'Cast';
}
