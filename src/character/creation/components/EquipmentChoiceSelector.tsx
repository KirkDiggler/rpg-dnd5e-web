import type { EquipmentChoice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { EquipmentType, useListEquipmentByType } from '../../../api';

interface EquipmentChoiceSelectorProps {
  choices: EquipmentChoice[];
  selected: Record<number, string>; // choiceIndex -> selected option or specific item
  onSelectionChange: (selected: Record<number, string>) => void;
}

export function EquipmentChoiceSelector({
  choices,
  selected,
  onSelectionChange,
}: EquipmentChoiceSelectorProps) {
  console.log('Equipment choices:', choices);

  const [localSelected, setLocalSelected] =
    useState<Record<number, string>>(selected);

  // Fetch equipment data from API
  const { data: simpleWeapons, loading: simpleLoading } =
    useListEquipmentByType(EquipmentType.SIMPLE_MELEE_WEAPON);
  const { data: simpleRangedWeapons, loading: simpleRangedLoading } =
    useListEquipmentByType(EquipmentType.SIMPLE_RANGED_WEAPON);
  const { data: martialMeleeWeapons, loading: martialMeleeLoading } =
    useListEquipmentByType(EquipmentType.MARTIAL_MELEE_WEAPON);
  const { data: martialRangedWeapons, loading: martialRangedLoading } =
    useListEquipmentByType(EquipmentType.MARTIAL_RANGED_WEAPON);

  // Combine simple weapons (melee + ranged)
  const allSimpleWeapons = [
    ...(simpleWeapons || []),
    ...(simpleRangedWeapons || []),
  ];

  // Combine martial weapons (melee + ranged)
  const allMartialWeapons = [
    ...(martialMeleeWeapons || []),
    ...(martialRangedWeapons || []),
  ];

  // Loading state for any equipment data
  const isLoading =
    simpleLoading ||
    simpleRangedLoading ||
    martialMeleeLoading ||
    martialRangedLoading;

  // Sync with parent state
  useEffect(() => {
    setLocalSelected(selected);
  }, [selected]);

  const handleSelect = (choiceIndex: number, value: string) => {
    const newSelected = {
      ...localSelected,
      [choiceIndex]: value,
    };
    setLocalSelected(newSelected);
    onSelectionChange(newSelected);
  };

  // Parse equipment option to determine if it needs a dropdown
  const parseOption = (option: string) => {
    console.log('Parsing option:', option);
    // Check for patterns like "(a) a greataxe or (b) any martial melee weapon"
    // Also check for just "any simple weapon" or "any martial weapon"
    const lowerOption = option.toLowerCase();

    if (lowerOption.includes('any martial melee weapon')) {
      return { type: 'martial_melee', text: option };
    }
    if (lowerOption.includes('any simple weapon')) {
      return { type: 'simple_weapon', text: option };
    }
    if (lowerOption.includes('any martial weapon')) {
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

  // Handle empty choices
  if (!choices || choices.length === 0) {
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
        <p style={{ color: textSecondary, fontSize: '14px' }}>
          No equipment choices available for this class.
        </p>
      </div>
    );
  }

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
              {/* Parse options from description if options array is empty */}
              {(() => {
                const optionsToUse =
                  equipChoice.options && equipChoice.options.length > 0
                    ? equipChoice.options
                    : equipChoice.description
                        .split(' or ')
                        .map((part) => part.trim());

                return optionsToUse.map((option, optionIndex) => {
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
                            e.currentTarget.style.transform =
                              'translateY(-2px)';
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
                            <option value="">
                              {isLoading
                                ? 'Loading weapons...'
                                : '-- Select a weapon --'}
                            </option>
                            {!isLoading &&
                              (parsed.type === 'martial_melee'
                                ? martialMeleeWeapons || []
                                : parsed.type === 'simple_weapon'
                                  ? allSimpleWeapons
                                  : parsed.type === 'martial_any'
                                    ? allMartialWeapons
                                    : []
                              ).map((equipment) => (
                                <option
                                  key={equipment.id}
                                  value={equipment.name}
                                >
                                  {equipment.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
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
