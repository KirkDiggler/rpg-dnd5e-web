import type { EquipmentChoice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';

interface EquipmentChoiceSelectorProps {
  choices: EquipmentChoice[];
  selected: Record<number, string>; // choiceIndex -> selected option or specific item
  onSelectionChange: (selected: Record<number, string>) => void;
}

// Temporary hardcoded data until we have equipment API
const MARTIAL_MELEE_WEAPONS = [
  'Battleaxe',
  'Flail',
  'Glaive',
  'Greataxe',
  'Greatsword',
  'Halberd',
  'Lance',
  'Longsword',
  'Maul',
  'Morningstar',
  'Pike',
  'Rapier',
  'Scimitar',
  'Shortsword',
  'Trident',
  'War pick',
  'Warhammer',
  'Whip',
];

const SIMPLE_WEAPONS = [
  'Club',
  'Dagger',
  'Greatclub',
  'Handaxe',
  'Javelin',
  'Light hammer',
  'Mace',
  'Quarterstaff',
  'Sickle',
  'Spear',
  'Crossbow, light',
  'Dart',
  'Shortbow',
  'Sling',
];

export function EquipmentChoiceSelector({
  choices,
  selected,
  onSelectionChange,
}: EquipmentChoiceSelectorProps) {
  const [localSelected, setLocalSelected] =
    useState<Record<number, string>>(selected);

  // Sync with parent state
  useEffect(() => {
    setLocalSelected(selected);
  }, [selected]);

  const handleSelect = (choiceIndex: number, value: string) => {
    console.log('Equipment selected:', choiceIndex, value);
    const newSelected = {
      ...localSelected,
      [choiceIndex]: value,
    };
    setLocalSelected(newSelected);
    onSelectionChange(newSelected);
  };

  // Parse equipment option to determine if it needs a dropdown
  const parseOption = (option: string) => {
    // Check for patterns like "(a) a greataxe or (b) any martial melee weapon"
    if (option.includes('any martial melee weapon')) {
      return { type: 'martial_melee', text: option };
    }
    if (option.includes('any simple weapon')) {
      return { type: 'simple_weapon', text: option };
    }
    if (option.includes('any martial weapon')) {
      return { type: 'martial_any', text: option };
    }
    // Otherwise it's a specific item
    return { type: 'specific', text: option };
  };

  // Get theme values
  const bgSecondary = 'var(--bg-secondary)';
  const cardBg = 'var(--card-bg)';
  const borderPrimary = 'var(--border-primary)';
  const textPrimary = 'var(--text-primary)';
  const textSecondary = 'var(--text-secondary)';
  const accentPrimary = 'var(--accent-primary)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4
        style={{
          color: textPrimary,
          fontWeight: 'bold',
          marginBottom: '8px',
          fontSize: '16px',
        }}
      >
        Choose Your Equipment
      </h4>

      {choices.map((equipChoice, choiceIndex) => {
        const currentSelection = localSelected[choiceIndex] || '';

        return (
          <div
            key={choiceIndex}
            style={{
              padding: '16px',
              backgroundColor: bgSecondary,
              borderRadius: '8px',
              border: `1px solid ${borderPrimary}`,
            }}
          >
            <p
              style={{
                color: textPrimary,
                fontSize: '14px',
                fontWeight: 'bold',
                marginBottom: '12px',
              }}
            >
              Option {choiceIndex + 1}: {equipChoice.description}
            </p>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {equipChoice.options.map((option, optionIndex) => {
                const parsed = parseOption(option);
                const optionKey = `${choiceIndex}-${optionIndex}`;
                const isSelected = currentSelection.startsWith(optionKey);

                return (
                  <div key={optionIndex}>
                    <button
                      type="button"
                      onClick={() => handleSelect(choiceIndex, optionKey)}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: isSelected ? accentPrimary : cardBg,
                        borderRadius: '6px',
                        border: `2px solid ${isSelected ? accentPrimary : borderPrimary}`,
                        fontSize: '13px',
                        color: isSelected ? 'white' : textPrimary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        outline: 'none',
                        position: 'relative',
                        zIndex: 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = accentPrimary;
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow =
                            '0 4px 12px rgba(0,0,0,0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = borderPrimary;
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: '18px',
                          lineHeight: '1',
                        }}
                      >
                        {optionIndex === 0 ? '⚔️' : '🛡️'}
                      </span>
                      <span style={{ flex: 1 }}>{option}</span>
                      {isSelected && (
                        <span style={{ fontSize: '16px' }}>✓</span>
                      )}
                    </button>

                    {/* Show dropdown for "any X weapon" options when selected */}
                    {isSelected && parsed.type !== 'specific' && (
                      <div
                        style={{
                          marginTop: '8px',
                          marginLeft: '40px',
                          padding: '12px',
                          backgroundColor: cardBg,
                          borderRadius: '4px',
                          border: `1px solid ${borderPrimary}`,
                        }}
                      >
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: textPrimary,
                            fontSize: '13px',
                            fontWeight: 'bold',
                          }}
                        >
                          Choose specific{' '}
                          {parsed.type === 'martial_melee'
                            ? 'martial melee weapon'
                            : parsed.type === 'simple_weapon'
                              ? 'simple weapon'
                              : 'weapon'}
                          :
                        </label>
                        <select
                          value={currentSelection.split(':')[1] || ''}
                          onChange={(e) =>
                            handleSelect(
                              choiceIndex,
                              `${optionKey}:${e.target.value}`
                            )
                          }
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: bgSecondary,
                            border: `1px solid ${borderPrimary}`,
                            borderRadius: '4px',
                            color: textPrimary,
                            fontSize: '13px',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">-- Select a weapon --</option>
                          {(parsed.type === 'martial_melee'
                            ? MARTIAL_MELEE_WEAPONS
                            : parsed.type === 'simple_weapon'
                              ? SIMPLE_WEAPONS
                              : [...MARTIAL_MELEE_WEAPONS, ...SIMPLE_WEAPONS]
                          ).map((weapon) => (
                            <option key={weapon} value={weapon}>
                              {weapon}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p
        style={{
          color: textSecondary,
          fontSize: '12px',
          fontStyle: 'italic',
          textAlign: 'center',
          marginTop: '8px',
          opacity: 0.8,
        }}
      >
        Select one option from each category above
      </p>
    </div>
  );
}
