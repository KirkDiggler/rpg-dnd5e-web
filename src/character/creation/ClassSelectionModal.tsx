import type {
  ClassInfo,
  SubclassInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Armor,
  Language,
  Skill,
  Weapon,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListClasses } from '../../api/hooks';
import { ChoiceRenderer } from '../../components/ChoiceRenderer';
import type { ClassModalChoices, EquipmentChoice } from '../../types/choices';
import {
  getArmorProficiencyCategoryDisplay,
  getSavingThrowDisplay,
  getWeaponProficiencyCategoryDisplay,
} from '../../utils/enumDisplay';
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

// Helper function to get subclass type display name
function getSubclassTypeDisplayName(subclassType: string): string {
  const typeMap: Record<string, string> = {
    'divine-domain': 'Divine Domain',
    'sorcerous-origin': 'Sorcerous Origin',
    'otherworldly-patron': 'Otherworldly Patron',
    'martial-archetype': 'Martial Archetype',
    circle: 'Druidic Circle',
    college: 'Bardic College',
    path: 'Primal Path',
    tradition: 'Arcane Tradition',
    way: 'Monastic Tradition',
    oath: 'Sacred Oath',
    archetype: 'Ranger Archetype',
    'roguish-archetype': 'Roguish Archetype',
  };
  return (
    typeMap[subclassType] ||
    subclassType.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

interface ClassSelectionModalProps {
  isOpen: boolean;
  currentClass?: string;
  existingChoices?: ClassModalChoices;
  onSelect: (
    classData: ClassInfo | (ClassInfo & { selectedSubclass: SubclassInfo }),
    choices: ClassModalChoices
  ) => void;
  onClose: () => void;
}

export function ClassSelectionModal({
  isOpen,
  currentClass: currentClassParam,
  existingChoices,
  onSelect,
  onClose,
}: ClassSelectionModalProps) {
  const { data: classes, loading, error } = useListClasses();
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [selectedSubclassIndex, setSelectedSubclassIndex] = useState<
    number | null
  >(null);
  const [expandedSections, setExpandedSections] = useState({
    subclasses: false,
    details: false,
    choices: false,
  });

  // Track choices per class
  const [classChoicesMap, setClassChoicesMap] = useState<
    Record<string, ClassModalChoices>
  >({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get current class and subclass
  const selectedClass = classes[selectedClassIndex];
  const currentSubclass =
    selectedSubclassIndex !== null
      ? selectedClass?.subclasses[selectedSubclassIndex]
      : null;
  const currentClassName = selectedClass?.name || '';
  const hasSubclasses =
    selectedClass?.subclasses && selectedClass.subclasses.length > 0;

  // For classes with subclasses, use subclass name as key, otherwise use class name
  const choiceKey = currentSubclass ? currentSubclass.name : currentClassName;

  // Get choices for current selection
  const currentClassChoices = classChoicesMap[choiceKey] || {
    skills: [],
    languages: [],
    equipment: [],
    features: [],
    expertise: [],
    traits: [],
    proficiencies: [],
  };

  // Auto-expand sections based on selection state
  useEffect(() => {
    if (selectedClass && !hasSubclasses) {
      // For classes without subclasses, expand details immediately
      setExpandedSections((prev) => ({
        ...prev,
        details: true,
        choices: true,
      }));
    } else if (
      selectedClass &&
      hasSubclasses &&
      selectedSubclassIndex === null
    ) {
      // For classes with subclasses, expand subclass selection
      setExpandedSections((prev) => ({
        ...prev,
        subclasses: true,
        details: false,
        choices: false,
      }));
    } else if (selectedClass && currentSubclass) {
      // Once subclass is selected, expand details and choices
      setExpandedSections((prev) => ({
        ...prev,
        details: true,
        choices: true,
      }));
    }
  }, [selectedClass, hasSubclasses, selectedSubclassIndex, currentSubclass]);

  // Reset selected index when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');

      // Reset expanded sections
      setExpandedSections({
        subclasses: false,
        details: false,
        choices: false,
      });

      // Clear previous choices when opening modal
      setClassChoicesMap({});

      // Set selected index based on current class (could be class name, class ID, or subclass ID)
      if (currentClassParam && classes.length > 0) {
        // First try to find by class name or ID
        let classIndex = classes.findIndex(
          (cls) =>
            cls.name === currentClassParam ||
            String(cls.classId) === currentClassParam
        );

        // If not found, search for subclass ID within classes
        if (classIndex === -1) {
          for (let i = 0; i < classes.length; i++) {
            const foundClass = classes[i];
            if (foundClass?.subclasses && foundClass.subclasses.length > 0) {
              const subclassIndex = foundClass.subclasses.findIndex(
                (sub) => String(sub.subclassId) === currentClassParam
              );
              if (subclassIndex >= 0) {
                classIndex = i;
                setSelectedSubclassIndex(subclassIndex);
                break;
              }
            }
          }
        }

        if (classIndex >= 0) {
          setSelectedClassIndex(classIndex);
        }
      }

      // Initialize with existing choices if provided
      if (existingChoices && currentClassParam) {
        setClassChoicesMap({
          [currentClassParam]: existingChoices,
        });
      }

      // Reset subclass selection if not already set above
      if (
        !currentClassParam ||
        classes.findIndex(
          (cls) =>
            cls.name === currentClassParam ||
            String(cls.classId) === currentClassParam
        ) >= 0
      ) {
        setSelectedSubclassIndex(null);
      }
    }
  }, [isOpen, currentClassParam, classes, existingChoices]);

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

  // The data we're currently displaying (could be class or subclass)
  const currentDisplayData = currentSubclass || selectedClass;

  // Use the appropriate data source for choices (subclass choices take precedence)
  const choicesSource =
    currentSubclass?.additionalChoices || selectedClass?.choices || [];

  const handleSelect = () => {
    setErrorMessage(''); // Clear any previous errors

    // For classes with subclasses, require subclass selection
    if (hasSubclasses && selectedSubclassIndex === null) {
      setErrorMessage('Please select a subclass before continuing.');
      return;
    }

    // Validate skill choices
    const skillChoices =
      choicesSource?.filter(
        (choice) => choice.choiceType === ChoiceCategory.SKILLS
      ) || [];

    for (const choice of skillChoices) {
      const skillChoice = currentClassChoices.skills?.find(
        (sc) => sc.choiceId === choice.id
      );
      const selected = skillChoice?.skills || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} skill${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    // Validate language choices
    const languageChoices =
      choicesSource?.filter(
        (choice) => choice.choiceType === ChoiceCategory.LANGUAGES
      ) || [];

    for (const choice of languageChoices) {
      const languageChoice = currentClassChoices.languages?.find(
        (lc) => lc.choiceId === choice.id
      );
      const selected = languageChoice?.languages || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} language${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    // Validate equipment choices
    const equipmentChoices =
      choicesSource?.filter(
        (choice) => choice.choiceType === ChoiceCategory.EQUIPMENT
      ) || [];

    for (const choice of equipmentChoices) {
      const equipmentChoice = currentClassChoices.equipment?.find(
        (ec) => ec.choiceId === choice.id
      );
      const selected = equipmentChoice?.bundleId
        ? [equipmentChoice.bundleId]
        : [];
      if (selected.length === 0) {
        setErrorMessage(
          `Please select an option for equipment: ${choice.description}`
        );
        return;
      }
    }

    // For now, we'll skip validation of other choice types that don't use enums yet
    // TODO: Add validation for tools, weapon proficiencies, armor proficiencies, feats, features
    // when they are updated to use structured types

    // Always pass the base class, but if subclass is selected, pass it with subclass info
    if (currentSubclass) {
      // Create a combined object that includes both class and subclass info
      const combinedClassData = {
        ...selectedClass!,
        selectedSubclass: currentSubclass,
      } as ClassInfo & { selectedSubclass: SubclassInfo };
      onSelect(combinedClassData, currentClassChoices);
    } else {
      // No subclass selected, just pass the base class
      onSelect(selectedClass!, currentClassChoices);
    }
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
          width: '95vw',
          height: '95vh',
          borderRadius: '16px',
          border: `3px solid ${borderPrimary}`,
          boxShadow: shadowModal,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: `2px solid ${borderPrimary}`,
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              color: textPrimary,
              fontSize: '28px',
              fontWeight: 'bold',
              margin: 0,
              fontFamily: 'Cinzel, serif',
            }}
          >
            Choose Your Class
          </h1>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: textMuted,
              padding: '4px 8px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = bgSecondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* Main Content Area - Single scrollbar */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
          }}
        >
          {/* Section 1: Class Gallery */}
          <section
            style={{
              padding: '24px',
              borderBottom: `1px solid ${borderPrimary}`,
              backgroundColor: cardBg,
            }}
          >
            <div style={{ marginBottom: '20px' }}>
              <VisualCarousel
                items={classes.map((cls) => ({
                  name: cls.name,
                  emoji: getClassEmoji(cls.name),
                }))}
                selectedIndex={selectedClassIndex}
                onSelect={(index) => {
                  setSelectedClassIndex(index);
                  setSelectedSubclassIndex(null); // Reset subclass selection when class changes
                  setErrorMessage(''); // Clear error message
                  // Clear choices for the newly selected class if it's different
                  const newClassName = classes[index]?.name;
                  if (newClassName && !classChoicesMap[newClassName]) {
                    // Only initialize if not already present
                    setClassChoicesMap((prev) => ({
                      ...prev,
                      [newClassName]: {
                        skills: [],
                        languages: [],
                        equipment: [],
                        features: [],
                        expertise: [],
                        traits: [],
                        proficiencies: [],
                      },
                    }));
                  }
                }}
              />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2
                style={{
                  color: textPrimary,
                  fontSize: '36px',
                  fontWeight: 'bold',
                  margin: '0',
                  fontFamily: 'Cinzel, serif',
                }}
              >
                {selectedClass?.name}
              </h2>
            </div>
          </section>

          {/* Section 2: Subclass Selection */}
          {hasSubclasses && (
            <section
              style={{
                padding: '24px',
                borderBottom: `1px solid ${borderPrimary}`,
                backgroundColor: expandedSections.subclasses
                  ? cardBg
                  : bgSecondary,
                transition: 'all 0.3s ease',
              }}
            >
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    subclasses: !prev.subclasses,
                  }))
                }
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: expandedSections.subclasses ? '20px' : '0',
                }}
              >
                <h3
                  style={{
                    color: textPrimary,
                    fontSize: '24px',
                    fontWeight: 'bold',
                    margin: '0',
                    fontFamily: 'Cinzel, serif',
                  }}
                >
                  Choose Your {getSubclassTypeDisplayName('Subclass')}
                </h3>
                <div
                  style={{
                    color: textMuted,
                    fontSize: '20px',
                    transform: expandedSections.subclasses
                      ? 'rotate(90deg)'
                      : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                  }}
                >
                  ▶
                </div>
              </button>

              {expandedSections.subclasses && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {selectedClass!.subclasses.map((subclass, index) => (
                    <button
                      key={subclass.subclassId}
                      onClick={() => {
                        setSelectedSubclassIndex(index);
                        setErrorMessage('');
                      }}
                      style={{
                        padding: '16px',
                        borderRadius: '12px',
                        border: `3px solid ${
                          selectedSubclassIndex === index
                            ? accentPrimary
                            : borderPrimary
                        }`,
                        backgroundColor:
                          selectedSubclassIndex === index
                            ? accentPrimary + '20'
                            : bgSecondary,
                        color: textPrimary,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedSubclassIndex !== index) {
                          e.currentTarget.style.borderColor = accentPrimary;
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedSubclassIndex !== index) {
                          e.currentTarget.style.borderColor = borderPrimary;
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          fontFamily: 'Cinzel, serif',
                        }}
                      >
                        {subclass.name}
                      </div>
                      <div
                        style={{
                          fontSize: '14px',
                          opacity: 0.9,
                          lineHeight: '1.4',
                        }}
                      >
                        {subclass.description ||
                          'A specialized path within this class.'}
                      </div>
                      {((subclass.armorProficiencies &&
                        subclass.armorProficiencies.length > 0) ||
                        (subclass.weaponProficiencies &&
                          subclass.weaponProficiencies.length > 0)) && (
                        <div
                          style={{
                            fontSize: '12px',
                            opacity: 0.8,
                            marginTop: '4px',
                          }}
                        >
                          {subclass.armorProficiencies &&
                            subclass.armorProficiencies.length > 0 && (
                              <div>
                                +{' '}
                                {subclass.armorProficiencies
                                  .map((p: Armor) => String(p))
                                  .join(', ')}
                              </div>
                            )}
                          {subclass.weaponProficiencies &&
                            subclass.weaponProficiencies.length > 0 && (
                              <div>
                                +{' '}
                                {subclass.weaponProficiencies
                                  .map((p: Weapon) => String(p))
                                  .join(', ')}
                              </div>
                            )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Subclass Display */}
              {currentSubclass && (
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <h3
                    style={{
                      color: accentPrimary,
                      fontSize: '28px',
                      fontWeight: 'bold',
                      margin: '0',
                      fontFamily: 'Cinzel, serif',
                    }}
                  >
                    {currentSubclass.name}
                  </h3>
                </div>
              )}
            </section>
          )}

          {/* Section 3: Class Details */}
          <section
            style={{
              padding: '24px',
              borderBottom: `1px solid ${borderPrimary}`,
              backgroundColor: expandedSections.details ? cardBg : bgSecondary,
              transition: 'all 0.3s ease',
            }}
          >
            <button
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  details: !prev.details,
                }))
              }
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginBottom: expandedSections.details ? '20px' : '0',
              }}
            >
              <h3
                style={{
                  color: textPrimary,
                  fontSize: '24px',
                  fontWeight: 'bold',
                  margin: '0',
                  fontFamily: 'Cinzel, serif',
                }}
              >
                Class Details
              </h3>
              <div
                style={{
                  color: textMuted,
                  fontSize: '20px',
                  transform: expandedSections.details
                    ? 'rotate(90deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.3s ease',
                }}
              >
                ▶
              </div>
            </button>

            {expandedSections.details && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                {/* Description */}
                {currentDisplayData?.description && (
                  <div>
                    <h4
                      style={{
                        color: textPrimary,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                        fontFamily: 'Cinzel, serif',
                      }}
                    >
                      Description
                    </h4>
                    <p
                      style={{
                        color: textPrimary,
                        fontSize: '16px',
                        lineHeight: '1.6',
                        margin: '0',
                        padding: '12px',
                        backgroundColor: bgSecondary,
                        borderRadius: '8px',
                        border: `1px solid ${borderPrimary}`,
                      }}
                    >
                      {currentDisplayData.description}
                    </p>
                  </div>
                )}

                {/* Core Info Grid */}
                <div>
                  <h4
                    style={{
                      color: textPrimary,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      marginBottom: '12px',
                      fontFamily: 'Cinzel, serif',
                    }}
                  >
                    Core Information
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: bgSecondary,
                        borderRadius: '8px',
                        border: `1px solid ${borderPrimary}`,
                      }}
                    >
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '14px',
                          fontWeight: 'bold',
                          marginBottom: '8px',
                        }}
                      >
                        Hit Die & Abilities
                      </div>
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '14px',
                          marginBottom: '4px',
                        }}
                      >
                        <strong>Hit Die:</strong> {selectedClass!.hitDie}
                      </div>
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '14px',
                          marginBottom: '4px',
                        }}
                      >
                        <strong>Primary:</strong>{' '}
                        {selectedClass!.primaryAbility}
                      </div>
                      <div style={{ color: textPrimary, fontSize: '14px' }}>
                        <strong>Saves:</strong>{' '}
                        {selectedClass!.savingThrowProficiencies
                          .map((save) => getSavingThrowDisplay(save))
                          .join(', ')}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: bgSecondary,
                        borderRadius: '8px',
                        border: `1px solid ${borderPrimary}`,
                      }}
                    >
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '14px',
                          fontWeight: 'bold',
                          marginBottom: '8px',
                        }}
                      >
                        Skill Selection
                      </div>
                      {(() => {
                        const skillChoice = choicesSource?.find(
                          (choice) =>
                            choice.choiceType === ChoiceCategory.SKILLS
                        );
                        if (!skillChoice)
                          return (
                            <div
                              style={{
                                color: textPrimary,
                                fontSize: '14px',
                                opacity: 0.8,
                              }}
                            >
                              No skill choices available
                            </div>
                          );

                        const skillOptions =
                          skillChoice.options?.case === 'skillOptions'
                            ? skillChoice.options.value.available.map(
                                (skill: Skill) => Skill[skill]
                              )
                            : [];

                        return (
                          <>
                            <div
                              style={{
                                color: textPrimary,
                                fontSize: '14px',
                                marginBottom: '4px',
                              }}
                            >
                              <strong>Choose:</strong> {skillChoice.chooseCount}{' '}
                              skills
                            </div>
                            <div
                              style={{
                                color: textPrimary,
                                fontSize: '14px',
                                opacity: 0.9,
                              }}
                            >
                              <strong>From:</strong>{' '}
                              {skillOptions.slice(0, 4).join(', ')}
                              {skillOptions.length > 4 &&
                                ` +${skillOptions.length - 4} more`}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Proficiencies */}
                <div>
                  <h4
                    style={{
                      color: textPrimary,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      marginBottom: '12px',
                      fontFamily: 'Cinzel, serif',
                    }}
                  >
                    Proficiencies
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {selectedClass!.armorProficiencyCategories &&
                      selectedClass!.armorProficiencyCategories.length > 0 && (
                        <div
                          style={{
                            padding: '12px',
                            backgroundColor: bgSecondary,
                            borderRadius: '8px',
                            border: `1px solid ${borderPrimary}`,
                          }}
                        >
                          <div
                            style={{
                              color: textPrimary,
                              fontSize: '12px',
                              fontWeight: 'bold',
                              marginBottom: '6px',
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
                            {selectedClass!.armorProficiencyCategories
                              .map((p) => getArmorProficiencyCategoryDisplay(p))
                              .join(', ')}
                          </div>
                        </div>
                      )}

                    {selectedClass!.weaponProficiencyCategories &&
                      selectedClass!.weaponProficiencyCategories.length > 0 && (
                        <div
                          style={{
                            padding: '12px',
                            backgroundColor: bgSecondary,
                            borderRadius: '8px',
                            border: `1px solid ${borderPrimary}`,
                          }}
                        >
                          <div
                            style={{
                              color: textPrimary,
                              fontSize: '12px',
                              fontWeight: 'bold',
                              marginBottom: '6px',
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
                            {selectedClass!.weaponProficiencyCategories
                              .slice(0, 3)
                              .map((p) =>
                                getWeaponProficiencyCategoryDisplay(p)
                              )
                              .join(', ')}
                            {selectedClass!.weaponProficiencyCategories.length >
                              3 &&
                              ` +${selectedClass!.weaponProficiencyCategories.length - 3} more`}
                          </div>
                        </div>
                      )}

                    {selectedClass!.toolProficiencies &&
                      selectedClass!.toolProficiencies.length > 0 && (
                        <div
                          style={{
                            padding: '12px',
                            backgroundColor: bgSecondary,
                            borderRadius: '8px',
                            border: `1px solid ${borderPrimary}`,
                          }}
                        >
                          <div
                            style={{
                              color: textPrimary,
                              fontSize: '12px',
                              fontWeight: 'bold',
                              marginBottom: '6px',
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
                            {selectedClass!.toolProficiencies.join(', ')}
                          </div>
                        </div>
                      )}
                  </div>
                </div>

                {/* Starting Equipment - Field no longer exists in ClassInfo */}

                {/* Spellcasting Info */}
                {selectedClass!.spellcasting && (
                  <div>
                    <h4
                      style={{
                        color: textPrimary,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                        fontFamily: 'Cinzel, serif',
                      }}
                    >
                      🔮 Spellcasting
                    </h4>
                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: bgSecondary,
                        borderRadius: '8px',
                        border: `1px solid ${accentPrimary}`,
                        fontSize: '14px',
                      }}
                    >
                      <div style={{ color: textPrimary, marginBottom: '8px' }}>
                        <strong>Ability:</strong>{' '}
                        {selectedClass!.spellcasting.spellcastingAbility}
                      </div>
                      <div style={{ color: textPrimary, marginBottom: '8px' }}>
                        <strong>Cantrips Known:</strong>{' '}
                        {selectedClass!.spellcasting.cantripsKnown}
                      </div>
                      <div style={{ color: textPrimary }}>
                        <strong>1st Level Slots:</strong>{' '}
                        {selectedClass!.spellcasting.spellSlotsLevel1}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 4: Additional Choices */}
          {(() => {
            const hasAnyChoices = choicesSource && choicesSource.length > 0;
            if (!hasAnyChoices) return null;

            return (
              <section
                style={{
                  padding: '24px',
                  borderBottom: `1px solid ${borderPrimary}`,
                  backgroundColor: expandedSections.choices
                    ? cardBg
                    : bgSecondary,
                  transition: 'all 0.3s ease',
                }}
              >
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      choices: !prev.choices,
                    }))
                  }
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: expandedSections.choices ? '20px' : '0',
                  }}
                >
                  <h3
                    style={{
                      color: textPrimary,
                      fontSize: '24px',
                      fontWeight: 'bold',
                      margin: '0',
                      fontFamily: 'Cinzel, serif',
                    }}
                  >
                    Additional Choices
                  </h3>
                  <div
                    style={{
                      color: textMuted,
                      fontSize: '20px',
                      transform: expandedSections.choices
                        ? 'rotate(90deg)'
                        : 'rotate(0deg)',
                      transition: 'transform 0.3s ease',
                    }}
                  >
                    ▶
                  </div>
                </button>

                {expandedSections.choices && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                    }}
                  >
                    {/* Skill Proficiency Choices */}
                    {(() => {
                      const skillChoices =
                        choicesSource?.filter(
                          (choice) =>
                            choice.choiceType === ChoiceCategory.SKILLS
                        ) || [];

                      if (skillChoices.length === 0) return null;

                      return (
                        <div>
                          <h4
                            style={{
                              color: textPrimary,
                              fontSize: '18px',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              fontFamily: 'Cinzel, serif',
                            }}
                          >
                            Choose Your Skills{' '}
                            <span
                              style={{ color: '#ef4444', fontSize: '16px' }}
                            >
                              *
                            </span>
                          </h4>
                          {skillChoices.map((choice) => (
                            <div
                              key={choice.id}
                              style={{ marginBottom: '16px' }}
                            >
                              <ChoiceRenderer
                                choice={choice}
                                currentSelections={
                                  currentClassChoices.skills?.find(
                                    (sc) => sc.choiceId === choice.id
                                  )?.skills || []
                                }
                                onSelectionChange={(_choiceId, selections) => {
                                  // selections are now Skill enums directly
                                  const skillEnums = selections as Skill[];

                                  setClassChoicesMap((prev) => {
                                    const currentChoices = prev[choiceKey] || {
                                      skills: [],
                                      equipment: [],
                                      features: [],
                                    };
                                    const updatedSkills =
                                      currentChoices.skills?.filter(
                                        (sc) => sc.choiceId !== choice.id
                                      ) || [];

                                    if (skillEnums.length > 0) {
                                      updatedSkills.push({
                                        choiceId: choice.id,
                                        skills: skillEnums,
                                      });
                                    }

                                    return {
                                      ...prev,
                                      [choiceKey]: {
                                        ...currentChoices,
                                        skills: updatedSkills,
                                      },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Class Features */}
                    {(() => {
                      const featureChoices =
                        choicesSource?.filter(
                          (choice) =>
                            choice.choiceType === ChoiceCategory.FIGHTING_STYLE
                        ) || [];

                      if (featureChoices.length === 0) return null;

                      return (
                        <div>
                          <h4
                            style={{
                              color: textPrimary,
                              fontSize: '18px',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              fontFamily: 'Cinzel, serif',
                            }}
                          >
                            Choose Your Features{' '}
                            <span
                              style={{ color: '#ef4444', fontSize: '16px' }}
                            >
                              *
                            </span>
                          </h4>
                          {featureChoices.map((choice) => (
                            <div
                              key={choice.id}
                              style={{ marginBottom: '16px' }}
                            >
                              <ChoiceRenderer
                                choice={choice}
                                currentSelections={
                                  currentClassChoices.features?.find(
                                    (fc) => fc.choiceId === choice.id
                                  )?.selection
                                    ? [
                                        currentClassChoices.features.find(
                                          (fc) => fc.choiceId === choice.id
                                        )!.selection,
                                      ]
                                    : []
                                }
                                onSelectionChange={(_choiceId, selections) => {
                                  setClassChoicesMap((prev) => {
                                    const currentChoices = prev[choiceKey] || {
                                      skills: [],
                                      equipment: [],
                                      features: [],
                                    };
                                    const updatedFeatures =
                                      currentChoices.features?.filter(
                                        (fc) => fc.choiceId !== choice.id
                                      ) || [];

                                    if (selections.length > 0) {
                                      const feature = {
                                        choiceId: choice.id,
                                        featureId: choice.id,
                                        selection: selections[0], // Fighting style is single choice
                                      };
                                      updatedFeatures.push(feature);
                                    }

                                    return {
                                      ...prev,
                                      [choiceKey]: {
                                        ...currentChoices,
                                        features: updatedFeatures,
                                      },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Equipment Choices */}
                    {(() => {
                      const equipmentChoices =
                        choicesSource?.filter(
                          (choice) =>
                            choice.choiceType === ChoiceCategory.EQUIPMENT
                        ) || [];

                      if (equipmentChoices.length === 0) return null;

                      return (
                        <div>
                          <h4
                            style={{
                              color: textPrimary,
                              fontSize: '18px',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              fontFamily: 'Cinzel, serif',
                            }}
                          >
                            Choose Your Equipment{' '}
                            <span
                              style={{ color: '#ef4444', fontSize: '16px' }}
                            >
                              *
                            </span>
                          </h4>
                          {equipmentChoices.map((choice) => (
                            <div
                              key={choice.id}
                              style={{ marginBottom: '16px' }}
                            >
                              <ChoiceRenderer
                                choice={choice}
                                currentSelections={
                                  currentClassChoices.equipment?.find(
                                    (ec) => ec.choiceId === choice.id
                                  )?.bundleId
                                    ? [
                                        currentClassChoices.equipment?.find(
                                          (ec) => ec.choiceId === choice.id
                                        )?.bundleId,
                                      ]
                                    : ([] as string[])
                                }
                                onSelectionChange={(_choiceId, selections) => {
                                  setClassChoicesMap((prev) => {
                                    const currentChoices = prev[choiceKey] || {
                                      skills: [],
                                      equipment: [],
                                      features: [],
                                    };
                                    const updatedEquipment =
                                      currentChoices.equipment?.filter(
                                        (ec) => ec.choiceId !== choice.id
                                      ) || [];

                                    if (selections.length > 0) {
                                      // Extract bundleId from the first selection
                                      const firstSel = selections[0];
                                      const bundleId = firstSel.split(':')[0];

                                      // Parse category selections from remaining items
                                      // Format: "cat{index}:{id}:{name}"
                                      const categorySelections: Array<{
                                        categoryIndex: number;
                                        equipmentIds: string[];
                                      }> = [];

                                      selections
                                        .slice(1)
                                        .forEach((sel: string) => {
                                          if (sel.startsWith('cat')) {
                                            const parts = sel.split(':');
                                            const catIndex = parseInt(
                                              parts[0].replace('cat', '')
                                            );
                                            const equipId = parts[1];

                                            // Find or create category entry
                                            let catEntry =
                                              categorySelections.find(
                                                (c) =>
                                                  c.categoryIndex === catIndex
                                              );
                                            if (!catEntry) {
                                              catEntry = {
                                                categoryIndex: catIndex,
                                                equipmentIds: [],
                                              };
                                              categorySelections.push(catEntry);
                                            }
                                            catEntry.equipmentIds.push(equipId);
                                          }
                                        });

                                      const equipmentChoice: EquipmentChoice = {
                                        choiceId: choice.id,
                                        bundleId: bundleId,
                                        categorySelections,
                                      };
                                      updatedEquipment.push(equipmentChoice);
                                    }

                                    return {
                                      ...prev,
                                      [choiceKey]: {
                                        ...currentChoices,
                                        equipment: updatedEquipment,
                                      },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Language Choices */}
                    {(() => {
                      const languageChoices =
                        choicesSource?.filter(
                          (choice) =>
                            choice.choiceType === ChoiceCategory.LANGUAGES
                        ) || [];

                      if (languageChoices.length === 0) return null;

                      return (
                        <div>
                          <h4
                            style={{
                              color: textPrimary,
                              fontSize: '18px',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              fontFamily: 'Cinzel, serif',
                            }}
                          >
                            Choose Your Languages{' '}
                            <span
                              style={{ color: '#ef4444', fontSize: '16px' }}
                            >
                              *
                            </span>
                          </h4>
                          {languageChoices.map((choice) => (
                            <div
                              key={choice.id}
                              style={{ marginBottom: '16px' }}
                            >
                              <ChoiceRenderer
                                choice={choice}
                                currentSelections={
                                  currentClassChoices.languages?.find(
                                    (lc) => lc.choiceId === choice.id
                                  )?.languages || []
                                }
                                onSelectionChange={(_choiceId, selections) => {
                                  // selections are now Language enums directly
                                  const languageEnums =
                                    selections as Language[];

                                  setClassChoicesMap((prev) => {
                                    const currentChoices = prev[choiceKey] || {
                                      skills: [],
                                      languages: [],
                                      equipment: [],
                                      features: [],
                                      expertise: [],
                                      traits: [],
                                      proficiencies: [],
                                    };
                                    const updatedLanguages =
                                      currentChoices.languages?.filter(
                                        (lc) => lc.choiceId !== choice.id
                                      ) || [];

                                    if (languageEnums.length > 0) {
                                      updatedLanguages.push({
                                        choiceId: choice.id,
                                        languages: languageEnums,
                                      });
                                    }

                                    return {
                                      ...prev,
                                      [choiceKey]: {
                                        ...currentChoices,
                                        languages: updatedLanguages,
                                      },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Other Choice Types (Tools, Weapon Proficiencies, etc.) */}
                    {(() => {
                      const otherChoices =
                        choicesSource?.filter(
                          (choice) =>
                            choice.choiceType !== ChoiceCategory.SKILLS &&
                            choice.choiceType !== ChoiceCategory.LANGUAGES &&
                            choice.choiceType !== ChoiceCategory.EQUIPMENT &&
                            choice.choiceType !== ChoiceCategory.FIGHTING_STYLE
                        ) || [];

                      if (otherChoices.length === 0) return null;

                      return (
                        <div>
                          <h4
                            style={{
                              color: textPrimary,
                              fontSize: '18px',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              fontFamily: 'Cinzel, serif',
                            }}
                          >
                            Other Choices
                          </h4>
                          {otherChoices.map((choice) => (
                            <div
                              key={choice.id}
                              style={{ marginBottom: '16px' }}
                            >
                              <ChoiceRenderer
                                choice={choice}
                                currentSelections={[]}
                                onSelectionChange={(_choiceId, selections) => {
                                  console.log(
                                    'Other choice selection:',
                                    choice.choiceType,
                                    selections
                                  );
                                  // TODO: Properly handle these choice types when UI patterns are established
                                  // For now, store them in proficiencies array as strings
                                  setClassChoicesMap((prev) => {
                                    const currentChoices = prev[choiceKey] || {
                                      skills: [],
                                      languages: [],
                                      equipment: [],
                                      features: [],
                                      expertise: [],
                                      traits: [],
                                      proficiencies: [],
                                    };

                                    // Store selections as strings in proficiencies for now
                                    const updatedProficiencies = [
                                      ...(currentChoices.proficiencies || []),
                                      ...selections.map(
                                        (s: string) => `${choice.id}:${s}`
                                      ),
                                    ];

                                    return {
                                      ...prev,
                                      [choiceKey]: {
                                        ...currentChoices,
                                        proficiencies: updatedProficiencies,
                                      },
                                    };
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </section>
            );
          })()}
        </div>

        {/* Footer with action buttons */}
        <div
          style={{
            padding: '20px 24px',
            borderTop: `2px solid ${borderPrimary}`,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: cardBg,
          }}
        >
          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                margin: '0 0 16px 0',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '14px',
                textAlign: 'center',
                fontWeight: 'bold',
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
                border: `2px solid ${borderPrimary}`,
                borderRadius: '8px',
                padding: '12px 24px',
                cursor: 'pointer',
                color: textPrimary,
                fontSize: '16px',
                fontWeight: 'bold',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = accentPrimary;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = borderPrimary;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSelect}
              style={{
                background: accentPrimary,
                border: 'none',
                borderRadius: '8px',
                padding: '12px 32px',
                cursor: 'pointer',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
              }}
            >
              Select{' '}
              {currentSubclass ? currentSubclass.name : selectedClass?.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
