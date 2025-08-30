import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Activity,
  BookOpen,
  Brain,
  Check,
  Eye,
  Heart,
  Sparkles,
  Star,
} from 'lucide-react';
import { useState } from 'react';

interface ExpertiseChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedSkills: string[]) => void;
  currentSelections: string[];
}

// Map skills to their ability scores for grouping (same as SkillChoice)
const SKILL_ABILITY_MAP: Record<string, string> = {
  acrobatics: 'Dexterity',
  'animal-handling': 'Wisdom',
  arcana: 'Intelligence',
  athletics: 'Strength',
  deception: 'Charisma',
  history: 'Intelligence',
  insight: 'Wisdom',
  intimidation: 'Charisma',
  investigation: 'Intelligence',
  medicine: 'Wisdom',
  nature: 'Intelligence',
  perception: 'Wisdom',
  performance: 'Charisma',
  persuasion: 'Charisma',
  religion: 'Intelligence',
  'sleight-of-hand': 'Dexterity',
  stealth: 'Dexterity',
  survival: 'Wisdom',
};

// Get icon for ability score
function getAbilityIcon(ability: string): React.ReactNode {
  switch (ability.toLowerCase()) {
    case 'strength':
      return <Activity className="w-4 h-4" />;
    case 'dexterity':
      return <Sparkles className="w-4 h-4" />;
    case 'intelligence':
      return <Brain className="w-4 h-4" />;
    case 'wisdom':
      return <Eye className="w-4 h-4" />;
    case 'charisma':
      return <Heart className="w-4 h-4" />;
    case 'constitution':
      return <BookOpen className="w-4 h-4" />;
    default:
      return <BookOpen className="w-4 h-4" />;
  }
}

// Get ability color
function getAbilityColor(ability: string): string {
  switch (ability.toLowerCase()) {
    case 'strength':
      return '#ef4444'; // red
    case 'dexterity':
      return '#22c55e'; // green
    case 'intelligence':
      return '#3b82f6'; // blue
    case 'wisdom':
      return '#a855f7'; // purple
    case 'charisma':
      return '#f59e0b'; // amber
    case 'constitution':
      return '#ec4899'; // pink
    default:
      return '#6b7280'; // gray
  }
}

function getSkillAbility(skillId: string): string {
  return SKILL_ABILITY_MAP[skillId.toLowerCase()] || 'Unknown';
}

export function ExpertiseChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: ExpertiseChoiceProps) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  const handleSkillToggle = (skillId: string) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [skillId]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(skillId)
        ? currentSelections.filter((s) => s !== skillId)
        : [...currentSelections, skillId].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit skill options
  if (choice.optionSet.case === 'explicitOptions') {
    const options = choice.optionSet.value.options;

    // Group skills by ability score
    const skillsByAbility: Record<
      string,
      Array<{
        index: number;
        skill: { itemId: string; name: string; description?: string };
      }>
    > = {};

    options.forEach((option, index) => {
      if (option.optionType.case === 'item') {
        const skill = option.optionType.value;
        const ability = getSkillAbility(skill.itemId);

        if (!skillsByAbility[ability]) {
          skillsByAbility[ability] = [];
        }
        skillsByAbility[ability].push({ index, skill });
      }
    });

    // Sort abilities by standard order
    const abilityOrder = [
      'Strength',
      'Dexterity',
      'Constitution',
      'Intelligence',
      'Wisdom',
      'Charisma',
    ];
    const sortedAbilities = Object.keys(skillsByAbility).sort(
      (a, b) => abilityOrder.indexOf(a) - abilityOrder.indexOf(b)
    );

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <div className="relative">
            <BookOpen
              className="w-5 h-5 mt-0.5"
              style={{ color: 'var(--accent-primary)' }}
            />
            <Star
              className="w-3 h-3 absolute -top-1 -right-1"
              style={{ color: '#fbbf24' }}
              fill="#fbbf24"
            />
          </div>
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Expertise Selection
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description ||
                `Choose ${choice.chooseCount} skill${choice.chooseCount > 1 ? 's' : ''} for expertise (double proficiency bonus)`}
            </p>
            {choice.chooseCount > 1 && (
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="text-xs px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'rgba(251, 191, 36, 0.2)',
                    color: '#f59e0b',
                  }}
                >
                  <Star className="w-3 h-3 inline mr-1" />
                  {currentSelections.length} / {choice.chooseCount} selected
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {sortedAbilities.map((ability) => (
            <div key={ability}>
              <div
                className="flex items-center gap-2 mb-2 pb-1"
                style={{ borderBottom: `1px solid var(--border-primary)` }}
              >
                <div
                  className="p-1 rounded"
                  style={{
                    backgroundColor: `${getAbilityColor(ability)}20`,
                    color: getAbilityColor(ability),
                  }}
                >
                  {getAbilityIcon(ability)}
                </div>
                <span
                  className="text-sm font-medium uppercase tracking-wide"
                  style={{ color: getAbilityColor(ability) }}
                >
                  {ability}
                </span>
              </div>

              <div className="grid gap-1 ml-6">
                {skillsByAbility[ability].map(({ index, skill }) => {
                  const isSelected = currentSelections.includes(skill.itemId);
                  const isDisabled =
                    !isSelected &&
                    currentSelections.length >= choice.chooseCount;
                  const isHovered = hoveredSkill === skill.itemId;

                  return (
                    <button
                      key={`${skill.itemId}_${index}`}
                      onClick={() =>
                        !isDisabled && handleSkillToggle(skill.itemId)
                      }
                      onMouseEnter={() => setHoveredSkill(skill.itemId)}
                      onMouseLeave={() => setHoveredSkill(null)}
                      disabled={isDisabled}
                      className="group text-left transition-all duration-200"
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: `2px solid ${
                          isSelected
                            ? '#f59e0b'
                            : isHovered && !isDisabled
                              ? '#fbbf24'
                              : 'transparent'
                        }`,
                        backgroundColor: isSelected
                          ? 'rgba(251, 191, 36, 0.1)'
                          : isHovered && !isDisabled
                            ? 'rgba(251, 191, 36, 0.05)'
                            : 'transparent',
                        opacity: isDisabled ? 0.5 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        transform:
                          isHovered && !isDisabled
                            ? 'translateX(4px)'
                            : 'translateX(0)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 relative"
                            style={{
                              borderColor: isSelected
                                ? '#f59e0b'
                                : isHovered && !isDisabled
                                  ? '#fbbf24'
                                  : 'var(--border-primary)',
                              backgroundColor: isSelected
                                ? '#f59e0b'
                                : 'transparent',
                            }}
                          >
                            {isSelected && (
                              <>
                                <Check
                                  className="w-3 h-3"
                                  style={{ color: 'white' }}
                                />
                                <Star
                                  className="w-2 h-2 absolute -top-1 -right-1"
                                  style={{ color: '#fbbf24' }}
                                  fill="#fbbf24"
                                />
                              </>
                            )}
                          </div>
                          <div>
                            <div
                              className="font-medium flex items-center gap-1"
                              style={{
                                color: isSelected
                                  ? '#f59e0b'
                                  : 'var(--text-primary)',
                              }}
                            >
                              {skill.name}
                              {isSelected && (
                                <Star
                                  className="w-3 h-3"
                                  style={{ color: '#fbbf24' }}
                                  fill="#fbbf24"
                                />
                              )}
                            </div>
                            {isSelected && (
                              <div
                                className="text-xs mt-0.5 font-medium"
                                style={{ color: '#f59e0b' }}
                              >
                                Double proficiency bonus
                              </div>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div
                            className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
                            style={{
                              backgroundColor: '#f59e0b',
                              color: 'white',
                            }}
                          >
                            <Star className="w-3 h-3" />
                            Expertise
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Handle reference options
  if (choice.optionSet.case === 'categoryReference') {
    const refOptions = choice.optionSet.value;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <div className="relative">
            <BookOpen
              className="w-5 h-5 mt-0.5"
              style={{ color: 'var(--accent-primary)' }}
            />
            <Star
              className="w-3 h-3 absolute -top-1 -right-1"
              style={{ color: '#fbbf24' }}
              fill="#fbbf24"
            />
          </div>
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Expertise References
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description || 'Reference options available'}
            </p>
          </div>
        </div>
        <div
          className="text-sm p-3 rounded-lg"
          style={{
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-muted)',
          }}
        >
          Category: {refOptions.categoryId}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
      Unsupported expertise choice type: {choice.optionSet.case}
    </div>
  );
}
