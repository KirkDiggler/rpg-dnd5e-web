import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Slot,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { buildActionTooltip } from './actionTooltip';
import { castLabel } from './castLabel';

function castDeclaration(id: string) {
  return create(DeclarationSchema, {
    id,
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
  });
}

describe('what a Cast row calls itself', () => {
  it('says the verb, because the declaration carries no spell name yet', () => {
    // THE PINNED CONTRACT, ASSERTED. `Declaration` ends at `reaction = 14`,
    // so two cantrips are two rows that read the same. This expectation is
    // what changes when the repo re-pins past rpg-api-protos#311, and it is
    // deliberately here rather than spread across three surfaces.
    expect(castLabel(castDeclaration('selector.cast.mockery'))).toBe('Cast');
    expect(castLabel(castDeclaration('selector.cast.true-strike'))).toBe(
      'Cast'
    );
  });

  it('is the same answer the tooltip title gives', () => {
    // ONE ANSWER, NOT THREE. The row label, the tooltip title and the armed
    // prompt name the same spell; two of them drifting is the defect this
    // shared helper exists to make impossible.
    const declaration = castDeclaration('selector.cast.mockery');

    expect(buildActionTooltip(declaration).title).toBe(castLabel(declaration));
  });
});
