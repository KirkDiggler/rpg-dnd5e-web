import { TraitBadgeGroup } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Language,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useContext, useState } from 'react';
import { CharacterDraftContext } from '../CharacterDraftContextDef';

const SAMPLE_SKILLS = [
  {
    id: 'acrobatics',
    name: 'Acrobatics',
    ability: 'dexterity',
    source: 'available',
  },
  {
    id: 'athletics',
    name: 'Athletics',
    ability: 'strength',
    source: 'available',
  },
  { id: 'perception', name: 'Perception', ability: 'wisdom', source: 'racial' },
  { id: 'stealth', name: 'Stealth', ability: 'dexterity', source: 'available' },
  {
    id: 'investigation',
    name: 'Investigation',
    ability: 'intelligence',
    source: 'class',
  },
  { id: 'insight', name: 'Insight', ability: 'wisdom', source: 'available' },
];

const SAMPLE_BACKGROUNDS = [
  {
    id: 'noble',
    name: 'Noble',
    description: 'You understand wealth, power, and privilege.',
  },
  {
    id: 'criminal',
    name: 'Criminal',
    description: 'You have a criminal past, or current.',
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    description: 'You come from humble origins.',
  },
];

export function SkillsBackgroundSection() {
  const { selectedChoices, setSelectedChoice } = useCharacterBuilder();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const context = useContext(CharacterDraftContext);
  if (!context)
    throw new Error(
      'SkillsBackgroundSection must be used within CharacterDraftProvider'
    );

  const { classChoices, raceChoices } = context;

  // Get proficiencies from character choices (now ChoiceData arrays)
  const classChoiceData = classChoices || [];
  const raceChoiceData = raceChoices || [];

  // Extract skills, tools, and languages from ChoiceData
  const classSkillChoices: number[] = [];
  const classToolChoices: string[] = [];
  const classFeatChoices: string[] = [];
  const raceSkillChoices: number[] = [];
  const raceLanguageChoices: number[] = [];

  // Process class choices
  classChoiceData.forEach((choice) => {
    if (
      choice.category === ChoiceCategory.SKILLS &&
      choice.selection?.case === 'skills'
    ) {
      classSkillChoices.push(...(choice.selection.value.skills || []));
    } else if (choice.category === ChoiceCategory.TOOLS) {
      // TODO: Handle tool choices when implemented
    }
    // TODO: Handle feat choices
  });

  // Process race choices
  raceChoiceData.forEach((choice) => {
    if (
      choice.category === ChoiceCategory.SKILLS &&
      choice.selection?.case === 'skills'
    ) {
      raceSkillChoices.push(...(choice.selection.value.skills || []));
    } else if (
      choice.category === ChoiceCategory.LANGUAGES &&
      choice.selection?.case === 'languages'
    ) {
      raceLanguageChoices.push(...(choice.selection.value.languages || []));
    }
  });

  const selectedBackground = SAMPLE_BACKGROUNDS.find(
    (b) => b.id === selectedChoices.background
  );

  const handleSkillToggle = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  };

  const handleBackgroundSelect = (backgroundId: string) => {
    setSelectedChoice('background', backgroundId);
  };

  // For now, still use sample skills for available options
  const skillsBySource = {
    racial: SAMPLE_SKILLS.filter((s) => s.source === 'racial'),
    class: SAMPLE_SKILLS.filter((s) => s.source === 'class'),
    available: SAMPLE_SKILLS.filter((s) => s.source === 'available'),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skills Section */}
        <div className="space-y-4">
          <h2
            className="text-xl font-bold font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            Skills & Proficiencies
          </h2>

          <TraitBadgeGroup
            title="Racial Proficiencies"
            traits={raceSkillChoices.map((skillEnum, index) => ({
              id: `race-skill-${index}`,
              name: Skill[skillEnum] || `Skill ${skillEnum}`,
              type: 'racial' as const,
              icon: TraitIcons.racial,
              description: 'Racial proficiency',
            }))}
          />

          <TraitBadgeGroup
            title="Class Proficiencies"
            traits={classSkillChoices.map((skillEnum, index) => ({
              id: `class-skill-${index}`,
              name: Skill[skillEnum] || `Skill ${skillEnum}`,
              type: 'class' as const,
              icon: TraitIcons.class,
              description: 'Class proficiency',
            }))}
          />

          {classToolChoices.length > 0 && (
            <TraitBadgeGroup
              title="Tool Proficiencies"
              traits={classToolChoices.map((toolId, index) => ({
                id: `class-tool-${index}`,
                name: toolId
                  .replace('tool:-', '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase()),
                type: 'class' as const,
                icon: '🔧',
                description: 'Tool proficiency',
              }))}
            />
          )}

          {classFeatChoices.length > 0 && (
            <TraitBadgeGroup
              title="Feats"
              traits={classFeatChoices.map((featId, index) => ({
                id: `class-feat-${index}`,
                name: featId
                  .replace('feat:-', '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase()),
                type: 'class' as const,
                icon: '⭐',
                description: 'Feat',
              }))}
            />
          )}

          <div className="space-y-2">
            <h4
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Choose Additional Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {skillsBySource.available.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleSkillToggle(skill.id)}
                  className={`px-3 py-1 rounded-full text-sm border transition-all ${
                    selectedSkills.includes(skill.id)
                      ? 'bg-accent text-white border-accent'
                      : 'border-border hover:border-accent'
                  }`}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Background Section */}
        <div className="space-y-4">
          <h2
            className="text-xl font-bold font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            Background & Languages
          </h2>

          {raceLanguageChoices.length > 0 && (
            <TraitBadgeGroup
              title="Languages"
              traits={raceLanguageChoices.map((langEnum, index) => ({
                id: `race-lang-${index}`,
                name: Language[langEnum] || `Language ${langEnum}`,
                type: 'racial' as const,
                icon: '💬',
                description: 'Language',
              }))}
            />
          )}

          {selectedBackground ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 rounded-lg border-2"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--accent-primary)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="text-2xl">🛡️</div>
                <div>
                  <h3
                    className="font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {selectedBackground.name}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {selectedBackground.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedChoice('background', null)}
                className="text-xs text-muted hover:text-accent"
              >
                Click to change
              </button>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {SAMPLE_BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  onClick={() => handleBackgroundSelect(background.id)}
                  className="w-full p-3 text-left rounded-lg border-2 border-dashed hover:border-solid transition-all"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">🛡️</div>
                    <div>
                      <h4
                        className="font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {background.name}
                      </h4>
                      <p
                        className="text-sm"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {background.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
