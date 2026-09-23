import { create } from '@bufbuild/protobuf';
import { CharacterSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DnDSkills } from './DnDSkills';

describe('shared skill proficiency ranks', () => {
  it('doubles only provider-ranked skills and applies that rank to passive perception', () => {
    render(
      <DnDSkills
        character={create(CharacterSchema, {
          abilityScores: { intelligence: 8, wisdom: 14 },
          combatStats: { proficiencyBonus: 2 },
          proficiencies: {
            skills: [Skill.ARCANA, Skill.RELIGION, Skill.PERCEPTION],
            expertiseSkills: [Skill.ARCANA, Skill.PERCEPTION],
          },
        })}
      />
    );
    expect(
      screen.getByText('Arcana (double proficiency)').parentElement?.textContent
    ).toContain('+3');
    expect(screen.getByText('Religion').parentElement?.textContent).toContain(
      '+1'
    );
    expect(
      screen.getByText('Perception (double proficiency)').parentElement
        ?.textContent
    ).toContain('+6');
    expect(
      screen.getByText('Passive Perception').parentElement?.textContent
    ).toContain('16');
  });
  it('keeps missing provider proficiency visibly unknown even for doubled ranks', () => {
    render(
      <DnDSkills
        character={create(CharacterSchema, {
          proficiencies: {
            skills: [Skill.PERCEPTION],
            expertiseSkills: [Skill.PERCEPTION],
          },
        })}
      />
    );
    expect(
      screen.getByText('Perception (double proficiency)').parentElement
        ?.textContent
    ).toContain('—');
    expect(
      screen.getByText('Passive Perception').parentElement?.textContent
    ).toContain('—');
  });
});
