import type { ClassInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListClasses } from '../../api/hooks';
import { ChoiceRenderer } from '../../components/ChoiceRenderer';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { FeatureChoiceSelector } from './components/FeatureChoiceSelector';
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
  existingChoices?: ClassChoices;
  rawExistingChoices?: Record<string, string[]>; // Raw choices from draft
  onSelect: (classData: ClassInfo, choices: ClassChoices) => void;
  onClose: () => void;
}

export interface ClassChoices {
  proficiencies: Record<string, string[]>;
  equipment: Record<string, string>; // choiceId -> selected item
  features: Record<string, Record<string, string[]>>; // featureId -> choiceId -> selections
  className?: string; // Track which class these choices belong to
}

export function ClassSelectionModal({
  isOpen,
  currentClass,
  existingChoices,
  rawExistingChoices,
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
        equipment: Record<string, string>;
        features: Record<string, Record<string, string[]>>;
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
    features: {},
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

      // Initialize with existing choices if provided
      if (
        existingChoices &&
        currentClass &&
        existingChoices.className === currentClass
      ) {
        setClassChoicesMap((prev) => ({
          ...prev,
          [currentClass]: {
            proficiencies: existingChoices.proficiencies || {},
            equipment: existingChoices.equipment || {},
            features: existingChoices.features || {},
          },
        }));
      } else if (rawExistingChoices && currentClass) {
        // Handle raw choices from draft
        const formattedChoices: ClassChoices = {
          proficiencies: {},
          equipment: {},
          features: {},
        };

        // Format the raw choices
        Object.entries(rawExistingChoices).forEach(([choiceId, selections]) => {
          if (choiceId.includes('equipment')) {
            formattedChoices.equipment[choiceId] = selections[0] || '';
          } else if (choiceId.startsWith('feature_')) {
            // Handle feature choices if needed
          } else {
            // Default to proficiencies
            formattedChoices.proficiencies[choiceId] = selections;
          }
        });

        setClassChoicesMap((prev) => ({
          ...prev,
          [currentClass]: formattedChoices,
        }));
      }
    }
  }, [isOpen, currentClass, classes, existingChoices, rawExistingChoices]);

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

    // Validate skill choices
    const skillChoices =
      currentClassData.choices?.filter(
        (choice) => choice.choiceType === ChoiceCategory.SKILLS
      ) || [];

    for (const choice of skillChoices) {
      const selected = currentClassChoices.proficiencies[choice.id] || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} skill${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    // Validate equipment choices
    const equipmentChoices =
      currentClassData.choices?.filter(
        (choice) => choice.choiceType === ChoiceCategory.EQUIPMENT
      ) || [];

    for (const choice of equipmentChoices) {
      const selected = currentClassChoices.equipment[choice.id] || '';
      if (!selected) {
        setErrorMessage(
          `Please select an option for equipment: ${choice.description}`
        );
        return;
      }
    }

    // Validate other proficiency choices (tool, weapon, armor)
    const proficiencyChoices =
      currentClassData.choices?.filter(
        (choice) =>
          choice.choiceType === ChoiceCategory.TOOLS ||
          choice.choiceType === ChoiceCategory.WEAPON_PROFICIENCIES ||
          choice.choiceType === ChoiceCategory.ARMOR_PROFICIENCIES
      ) || [];

    for (const choice of proficiencyChoices) {
      const selected = currentClassChoices.proficiencies[choice.id] || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} option${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    // Validate feat choices
    const featChoices =
      currentClassData.choices?.filter(
        (choice) => choice.choiceType === ChoiceCategory.FEATS
      ) || [];

    for (const choice of featChoices) {
      const selected = currentClassChoices.proficiencies[choice.id] || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} feat${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    // Validate feature choices
    const hasFeatureChoices =
      currentClassData.level1Features &&
      currentClassData.level1Features.some(
        (f) => f.choices && f.choices.length > 0
      );

    if (hasFeatureChoices) {
      for (const feature of currentClassData.level1Features) {
        if (feature.choices && feature.choices.length > 0) {
          const featureSelections =
            currentClassChoices.features[feature.id] || {};

          // Check each choice in the feature
          for (const choice of feature.choices) {
            const selections = featureSelections[choice.id] || [];
            if (selections.length !== choice.chooseCount) {
              setErrorMessage(
                `Please select ${choice.chooseCount} option${choice.chooseCount > 1 ? 's' : ''} for ${feature.name}: ${choice.description}`
              );
              return;
            }
          }
        }
      }
    }

    onSelect(currentClassData, {
      proficiencies: currentClassChoices.proficiencies,
      equipment: currentClassChoices.equipment,
      features: currentClassChoices.features,
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

            {/* Skill Proficiency Choices */}
            {(() => {
              const skillChoices =
                currentClassData.choices?.filter(
                  (choice) => choice.choiceType === ChoiceCategory.SKILLS
                ) || [];

              if (skillChoices.length === 0) return null;

              return (
                <CollapsibleSection
                  title="Choose Your Skills"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {skillChoices.map((choice) => (
                      <div key={choice.id} style={{ marginBottom: '16px' }}>
                        <ChoiceRenderer
                          choice={choice}
                          currentSelections={
                            currentClassChoices.proficiencies[choice.id] || []
                          }
                          onSelectionChange={(choiceId, selections) => {
                            setClassChoicesMap((prev) => ({
                              ...prev,
                              [currentClassName]: {
                                ...currentClassChoices,
                                proficiencies: {
                                  ...currentClassChoices.proficiencies,
                                  [choiceId]: selections,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })()}

            {/* Class Features */}
            {currentClassData.level1Features &&
              currentClassData.level1Features.length > 0 && (
                <CollapsibleSection title="Class Features" defaultOpen={true}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {currentClassData.level1Features.map((feature) => (
                      <div
                        key={feature.id}
                        style={{
                          padding: '12px',
                          backgroundColor: bgSecondary,
                          borderRadius: '8px',
                          border:
                            feature.choices && feature.choices.length > 0
                              ? '2px solid var(--accent-primary)'
                              : `1px solid ${borderPrimary}`,
                        }}
                      >
                        <h4
                          style={{
                            color: textPrimary,
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {feature.name}
                          {feature.choices && feature.choices.length > 0 && (
                            <span
                              style={{
                                fontSize: '12px',
                                padding: '2px 8px',
                                backgroundColor: accentPrimary,
                                color: 'white',
                                borderRadius: '4px',
                              }}
                            >
                              Choice Required
                            </span>
                          )}
                        </h4>
                        <p
                          style={{
                            color: textPrimary,
                            fontSize: '14px',
                            opacity: 0.9,
                            lineHeight: '1.5',
                          }}
                        >
                          {feature.description}
                        </p>
                        {feature.choices && feature.choices.length > 0 && (
                          <FeatureChoiceSelector
                            feature={feature}
                            currentSelections={
                              currentClassChoices.features[feature.id] || {}
                            }
                            onSelect={(featureId, choiceId, selections) => {
                              setClassChoicesMap((prev) => ({
                                ...prev,
                                [currentClassName]: {
                                  ...currentClassChoices,
                                  features: {
                                    ...currentClassChoices.features,
                                    [featureId]: {
                                      ...(currentClassChoices.features[
                                        featureId
                                      ] ?? {}),
                                      [choiceId]: selections,
                                    },
                                  },
                                },
                              }));
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

            {/* Equipment Choices from new choice system */}
            {(() => {
              const equipmentChoices =
                currentClassData.choices?.filter(
                  (choice) => choice.choiceType === ChoiceCategory.EQUIPMENT
                ) || [];

              if (equipmentChoices.length === 0) return null;

              return (
                <CollapsibleSection
                  title="Choose Your Equipment"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {equipmentChoices.map((choice) => (
                      <div key={choice.id} style={{ marginBottom: '16px' }}>
                        <ChoiceRenderer
                          choice={choice}
                          currentSelections={
                            currentClassChoices.equipment[choice.id]
                              ? [currentClassChoices.equipment[choice.id]]
                              : []
                          }
                          onSelectionChange={(choiceId, selections) => {
                            setClassChoicesMap((prev) => ({
                              ...prev,
                              [currentClassName]: {
                                ...currentClassChoices,
                                equipment: {
                                  ...currentClassChoices.equipment,
                                  [choiceId]: selections[0] || '',
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })()}

            {/* Other Proficiency Choices (Tool, Weapon, Armor) */}
            {(() => {
              const proficiencyChoices =
                currentClassData.choices?.filter(
                  (choice) =>
                    choice.choiceType === ChoiceCategory.TOOLS ||
                    choice.choiceType === ChoiceCategory.WEAPON_PROFICIENCIES ||
                    choice.choiceType === ChoiceCategory.ARMOR_PROFICIENCIES
                ) || [];

              if (proficiencyChoices.length === 0) return null;

              return (
                <CollapsibleSection
                  title="Choose Your Proficiencies"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {proficiencyChoices.map((choice) => (
                      <div key={choice.id} style={{ marginBottom: '16px' }}>
                        <ChoiceRenderer
                          choice={choice}
                          currentSelections={
                            currentClassChoices.proficiencies[choice.id] || []
                          }
                          onSelectionChange={(choiceId, selections) => {
                            setClassChoicesMap((prev) => ({
                              ...prev,
                              [currentClassName]: {
                                ...currentClassChoices,
                                proficiencies: {
                                  ...currentClassChoices.proficiencies,
                                  [choiceId]: selections,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })()}

            {/* Feat Choices */}
            {(() => {
              const featChoices =
                currentClassData.choices?.filter(
                  (choice) => choice.choiceType === ChoiceCategory.FEATS
                ) || [];

              if (featChoices.length === 0) return null;

              return (
                <CollapsibleSection
                  title="Choose Your Feats"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {featChoices.map((choice) => (
                      <div key={choice.id} style={{ marginBottom: '16px' }}>
                        <ChoiceRenderer
                          choice={choice}
                          currentSelections={
                            currentClassChoices.proficiencies[choice.id] || []
                          }
                          onSelectionChange={(choiceId, selections) => {
                            setClassChoicesMap((prev) => ({
                              ...prev,
                              [currentClassName]: {
                                ...currentClassChoices,
                                proficiencies: {
                                  ...currentClassChoices.proficiencies,
                                  [choiceId]: selections,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })()}

            {/* Other Choices (Spells, Languages, etc.) */}
            {(() => {
              const otherChoices =
                currentClassData.choices?.filter(
                  (choice) =>
                    choice.choiceType === ChoiceCategory.SPELLS ||
                    choice.choiceType === ChoiceCategory.LANGUAGES ||
                    (choice.choiceType !== ChoiceCategory.SKILLS &&
                      choice.choiceType !== ChoiceCategory.EQUIPMENT &&
                      choice.choiceType !== ChoiceCategory.TOOLS &&
                      choice.choiceType !==
                        ChoiceCategory.WEAPON_PROFICIENCIES &&
                      choice.choiceType !==
                        ChoiceCategory.ARMOR_PROFICIENCIES &&
                      choice.choiceType !== ChoiceCategory.FEATS)
                ) || [];

              if (otherChoices.length === 0) return null;

              return (
                <CollapsibleSection
                  title="Other Choices"
                  defaultOpen={true}
                  required={true}
                >
                  <div style={{ marginBottom: '12px' }}>
                    {otherChoices.map((choice) => (
                      <div key={choice.id} style={{ marginBottom: '16px' }}>
                        <ChoiceRenderer
                          choice={choice}
                          currentSelections={
                            currentClassChoices.proficiencies[choice.id] || []
                          }
                          onSelectionChange={(choiceId, selections) => {
                            setClassChoicesMap((prev) => ({
                              ...prev,
                              [currentClassName]: {
                                ...currentClassChoices,
                                proficiencies: {
                                  ...currentClassChoices.proficiencies,
                                  [choiceId]: selections,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })()}

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
