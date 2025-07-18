import type { EquipmentChoice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';

interface EquipmentChoiceSelectorProps {
  choices: EquipmentChoice[];
  selected: Record<number, number>; // choiceIndex -> selectedOptionIndex
  onSelectionChange: (selected: Record<number, number>) => void;
}

export function EquipmentChoiceSelector({
  choices,
  selected,
  onSelectionChange,
}: EquipmentChoiceSelectorProps) {
  const [localSelected, setLocalSelected] =
    useState<Record<number, number>>(selected);

  const handleSelect = (choiceIndex: number, optionIndex: number) => {
    const newSelected = {
      ...localSelected,
      [choiceIndex]: optionIndex,
    };
    setLocalSelected(newSelected);
    onSelectionChange(newSelected);
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

      {choices.map((equipChoice, choiceIndex) => (
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
            style={{
              display: 'grid',
              gridTemplateColumns:
                equipChoice.options.length > 1
                  ? 'repeat(auto-fit, minmax(200px, 1fr))'
                  : '1fr',
              gap: '8px',
            }}
          >
            {equipChoice.options.map((option, optionIndex) => {
              const isSelected = localSelected[choiceIndex] === optionIndex;

              return (
                <button
                  key={optionIndex}
                  onClick={() => handleSelect(choiceIndex, optionIndex)}
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
                  {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
