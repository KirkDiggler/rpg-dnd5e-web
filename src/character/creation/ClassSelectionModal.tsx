import type { ClassInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListClasses } from '../../api/hooks';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { getChoiceKey, validateChoice } from '../../types/character';
import { ChoiceSelectorWithDuplicates } from './components/ChoiceSelectorWithDuplicates';
import { EquipmentChoiceSelector } from './components/EquipmentChoiceSelector';
import { VisualCarousel } from './components/VisualCarousel';

// Helper to get CSS variable values for portals
function getCSSVariable(name: string, fallback: string): string {
  if (typeof window !== 'undefined') {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }
  return fallback;
}

// Helper function to get class emoji based on name
function getClassEmoji(className: string): string {
  const classEmojiMap: Record<string, string> = {
    Barbarian: '🪓',
    Bard: '🎵',
    Cleric: '⛪',
    Druid: '🌿',
    Fighter: '⚔️',
    Monk: '👊',
    Paladin: '🛡️',
    Ranger: '🏹',
    Rogue: '🗡️',
    Sorcerer: '✨',
    Warlock: '👹',
    Wizard: '🧙‍♂️',
  };
  return classEmojiMap[className] || '⚔️';
}

interface ClassSelectionModalProps {
  isOpen: boolean;
  currentClass?: string;
  existingProficiencies?: Set<string>;
  onSelect: (classData: ClassInfo, choices: ClassChoices) => void;
  onClose: () => void;
}

export interface ClassChoices {
  proficiencies: Record<string, string[]>;
  equipment: Record<number, string>;
  className?: string; // Track which class these choices belong to
}

export function ClassSelectionModal({
  isOpen,
  currentClass,
  existingProficiencies,
  onSelect,
  onClose,
}: ClassSelectionModalProps) {
  const { data: classes, loading, error } = useListClasses();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track choices per class
  const [classChoicesMap, setClassChoicesMap] = useState<
    Record<
      string,
      {
        proficiencies: Record<string, string[]>;
        equipment: Record<number, string>;
      }
    >
  >({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get current class name
  const currentClassName = classes[selectedIndex]?.name || '';

  // Get choices for current class
  const currentClassChoices = classChoicesMap[currentClassName] || {
    proficiencies: {},
    equipment: {},
  };

  // Reset selected index when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');

      // Set selected index based on current class
      if (currentClass && classes.length > 0) {
        const index = classes.findIndex((cls) => cls.name === currentClass);
        if (index >= 0) {
          setSelectedIndex(index);
        }
      }
    }
  }, [isOpen, currentClass, classes]);

  // Show loading or error states
  if (!isOpen) return null;
  if (loading) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'white', fontSize: '18px' }}>
          Loading classes...
        </div>
      </div>,
      document.body
    );
  }

  if (error || classes.length === 0) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'white', fontSize: '18px' }}>
          {error
            ? `Error loading classes: ${error.message}`
            : 'No classes available'}
        </div>
      </div>,
      document.body
    );
  }

  const currentClassData = classes[selectedIndex];

  const handleSelect = () => {
    setErrorMessage(''); // Clear any previous errors

    // Validate all choices are made
    const hasProficiencyChoices =
      currentClassData.proficiencyChoices &&
      currentClassData.proficiencyChoices.length > 0;

    if (hasProficiencyChoices) {
      for (let i = 0; i < currentClassData.proficiencyChoices.length; i++) {
        const choice = currentClassData.proficiencyChoices[i];
        const key = getChoiceKey(choice, i);
        const selected = currentClassChoices.proficiencies[key] || [];
        const validation = validateChoice(choice, selected);
        if (!validation.isValid) {
          setErrorMessage(validation.errors.join(' '));
          return;
        }
      }
    }

    // Validate equipment choices
    const hasEquipmentChoices =
      currentClassData.equipmentChoices &&
      currentClassData.equipmentChoices.length > 0;

    if (hasEquipmentChoices) {
      for (let i = 0; i < currentClassData.equipmentChoices.length; i++) {
        const selection = currentClassChoices.equipment[i];
        if (!selection || selection === '') {
          setErrorMessage(
            `Please select an option for Equipment Option ${i + 1}`
          );
          return;
        }
        // Check if it's a weapon choice that needs a specific selection
        if (selection.includes('-') && !selection.includes(':')) {
          const optionIndex = parseInt(selection.split('-')[1]);
          const option =
            currentClassData.equipmentChoices[i].options[optionIndex];
          if (
            option &&
            (option.includes('any martial') || option.includes('any simple'))
          ) {
            setErrorMessage(
              `Please select a specific weapon for Equipment Option ${i + 1}`
            );
            return;
          }
        }
      }
    }

    onSelect(currentClassData, {
      proficiencies: currentClassChoices.proficiencies,
      equipment: currentClassChoices.equipment,
      className: currentClassData.name,
    });
    onClose();
  };

  // Get theme values for portal rendering
  const overlayBg = getCSSVariable('--overlay-bg', 'rgba(15, 23, 42, 0.8)');
  const cardBg = getCSSVariable('--card-bg', '#334155');
  const borderPrimary = getCSSVariable('--border-primary', '#94a3b8');
  const textPrimary = getCSSVariable('--text-primary', '#f1f5f9');
  const textMuted = getCSSVariable('--text-muted', '#64748b');
  const accentPrimary = getCSSVariable('--accent-primary', '#3b82f6');
  const bgSecondary = getCSSVariable('--bg-secondary', '#2a2a2a');
  const shadowModal = getCSSVariable(
    '--shadow-modal',
    '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  );

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: overlayBg,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: cardBg,
          maxWidth: '600px',
          width: '90%',
          borderRadius: '12px',
          border: `3px solid ${borderPrimary}`,
          padding: '24px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: shadowModal,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            borderBottom: `1px solid ${borderPrimary}`,
            paddingBottom: '16px',
          }}
        >
          <h2
            style={{
              color: textPrimary,
              fontSize: '24px',
              fontWeight: 'bold',
              margin: 0,
              fontFamily: 'Cinzel, serif',
            }}
          >
            Choose Your Class
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: textMuted,
            }}
          >
            ×
          </button>
        </div>

        {/* Visual Carousel */}
        <div style={{ marginBottom: '24px' }}>
          <VisualCarousel
            items={classes.map((cls) => ({
              name: cls.name,
              emoji: getClassEmoji(cls.name),
            }))}
            selectedIndex={selectedIndex}
            onSelect={(index) => {
              setSelectedIndex(index);
              setErrorMessage(''); // Only clear error message
            }}
          />

          {/* Selected Class Name - Larger Display */}
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <h3
              style={{
                color: textPrimary,
                fontSize: '32px',
                fontWeight: 'bold',
                margin: '0',
                fontFamily: 'Cinzel, serif',
              }}
            >
              {currentClassData.name}
            </h3>
          </div>
        </div>

        {/* Details */}
        <div
          style={{
            marginBottom: '24px',
            overflow: 'hidden',
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          <div>
            {/* Description Section */}
            <CollapsibleSection title="Description" defaultOpen={true}>
              <p
                style={{
                  color: textPrimary,
                  fontSize: '16px',
                  lineHeight: '1.5',
                  padding: '8px',
                }}
              >
                {currentClassData.description}
              </p>
            </CollapsibleSection>

            {/* Core Info Grid */}
            <CollapsibleSection title="Core Info" defaultOpen={true}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <h4
                    style={{
                      color: textPrimary,
                      fontWeight: 'bold',
                      marginBottom: '8px',
                    }}
                  >
                    Hit Die & Primary Abilities
                  </h4>
                  <p
                    style={{
                      color: textPrimary,
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                  >
                    <strong>Hit Die:</strong> {currentClassData.hitDie}
                  </p>
                  <p
                    style={{
                      color: textPrimary,
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                  >
                    <strong>Primary:</strong>{' '}
                    {currentClassData.primaryAbilities.join(' & ')}
                  </p>
                  <p style={{ color: textPrimary, fontSize: '14px' }}>
                    <strong>Saves:</strong>{' '}
                    {currentClassData.savingThrowProficiencies.join(', ')}
                  </p>
                </div>

                <div>
                  <h4
                    style={{
                      color: textPrimary,
                      fontWeight: 'bold',
                      marginBottom: '8px',
                    }}
                  >
                    Skills
                  </h4>
                  <p
                    style={{
                      color: textPrimary,
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                  >
                    Choose {currentClassData.skillChoicesCount} from:
                  </p>
                  <div
                    style={{
                      fontSize: '14px',
                      color: textPrimary,
                      opacity: 0.9,
                    }}
                  >
                    {currentClassData.availableSkills.slice(0, 6).join(', ')}
                    {currentClassData.availableSkills.length > 6 &&
                      ` +${currentClassData.availableSkills.length - 6} more`}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Proficiencies Section */}
            <CollapsibleSection title="Proficiencies" defaultOpen={false}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                {currentClassData.armorProficiencies.length > 0 && (
                  <div
                    style={{
                      padding: '8px',
                      backgroundColor: bgSecondary,
                      borderRadius: '6px',
                      border: `1px solid ${borderPrimary}`,
                    }}
                  >
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      Armor
                    </div>
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '14px',
                        opacity: 0.9,
                      }}
                    >
                      {currentClassData.armorProficiencies.join(', ')}
                    </div>
                  </div>
                )}

                {currentClassData.weaponProficiencies.length > 0 && (
                  <div
                    style={{
                      padding: '8px',
                      backgroundColor: bgSecondary,
                      borderRadius: '6px',
                      border: `1px solid ${borderPrimary}`,
                    }}
                  >
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      Weapons
                    </div>
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '14px',
                        opacity: 0.9,
                      }}
                    >
                      {currentClassData.weaponProficiencies
                        .slice(0, 3)
                        .join(', ')}
                      {currentClassData.weaponProficiencies.length > 3 &&
                        ` +${currentClassData.weaponProficiencies.length - 3} more`}
                    </div>
                  </div>
                )}

                {currentClassData.toolProficiencies.length > 0 && (
                  <div
                    style={{
                      padding: '8px',
                      backgroundColor: bgSecondary,
                      borderRadius: '6px',
                      border: `1px solid ${borderPrimary}`,
                    }}
                  >
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      Tools
                    </div>
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '14px',
                        opacity: 0.9,
                      }}
                    >
                      {currentClassData.toolProficiencies.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* Proficiency Choices */}
            {currentClassData.proficiencyChoices &&
              currentClassData.proficiencyChoices.length > 0 && (
                <CollapsibleSection
                  title="Choose Your Proficiencies"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {currentClassData.proficiencyChoices.map(
                      (choice, index) => (
                        <div key={index} style={{ marginBottom: '16px' }}>
                          <ChoiceSelectorWithDuplicates
                            choice={choice}
                            selected={
                              currentClassChoices.proficiencies[
                                getChoiceKey(choice, index)
                              ] || []
                            }
                            existingSelections={existingProficiencies}
                            onSelectionChange={(selected) => {
                              const key = getChoiceKey(choice, index);
                              setClassChoicesMap((prev) => ({
                                ...prev,
                                [currentClassName]: {
                                  ...currentClassChoices,
                                  proficiencies: {
                                    ...currentClassChoices.proficiencies,
                                    [key]: selected,
                                  },
                                },
                              }));
                            }}
                          />
                        </div>
                      )
                    )}
                  </div>
                </CollapsibleSection>
              )}

            {/* Equipment Choices */}
            {currentClassData.equipmentChoices &&
              currentClassData.equipmentChoices.length > 0 && (
                <CollapsibleSection
                  title="Choose Your Equipment"
                  defaultOpen={true}
                  required={true}
                >
                  <EquipmentChoiceSelector
                    choices={currentClassData.equipmentChoices}
                    selected={currentClassChoices.equipment}
                    onSelectionChange={(newEquipment) => {
                      setClassChoicesMap((prev) => ({
                        ...prev,
                        [currentClassName]: {
                          ...currentClassChoices,
                          equipment: newEquipment,
                        },
                      }));
                    }}
                  />
                </CollapsibleSection>
              )}

            {/* Features Section */}
            <div style={{ marginBottom: '20px' }}>
              <h4
                style={{
                  color: textPrimary,
                  fontWeight: 'bold',
                  marginBottom: '8px',
                }}
              >
                Level 1 Features
              </h4>
              <div
                style={{
                  maxHeight: '120px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: bgSecondary,
                  borderRadius: '6px',
                  border: `1px solid ${borderPrimary}`,
                }}
              >
                {currentClassData.level1Features.map((feature, i) => (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <div
                      style={{
                        color: textPrimary,
                        fontSize: '13px',
                        fontWeight: 'bold',
                      }}
                    >
                      {feature.name}
                    </div>
                    {feature.description && (
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '14px',
                          lineHeight: '1.4',
                          opacity: 0.9,
                        }}
                      >
                        {feature.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Starting Equipment */}
            {currentClassData.startingEquipment.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4
                  style={{
                    color: textPrimary,
                    fontWeight: 'bold',
                    marginBottom: '8px',
                  }}
                >
                  Starting Equipment
                </h4>
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: bgSecondary,
                    borderRadius: '6px',
                    border: `1px solid ${borderPrimary}`,
                    fontSize: '14px',
                    color: textPrimary,
                    opacity: 0.9,
                  }}
                >
                  {currentClassData.startingEquipment.slice(0, 4).join(', ')}
                  {currentClassData.startingEquipment.length > 4 &&
                    ` +${currentClassData.startingEquipment.length - 4} more items`}
                </div>
              </div>
            )}

            {/* Spellcasting Info */}
            {currentClassData.spellcasting && (
              <div style={{ marginBottom: '20px' }}>
                <h4
                  style={{
                    color: textPrimary,
                    fontWeight: 'bold',
                    marginBottom: '8px',
                  }}
                >
                  🔮 Spellcasting
                </h4>
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: bgSecondary,
                    borderRadius: '6px',
                    border: `1px solid ${accentPrimary}`,
                    fontSize: '14px',
                  }}
                >
                  <div style={{ color: textPrimary, marginBottom: '4px' }}>
                    <strong>Ability:</strong>{' '}
                    {currentClassData.spellcasting.spellcastingAbility}
                  </div>
                  <div style={{ color: textPrimary, marginBottom: '4px' }}>
                    <strong>Cantrips Known:</strong>{' '}
                    {currentClassData.spellcasting.cantripsKnown}
                  </div>
                  <div style={{ color: textPrimary }}>
                    <strong>1st Level Slots:</strong>{' '}
                    {currentClassData.spellcasting.spellSlotsLevel1}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: '#ef4444',
              fontSize: '14px',
              textAlign: 'center',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: bgSecondary,
              border: `1px solid ${borderPrimary}`,
              borderRadius: '6px',
              padding: '8px 16px',
              cursor: 'pointer',
              color: textPrimary,
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSelect}
            style={{
              background: accentPrimary,
              border: 'none',
              borderRadius: '6px',
              padding: '8px 24px',
              cursor: 'pointer',
              color: textPrimary,
              fontWeight: 'bold',
            }}
          >
            Select {currentClassData.name}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
