import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Slot,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  currentExecutableDeclaration,
  organizeDeclarations,
} from './organizedActionPresentation';

const offer = (id: string, verb: Verb, available = true) =>
  create(DeclarationSchema, {
    id,
    verb,
    slot: Slot.ACTION,
    available,
    targetKind: TargetKind.NONE,
  });

describe('organizeDeclarations', () => {
  it('keeps quick and collection membership and order when availability flips', () => {
    const hints = { quickDeclarationIds: ['move', 'attack'] };
    const fresh = [
      offer('move', Verb.MOVE),
      offer('attack', Verb.ATTACK),
      offer('dash', Verb.ACTIVATE),
    ];
    const spent = [
      offer('move', Verb.MOVE),
      offer('attack', Verb.ATTACK, false),
      offer('dash', Verb.ACTIVATE, false),
    ];
    expect(
      organizeDeclarations(fresh, hints).quick.map((item) => item.id)
    ).toEqual(['move', 'attack']);
    expect(
      organizeDeclarations(spent, hints).quick.map((item) => item.id)
    ).toEqual(['move', 'attack']);
    expect(
      organizeDeclarations(spent, hints).sections.abilities.map(
        (item) => item.id
      )
    ).toEqual(['dash']);
  });

  it('resolves an executable id against current declarations, rejecting stale, denied and withdrawn offers', () => {
    const original = [offer('attack', Verb.ATTACK)];
    expect(currentExecutableDeclaration(original, 'attack')?.id).toBe('attack');
    expect(
      currentExecutableDeclaration(
        [offer('attack', Verb.ATTACK, false)],
        'attack'
      )
    ).toBeUndefined();
    expect(currentExecutableDeclaration([], 'attack')).toBeUndefined();
    expect(
      currentExecutableDeclaration([offer('attack', Verb.MOVE)], 'attack')?.verb
    ).toBe(Verb.MOVE);
  });
});
