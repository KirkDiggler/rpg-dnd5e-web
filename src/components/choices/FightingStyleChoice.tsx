import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { FightingStyle } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

interface FightingStyleChoiceProps {
  choice: Choice;
  onSelectionChange: (
    choiceId: string,
    selectedStyles: FightingStyle[]
  ) => void;
  currentSelections: FightingStyle[];
}

// Display names and descriptions for fighting styles
const fightingStyleInfo: Record<
  FightingStyle,
  { name: string; description: string }
> = {
  [FightingStyle.UNSPECIFIED]: { name: 'Unknown', description: '' },
  [FightingStyle.ARCHERY]: {
    name: 'Archery',
    description: '+2 to attack rolls with ranged weapons',
  },
  [FightingStyle.DEFENSE]: {
    name: 'Defense',
    description: '+1 to AC while wearing armor',
  },
  [FightingStyle.DUELING]: {
    name: 'Dueling',
    description: '+2 damage when wielding a one-handed melee weapon',
  },
  [FightingStyle.GREAT_WEAPON_FIGHTING]: {
    name: 'Great Weapon Fighting',
    description: 'Reroll 1s and 2s on damage dice with two-handed weapons',
  },
  [FightingStyle.PROTECTION]: {
    name: 'Protection',
    description:
      'Use reaction to impose disadvantage on attacks against allies',
  },
  [FightingStyle.TWO_WEAPON_FIGHTING]: {
    name: 'Two-Weapon Fighting',
    description: 'Add ability modifier to off-hand attack damage',
  },
};

function getFightingStyleDisplayName(style: FightingStyle): string {
  return fightingStyleInfo[style]?.name ?? 'Unknown';
}

function getFightingStyleDescription(style: FightingStyle): string {
  return fightingStyleInfo[style]?.description ?? '';
}

export function FightingStyleChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: FightingStyleChoiceProps) {
  const handleStyleToggle = (style: FightingStyle) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior - fighters choose 1
      onSelectionChange(choice.id, [style]);
    } else {
      // Checkbox behavior - for future classes that might choose multiple
      const newSelections = currentSelections.includes(style)
        ? currentSelections.filter((s) => s !== style)
        : [...currentSelections, style].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit fighting style options
  if (choice.options?.case === 'fightingStyleOptions') {
    const availableStyles = choice.options.value.available;

    return (
      <div style={{ marginTop: '8px' }}>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          {choice.description}
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            (Choose {choice.chooseCount})
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {availableStyles.map((styleEnum) => {
            const isSelected = currentSelections.includes(styleEnum);
            return (
              <label
                key={styleEnum}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-secondary)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)'
                  }`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: isSelected ? 'white' : 'var(--text-primary)',
                }}
              >
                <input
                  type={choice.chooseCount === 1 ? 'radio' : 'checkbox'}
                  checked={isSelected}
                  onChange={() => handleStyleToggle(styleEnum)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '600' }}>
                  {getFightingStyleDisplayName(styleEnum)}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    marginTop: '4px',
                    opacity: isSelected ? 0.9 : 0.7,
                  }}
                >
                  {getFightingStyleDescription(styleEnum)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback if no options available
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
      No fighting style options available for this choice.
    </div>
  );
}
