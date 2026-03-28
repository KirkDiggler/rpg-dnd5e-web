import { create } from '@bufbuild/protobuf';
import {
  CharacterSchema,
  type Character,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import { mergeCharacterUpdate } from './characterMerge';

/**
 * Helper: create a Character proto with the given overrides.
 */
function makeCharacter(overrides: Partial<Character>): Character {
  return {
    ...create(CharacterSchema, {}),
    ...overrides,
  } as Character;
}

describe('mergeCharacterUpdate', () => {
  it('returns incoming when no existing character', () => {
    const incoming = makeCharacter({
      id: 'char-1',
      currentHitPoints: 10,
    });

    const result = mergeCharacterUpdate(undefined, incoming);
    expect(result).toBe(incoming);
  });

  it('preserves race from existing when incoming has UNSPECIFIED', () => {
    const existing = makeCharacter({
      id: 'char-1',
      race: Race.ELF,
      class: Class.RANGER,
      currentHitPoints: 20,
    });

    const incoming = makeCharacter({
      id: 'char-1',
      race: Race.UNSPECIFIED,
      class: Class.UNSPECIFIED,
      currentHitPoints: 12,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    expect(result.race).toBe(Race.ELF);
    expect(result.class).toBe(Class.RANGER);
    expect(result.currentHitPoints).toBe(12);
  });

  it('preserves appearance from existing when incoming has none', () => {
    const existing = makeCharacter({
      id: 'char-1',
      appearance: {
        skinTone: '#D5A88C',
        primaryColor: '#8B0000',
        secondaryColor: '#FFD700',
      } as Character['appearance'],
    });

    const incoming = makeCharacter({
      id: 'char-1',
      appearance: undefined,
      currentHitPoints: 5,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    expect(result.appearance?.skinTone).toBe('#D5A88C');
    expect(result.appearance?.primaryColor).toBe('#8B0000');
    expect(result.currentHitPoints).toBe(5);
  });

  it('preserves equipmentSlots from existing when incoming has none', () => {
    const existing = makeCharacter({
      id: 'char-1',
      equipmentSlots: {
        mainHand: { equipment: { name: 'Longsword' } },
      } as Character['equipmentSlots'],
    });

    const incoming = makeCharacter({
      id: 'char-1',
      equipmentSlots: undefined,
      currentHitPoints: 8,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    expect(result.equipmentSlots?.mainHand?.equipment?.name).toBe('Longsword');
    expect(result.currentHitPoints).toBe(8);
  });

  it('preserves name from existing when incoming name is empty', () => {
    const existing = makeCharacter({
      id: 'char-1',
      name: 'Aragorn',
    });

    const incoming = makeCharacter({
      id: 'char-1',
      name: '',
      currentHitPoints: 15,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    expect(result.name).toBe('Aragorn');
  });

  it('uses incoming values when they are non-default', () => {
    const existing = makeCharacter({
      id: 'char-1',
      race: Race.HUMAN,
      class: Class.FIGHTER,
      name: 'Oldname',
    });

    const incoming = makeCharacter({
      id: 'char-1',
      race: Race.ELF,
      class: Class.RANGER,
      name: 'Newname',
      currentHitPoints: 25,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    expect(result.race).toBe(Race.ELF);
    expect(result.class).toBe(Class.RANGER);
    expect(result.name).toBe('Newname');
    expect(result.currentHitPoints).toBe(25);
  });

  it('updates combat state fields from incoming', () => {
    const existing = makeCharacter({
      id: 'char-1',
      race: Race.DWARF,
      class: Class.CLERIC,
      currentHitPoints: 30,
      temporaryHitPoints: 5,
    });

    const incoming = makeCharacter({
      id: 'char-1',
      race: Race.UNSPECIFIED,
      class: Class.UNSPECIFIED,
      currentHitPoints: 22,
      temporaryHitPoints: 0,
    });

    const result = mergeCharacterUpdate(existing, incoming);
    // Visual fields preserved
    expect(result.race).toBe(Race.DWARF);
    expect(result.class).toBe(Class.CLERIC);
    // Combat fields updated
    expect(result.currentHitPoints).toBe(22);
    expect(result.temporaryHitPoints).toBe(0);
  });
});
