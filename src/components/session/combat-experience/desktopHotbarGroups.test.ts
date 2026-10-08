import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { desktopHotbarGroups } from './desktopHotbarGroups';
const row = (id: string, verb: Verb) =>
  create(DeclarationSchema, { id, verb, available: false });

describe('desktop hotbar groups', () => {
  it('separates general/equipment actions, explicit features, spells and items without minting offers', () => {
    const rows = [
      row('move', Verb.MOVE),
      row('unarmed', Verb.ATTACK),
      row('dodge', Verb.ACTIVATE),
      row('wind', Verb.ACTIVATE),
      row('item', Verb.ACTIVATE),
      row('spell', Verb.CAST),
      row('end', Verb.END_TURN),
    ];
    const groups = desktopHotbarGroups(rows, {
      desktopSectionByDeclarationId: {
        wind: 'features',
        item: 'items',
        imaginary: 'features',
        end: 'items',
      },
    });
    expect(groups.map((g) => g.key)).toEqual([
      'actions',
      'features',
      'spells',
      'items',
    ]);
    expect(groups[0]?.offers.map((o) => o.id)).toEqual([
      'move',
      'unarmed',
      'dodge',
    ]);
    expect(groups[1]?.offers.map((o) => o.id)).toEqual(['wind']);
    expect(groups[3]?.offers.map((o) => o.id)).toEqual(['item']);
    expect(groups.flatMap((g) => g.offers).every((o) => !o.available)).toBe(
      true
    );
    expect(groups.flatMap((g) => g.offers)).toHaveLength(6);
  });
  it('keeps cantrips together using explicit facts, never guessing from names or free costs', () => {
    const groups = desktopHotbarGroups(
      ['level', 'unknown', 'cantrip-1', 'cantrip-2'].map((id) =>
        row(id, Verb.CAST)
      ),
      {
        desktopSpellKindByDeclarationId: {
          level: 'leveled',
          'cantrip-1': 'cantrip',
          'cantrip-2': 'cantrip',
        },
      }
    );
    const spells = groups.find((g) => g.key === 'spells')!;
    expect(
      spells.bands.map((band) => [band.id, band.offers.map((o) => o.id)])
    ).toEqual([
      ['cantrips', ['cantrip-1', 'cantrip-2']],
      ['leveled', ['level']],
      ['other', ['unknown']],
    ]);
  });
  it('omits absent categories even when display hints name them', () => {
    expect(
      desktopHotbarGroups([], {
        desktopSectionByDeclarationId: { missing: 'features' },
        desktopSpellKindByDeclarationId: { missing: 'cantrip' },
      })
    ).toEqual([]);
    expect(
      desktopHotbarGroups([row('move', Verb.MOVE)]).map((group) => group.key)
    ).toEqual(['actions']);
  });
  it('adds spellcasting from new data, not a class/level rule, and retains disabled offers', () => {
    const before = [row('attack', Verb.ATTACK)];
    expect(desktopHotbarGroups(before).map((group) => group.key)).toEqual([
      'actions',
    ]);
    const after = [...before, row('new-spell', Verb.CAST)];
    const groups = desktopHotbarGroups(after);
    expect(groups.map((group) => group.key)).toEqual(['actions', 'spells']);
    expect(groups[1]?.offers[0]).toBe(after[1]);
    expect(groups[1]?.offers[0]?.available).toBe(false);
  });
});
