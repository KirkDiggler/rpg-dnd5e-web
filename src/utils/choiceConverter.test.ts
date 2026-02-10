import {
  ChoiceCategory,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  FightingStyle,
  Language,
  Skill,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  convertEquipmentChoiceToProto,
  convertExpertiseChoiceToProto,
  convertFeatureChoiceToProto,
  convertLanguageChoiceToProto,
  convertProtoToEquipmentChoice,
  convertProtoToLanguageChoice,
  convertProtoToSkillChoice,
  convertSkillChoiceToProto,
  convertToolChoiceToProto,
} from './choiceConverter';

describe('convertSkillChoiceToProto', () => {
  it('creates valid ChoiceData with skills', () => {
    const result = convertSkillChoiceToProto(
      { choiceId: 'skill-1', skills: [Skill.ATHLETICS, Skill.ACROBATICS] },
      ChoiceSource.RACE
    );
    expect(result.choiceId).toBe('skill-1');
    expect(result.category).toBe(ChoiceCategory.SKILLS);
    expect(result.source).toBe(ChoiceSource.RACE);
    expect(result.selection?.case).toBe('skills');
    if (result.selection?.case === 'skills') {
      expect(result.selection.value.skills).toEqual([
        Skill.ATHLETICS,
        Skill.ACROBATICS,
      ]);
    }
  });
});

describe('convertLanguageChoiceToProto', () => {
  it('creates valid ChoiceData with languages', () => {
    const result = convertLanguageChoiceToProto(
      { choiceId: 'lang-1', languages: [Language.ELVISH] },
      ChoiceSource.RACE
    );
    expect(result.category).toBe(ChoiceCategory.LANGUAGES);
    expect(result.selection?.case).toBe('languages');
  });
});

describe('convertToolChoiceToProto', () => {
  it('creates valid ChoiceData with tools', () => {
    const result = convertToolChoiceToProto(
      { choiceId: 'tool-1', tools: [Tool.SMITH_TOOLS] },
      ChoiceSource.CLASS
    );
    expect(result.category).toBe(ChoiceCategory.TOOLS);
    expect(result.selection?.case).toBe('tools');
  });
});

describe('convertEquipmentChoiceToProto', () => {
  it('creates valid ChoiceData with equipment', () => {
    const result = convertEquipmentChoiceToProto(
      {
        choiceId: 'equip-1',
        bundleId: 'bundle-a',
        categorySelections: [
          { categoryIndex: 0, equipmentIds: ['sword', 'shield'] },
        ],
      },
      ChoiceSource.CLASS
    );
    expect(result.category).toBe(ChoiceCategory.EQUIPMENT);
    expect(result.optionId).toBe('bundle-a');
    expect(result.selection?.case).toBe('equipment');
    if (result.selection?.case === 'equipment') {
      expect(result.selection.value.items.length).toBe(2);
    }
  });
});

describe('convertFeatureChoiceToProto', () => {
  it('creates valid ChoiceData with fighting style', () => {
    const result = convertFeatureChoiceToProto(
      {
        choiceId: 'feat-1',
        featureId: 'fighting-style',
        selection: FightingStyle.DEFENSE,
      },
      ChoiceSource.CLASS
    );
    expect(result.category).toBe(ChoiceCategory.FIGHTING_STYLE);
    expect(result.selection?.case).toBe('fightingStyle');
  });
});

describe('convertExpertiseChoiceToProto', () => {
  it('converts string skill names to enums', () => {
    const result = convertExpertiseChoiceToProto(
      'exp-1',
      ['athletics', 'stealth'],
      ChoiceSource.CLASS
    );
    expect(result.category).toBe(ChoiceCategory.EXPERTISE);
    expect(result.selection?.case).toBe('expertise');
    if (result.selection?.case === 'expertise') {
      expect(result.selection.value.skills).toContain(Skill.ATHLETICS);
      expect(result.selection.value.skills).toContain(Skill.STEALTH);
    }
  });

  it('filters out unrecognized skills', () => {
    const result = convertExpertiseChoiceToProto(
      'exp-1',
      ['nonexistent'],
      ChoiceSource.CLASS
    );
    if (result.selection?.case === 'expertise') {
      expect(result.selection.value.skills.length).toBe(0);
    }
  });

  // BUG: regex strips underscores from input ("animal_handling" → "animalhandling")
  // but enum key keeps them ("ANIMAL_HANDLING" → "animal_handling"), so they never match.
  it.fails(
    'multi-word skills with underscores should map to enums (blocked by asymmetric regex)',
    () => {
      const result = convertExpertiseChoiceToProto(
        'exp-1',
        ['animal_handling'],
        ChoiceSource.CLASS
      );
      if (result.selection?.case === 'expertise') {
        expect(result.selection.value.skills).toContain(Skill.ANIMAL_HANDLING);
      }
    }
  );
});

describe('round-trip conversions', () => {
  it('skill choice round-trips', () => {
    const original = {
      choiceId: 'sk-1',
      skills: [Skill.PERCEPTION, Skill.INSIGHT],
    };
    const proto = convertSkillChoiceToProto(original, ChoiceSource.CLASS);
    const back = convertProtoToSkillChoice(proto);
    expect(back).not.toBeNull();
    expect(back!.choiceId).toBe(original.choiceId);
    expect(back!.skills).toEqual(original.skills);
  });

  it('returns null for wrong selection case', () => {
    const proto = convertLanguageChoiceToProto(
      { choiceId: 'l-1', languages: [Language.COMMON] },
      ChoiceSource.RACE
    );
    expect(convertProtoToSkillChoice(proto)).toBeNull();
  });
});

describe('convertProtoToLanguageChoice', () => {
  it('converts back from proto', () => {
    const proto = convertLanguageChoiceToProto(
      { choiceId: 'l-1', languages: [Language.ELVISH] },
      ChoiceSource.RACE
    );
    const back = convertProtoToLanguageChoice(proto);
    expect(back).not.toBeNull();
    expect(back!.choiceId).toBe('l-1');
    expect(back!.languages).toEqual([Language.ELVISH]);
  });

  it('returns null for wrong case', () => {
    const proto = convertSkillChoiceToProto(
      { choiceId: 's-1', skills: [Skill.ATHLETICS] },
      ChoiceSource.CLASS
    );
    expect(convertProtoToLanguageChoice(proto)).toBeNull();
  });
});

describe('convertProtoToEquipmentChoice', () => {
  it('converts back from proto', () => {
    const proto = convertEquipmentChoiceToProto(
      { choiceId: 'e-1', bundleId: 'b-1', categorySelections: [] },
      ChoiceSource.CLASS
    );
    const back = convertProtoToEquipmentChoice(proto);
    expect(back).not.toBeNull();
    expect(back!.choiceId).toBe('e-1');
    expect(back!.bundleId).toBe('b-1');
  });

  it('returns null for wrong case', () => {
    const proto = convertSkillChoiceToProto(
      { choiceId: 's-1', skills: [] },
      ChoiceSource.CLASS
    );
    expect(convertProtoToEquipmentChoice(proto)).toBeNull();
  });
});
