import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

interface SkillChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

// Map skills to their ability scores for grouping
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

function getSkillAbility(skillId: string): string {
  return SKILL_ABILITY_MAP[skillId.toLowerCase()] || 'Unknown';
}

export function SkillChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: SkillChoiceProps) {
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
                const isSelected = currentSelections.includes(skill.itemId);
                const isDisabled =
                  !isSelected && currentSelections.length >= choice.chooseCount;

                return (
                  <button
                    key={skill.itemId}
                    type="button"
                    onClick={
                      isDisabled
                        ? undefined
                        : () => handleSkillToggle(skill.itemId)
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
                      transform: 'translateY(0)',
                      boxShadow: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.borderColor =
                          'var(--accent-primary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow =
                          '0 4px 12px rgba(0,0,0,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.borderColor =
                          'var(--border-primary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <span style={{ fontSize: '18px', lineHeight: '1' }}>
                      🎯
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="font-medium">{skill.name}</div>
                      {skill.description && (
                        <div
                          className="text-xs mt-1"
                          style={{
                            color: isSelected
                              ? 'rgba(255,255,255,0.9)'
                              : 'var(--text-muted)',
                          }}
                        >
                          {skill.description}
                        </div>
                      )}
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Show validation message */}
        {currentSelections.length > 0 &&
          currentSelections.length < choice.chooseCount && (
            <div
              className="text-sm p-2 rounded"
              style={{
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              Select {choice.chooseCount - currentSelections.length} more skill
              {choice.chooseCount - currentSelections.length !== 1 ? 's' : ''}
            </div>
          )}

        {currentSelections.length === choice.chooseCount && (
          <div
            className="text-sm p-2 rounded"
            style={{
              color: 'var(--accent-primary)',
              backgroundColor: 'var(--accent-primary)15',
            }}
          >
            ✓ All skill selections complete
          </div>
        )}
      </div>
    );
  }

  // Handle category reference for skills (less common but possible)
  if (choice.optionSet.case === 'categoryReference') {
    const category = choice.optionSet.value;

    return (
      <div className="space-y-3">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
        </div>
        <div
          className="p-4 border rounded"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          <div style={{ color: 'var(--text-muted)' }}>
            Skill category reference: {category.categoryId}
            <br />
            <span className="text-xs">
              This would need to fetch skills from a category API endpoint
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 border rounded"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--card-bg)',
      }}
    >
      <div style={{ color: 'var(--text-primary)' }}>
        Unsupported skill choice structure: {choice.optionSet.case}
      </div>
    </div>
  );
}
