import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { getSkillDisplay } from '../../utils/enumDisplay';

interface SkillChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedSkills: Skill[]) => void;
  currentSelections: Skill[];
}

// Map skills to their ability scores for grouping
const SKILL_ABILITY_MAP: Record<Skill, string> = {
  [Skill.UNSPECIFIED]: 'Unknown',
  [Skill.ACROBATICS]: 'Dexterity',
  [Skill.ANIMAL_HANDLING]: 'Wisdom',
  [Skill.ARCANA]: 'Intelligence',
  [Skill.ATHLETICS]: 'Strength',
  [Skill.DECEPTION]: 'Charisma',
  [Skill.HISTORY]: 'Intelligence',
  [Skill.INSIGHT]: 'Wisdom',
  [Skill.INTIMIDATION]: 'Charisma',
  [Skill.INVESTIGATION]: 'Intelligence',
  [Skill.MEDICINE]: 'Wisdom',
  [Skill.NATURE]: 'Intelligence',
  [Skill.PERCEPTION]: 'Wisdom',
  [Skill.PERFORMANCE]: 'Charisma',
  [Skill.PERSUASION]: 'Charisma',
  [Skill.RELIGION]: 'Intelligence',
  [Skill.SLEIGHT_OF_HAND]: 'Dexterity',
  [Skill.STEALTH]: 'Dexterity',
  [Skill.SURVIVAL]: 'Wisdom',
};

function getSkillAbility(skill: Skill): string {
  return SKILL_ABILITY_MAP[skill] || 'Unknown';
}

export function SkillChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: SkillChoiceProps) {
  const handleSkillToggle = (skill: Skill) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [skill]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(skill)
        ? currentSelections.filter((s) => s !== skill)
        : [...currentSelections, skill].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Get available skills from choice options
  if (choice.options?.case !== 'skillOptions') {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600">Invalid skill choice options</p>
      </div>
    );
  }

  const availableSkills = choice.options.value.available;

  // Group skills by ability score
  const skillsByAbility: Record<string, Skill[]> = {};

  availableSkills.forEach((skill) => {
    if (skill === Skill.UNSPECIFIED) return;

    const ability = getSkillAbility(skill);
    if (!skillsByAbility[ability]) {
      skillsByAbility[ability] = [];
    }
    skillsByAbility[ability].push(skill);
  });

  return (
    <div className="space-y-4">
      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
        {choice.description}
        <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
          ({currentSelections.length}/{choice.chooseCount} selected)
        </span>
      </div>

      {Object.entries(skillsByAbility).map(([ability, skills]) => (
        <div
          key={ability}
          className="border rounded-lg p-4"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          <div
            className="font-medium mb-3 text-sm"
            style={{ color: 'var(--accent-primary)' }}
          >
            {ability} Skills
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {skills.map((skill) => {
              const isSelected = currentSelections.includes(skill);
              const isDisabled =
                !isSelected && currentSelections.length >= choice.chooseCount;

              return (
                <button
                  key={skill}
                  type="button"
                  onClick={
                    isDisabled ? undefined : () => handleSkillToggle(skill)
                  }
                  disabled={isDisabled}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: isSelected
                      ? 'var(--accent-primary)'
                      : 'var(--card-bg)',
                    borderRadius: '6px',
                    border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    fontSize: '13px',
                    color: isSelected ? 'white' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    outline: 'none',
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                  className="hover:transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: choice.chooseCount === 1 ? '50%' : '4px',
                      border: `2px solid ${isSelected ? 'white' : 'var(--border-primary)'}`,
                      backgroundColor: isSelected
                        ? 'white'
                        : 'var(--bg-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius:
                            choice.chooseCount === 1 ? '50%' : '2px',
                          backgroundColor: 'var(--accent-primary)',
                        }}
                      />
                    )}
                  </div>
                  <span>{getSkillDisplay(skill)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
