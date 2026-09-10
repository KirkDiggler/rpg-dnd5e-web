// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Slot,
  SpellRefSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { buildActionTooltip } from './actionTooltip';
import { castLabel } from './castLabel';

function castDeclaration(id: string, spell?: { ref: string; name: string }) {
  return create(DeclarationSchema, {
    id,
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    ...(spell ? { spell: create(SpellRefSchema, spell) } : {}),
  });
}

describe('what a Cast row calls itself', () => {
  it('says the name the spell authored for itself', () => {
    // TWO CANTRIPS, TWO ROWS THAT READ DIFFERENTLY. `Declaration.spell`
    // carries the server-authored display name, which is the whole reason a
    // bard's two Cast rows can be told apart — VERB_CAST alone can no more
    // do that than VERB_ACTIVATE can tell Rage from Second Wind.
    expect(
      castLabel(
        castDeclaration('selector.cast.mockery', {
          ref: 'dnd5e:spells:vicious-mockery',
          name: 'Vicious Mockery',
        })
      )
    ).toBe('Vicious Mockery');
    expect(
      castLabel(
        castDeclaration('selector.cast.true-strike', {
          ref: 'dnd5e:spells:true-strike',
          name: 'True Strike',
        })
      )
    ).toBe('True Strike');
  });

  it('shows the ref when the spell named itself with nothing', () => {
    // UNRESOLVED LOOKS UNRESOLVED. The client does not titleize the ref into
    // something that reads like a name; that derivation is what the ability
    // row refuses to do.
    expect(
      castLabel(
        castDeclaration('selector.cast.mockery', {
          ref: 'dnd5e:spells:vicious-mockery',
          name: '',
        })
      )
    ).toBe('dnd5e:spells:vicious-mockery');
  });

  it('falls back to the verb when the server sent no spell at all', () => {
    // A VERB_CAST row with no spell is a server bug; the player should still
    // be able to see the row and click past it rather than meet a blank.
    expect(castLabel(castDeclaration('selector.cast.mockery'))).toBe('Cast');
  });

  it('is the same answer the tooltip title gives', () => {
    // ONE ANSWER, NOT THREE. The row label, the tooltip title and the armed
    // prompt name the same spell; two of them drifting is the defect this
    // shared helper exists to make impossible.
    const declaration = castDeclaration('selector.cast.mockery', {
      ref: 'dnd5e:spells:vicious-mockery',
      name: 'Vicious Mockery',
    });

    expect(buildActionTooltip(declaration).title).toBe('Vicious Mockery');
    expect(buildActionTooltip(declaration).title).toBe(castLabel(declaration));
  });
});
