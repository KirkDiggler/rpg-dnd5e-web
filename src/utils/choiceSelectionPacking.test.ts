import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceSchema,
  ChoiceSource,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
  SkillOptionsSchema,
  SpellOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  isChoiceSatisfied,
  packChoiceSelection,
} from './choiceSelectionPacking';

const spellChoice = create(ChoiceSchema, {
  id: 'bard-spells-2',
  description: 'Choose 1 spell',
  chooseCount: 1,
  choiceType: ChoiceCategory.SPELLS,
  options: {
    case: 'spellOptions',
    value: create(SpellOptionsSchema, {
      availableRefs: ['dnd5e:spells:bane', 'dnd5e:spells:cure_wounds'],
    }),
  },
});

const skillChoice = create(ChoiceSchema, {
  id: 'rogue-skills-1',
  chooseCount: 2,
  choiceType: ChoiceCategory.SKILLS,
  options: {
    case: 'skillOptions',
    value: create(SkillOptionsSchema, {
      available: [Skill.ACROBATICS, Skill.STEALTH, Skill.PERCEPTION],
    }),
  },
});

const equipmentChoice = create(ChoiceSchema, {
  id: 'fighter-equipment-1',
  chooseCount: 1,
  choiceType: ChoiceCategory.EQUIPMENT,
  options: {
    case: 'equipmentOptions',
    value: create(EquipmentOptionsSchema, {
      bundles: [
        create(EquipmentBundleSchema, {
          id: 'pack-a',
          categoryChoices: [
            create(EquipmentCategoryChoiceSchema, { choose: 2 }),
            create(EquipmentCategoryChoiceSchema, { choose: 1 }),
          ],
        }),
      ],
    }),
  },
});

describe('packChoiceSelection', () => {
  it('packs spell refs under the spells selection case', () => {
    const packed = packChoiceSelection(
      spellChoice,
      ['dnd5e:spells:cure_wounds'],
      ChoiceSource.CLASS
    );

    expect(packed?.choiceId).toBe('bard-spells-2');
    expect(packed?.category).toBe(ChoiceCategory.SPELLS);
    expect(packed?.source).toBe(ChoiceSource.CLASS);
    expect(packed?.selection.case).toBe('spells');
    expect(
      packed?.selection.case === 'spells'
        ? packed.selection.value.spellRefs
        : null
    ).toEqual(['dnd5e:spells:cure_wounds']);
  });

  it('packs skill enums under the skills selection case', () => {
    const packed = packChoiceSelection(
      skillChoice,
      [Skill.STEALTH, Skill.PERCEPTION],
      ChoiceSource.CLASS
    );

    expect(packed?.selection.case).toBe('skills');
    expect(
      packed?.selection.case === 'skills' ? packed.selection.value.skills : null
    ).toEqual([Skill.STEALTH, Skill.PERCEPTION]);
  });

  // `convertEquipmentChoiceToProto` flattens every category into one `items`
  // list, so the category index itself never reaches the wire and cannot be
  // asserted on the packed message. What IS observable is the ORDER it
  // imposes: entries are bucketed by index and the buckets are emitted in
  // index order, so a selection picked out of order comes back in category
  // order. The index's other job — refusing a half-filled bundle — is
  // `isChoiceSatisfied`'s, and is asserted in its own block below.
  it('emits equipment items in category order, whatever order they were picked in', () => {
    const packed = packChoiceSelection(
      equipmentChoice,
      ['pack-a', 'cat1:shield:Shield', 'cat0:longsword:Longsword'],
      ChoiceSource.CLASS
    );

    expect(packed?.optionId).toBe('pack-a');
    const items =
      packed?.selection.case === 'equipment'
        ? packed.selection.value.items
        : [];
    expect(
      items.map((item) =>
        item.equipment.case === 'otherEquipmentId' ? item.equipment.value : null
      )
    ).toEqual(['longsword', 'shield']);
  });

  it('refuses a category it cannot pack rather than sending an empty selection', () => {
    const featChoice = create(ChoiceSchema, {
      id: 'any-feat-4',
      chooseCount: 1,
      choiceType: ChoiceCategory.FEATS,
    });

    expect(
      packChoiceSelection(featChoice, ['x'], ChoiceSource.CLASS)
    ).toBeNull();
  });
});

describe('isChoiceSatisfied', () => {
  it('reads the count off the requirement, not off the category', () => {
    expect(isChoiceSatisfied(skillChoice, [Skill.STEALTH])).toBe(false);
    expect(
      isChoiceSatisfied(skillChoice, [Skill.STEALTH, Skill.PERCEPTION])
    ).toBe(true);
  });

  it('is unsatisfied when nothing has been selected at all', () => {
    expect(isChoiceSatisfied(spellChoice, undefined)).toBe(false);
    expect(isChoiceSatisfied(spellChoice, [])).toBe(false);
  });

  it('refuses an equipment bundle whose declared categories are half filled', () => {
    expect(
      isChoiceSatisfied(equipmentChoice, [
        'pack-a',
        'cat0:longsword:Longsword',
        'cat1:shield:Shield',
      ])
    ).toBe(false);

    expect(
      isChoiceSatisfied(equipmentChoice, [
        'pack-a',
        'cat0:longsword:Longsword',
        'cat0:dagger:Dagger',
        'cat1:shield:Shield',
      ])
    ).toBe(true);
  });

  it('refuses an equipment selection naming a bundle the choice never offered', () => {
    expect(
      isChoiceSatisfied(equipmentChoice, [
        'pack-z',
        'cat0:longsword:Longsword',
        'cat0:dagger:Dagger',
        'cat1:shield:Shield',
      ])
    ).toBe(false);
  });
});
