import type { ClassInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useListClasses } from '../../api/hooks';
import { ChoiceSelector } from '../../components/ChoiceSelector';
import { getChoiceKey, validateChoice } from '../../types/character';

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
  onSelect: (classData: ClassInfo, choices: ClassChoices) => void;
  onClose: () => void;
}

interface ClassChoices {
  proficiencies: Record<string, string[]>;
}

export function ClassSelectionModal({
  isOpen,
  currentClass,
  onSelect,
  onClose,
}: ClassSelectionModalProps) {
  const { data: classes, loading, error } = useListClasses();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (currentClass && classes.length > 0) {
      const index = classes.findIndex((cls) => cls.name === currentClass);
      return index >= 0 ? index : 0;
    }
    return 0;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<
    'left' | 'right'
  >('right');

  // Track choices
  const [proficiencyChoices, setProficiencyChoices] = useState<
    Record<string, string[]>
  >({});

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
  const nextClassData = classes[(selectedIndex + 1) % classes.length];
  const prevClassData =
    classes[(selectedIndex - 1 + classes.length) % classes.length];

  const nextClass = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setAnimationDirection('right');
    setTimeout(() => {
      setSelectedIndex((prev) => (prev + 1) % classes.length);
      setIsTransitioning(false);
      // Clear choices when switching classes
      setProficiencyChoices({});
    }, 150);
  };

  const prevClass = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setAnimationDirection('left');
    setTimeout(() => {
      setSelectedIndex((prev) => (prev - 1 + classes.length) % classes.length);
      setIsTransitioning(false);
      // Clear choices when switching classes
      setProficiencyChoices({});
    }, 150);
  };

  const handleSelect = () => {
    // Validate all choices are made
    const hasProficiencyChoices =
      currentClassData.proficiencyChoices &&
      currentClassData.proficiencyChoices.length > 0;

    if (hasProficiencyChoices) {
      for (let i = 0; i < currentClassData.proficiencyChoices.length; i++) {
        const choice = currentClassData.proficiencyChoices[i];
        const key = getChoiceKey(choice, i);
        const selected = proficiencyChoices[key] || [];
        const validation = validateChoice(choice, selected);
        if (!validation.isValid) {
          alert(validation.errors.join('\n'));
          return;
        }
      }
    }

    onSelect(currentClassData, {
      proficiencies: proficiencyChoices,
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

        {/* Carousel */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <button
              onClick={prevClass}
              style={{
                background: bgSecondary,
                border: `1px solid ${borderPrimary}`,
                borderRadius: '12px',
                width: '60px',
                height: '60px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.backgroundColor = getCSSVariable(
                  '--accent-primary-hover',
                  '#1d4ed8'
                );
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = bgSecondary;
              }}
              title={`Previous: ${prevClassData.name}`}
            >
              <div style={{ fontSize: '20px' }}>
                {getClassEmoji(prevClassData.name)}
              </div>
              <div style={{ fontSize: '10px', color: textMuted }}>←</div>
            </button>

            <div
              style={{
                flex: 1,
                maxWidth: '300px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  transform: isTransitioning
                    ? animationDirection === 'right'
                      ? 'translateX(-100%)'
                      : 'translateX(100%)'
                    : 'translateX(0)',
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  opacity: isTransitioning ? 0 : 1,
                  transitionProperty: 'transform, opacity',
                  transitionDuration: '0.3s',
                }}
              >
                <div style={{ fontSize: '64px', marginBottom: '8px' }}>
                  {getClassEmoji(currentClassData.name)}
                </div>
                <h3
                  style={{
                    color: textPrimary,
                    fontSize: '28px',
                    fontWeight: 'bold',
                    margin: '0 0 8px 0',
                    fontFamily: 'Cinzel, serif',
                  }}
                >
                  {currentClassData.name}
                </h3>
                <p style={{ color: textMuted, fontSize: '14px', margin: 0 }}>
                  {selectedIndex + 1} of {classes.length}
                </p>
              </div>
            </div>

            <button
              onClick={nextClass}
              style={{
                background: bgSecondary,
                border: `1px solid ${borderPrimary}`,
                borderRadius: '12px',
                width: '60px',
                height: '60px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.backgroundColor = getCSSVariable(
                  '--accent-primary-hover',
                  '#1d4ed8'
                );
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = bgSecondary;
              }}
              title={`Next: ${nextClassData.name}`}
            >
              <div style={{ fontSize: '20px' }}>
                {getClassEmoji(nextClassData.name)}
              </div>
              <div style={{ fontSize: '10px', color: textMuted }}>→</div>
            </button>
          </div>
        </div>

        {/* Details */}
        <div
          style={{
            marginBottom: '24px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              transform: isTransitioning
                ? animationDirection === 'right'
                  ? 'translateX(-20px)'
                  : 'translateX(20px)'
                : 'translateX(0)',
              opacity: isTransitioning ? 0.3 : 1,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div style={{ marginBottom: '24px' }}>
              <h4
                style={{
                  color: textPrimary,
                  fontWeight: 'bold',
                  marginBottom: '8px',
                }}
              >
                Description
              </h4>
              <p
                style={{
                  color: textPrimary,
                  fontSize: '16px',
                  lineHeight: '1.5',
                }}
              >
                {currentClassData.description}
              </p>
            </div>

            {/* Core Info Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '20px',
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
                  style={{ fontSize: '14px', color: textPrimary, opacity: 0.9 }}
                >
                  {currentClassData.availableSkills.slice(0, 6).join(', ')}
                  {currentClassData.availableSkills.length > 6 &&
                    ` +${currentClassData.availableSkills.length - 6} more`}
                </div>
              </div>
            </div>

            {/* Proficiencies Section */}
            <div style={{ marginBottom: '20px' }}>
              <h4
                style={{
                  color: textPrimary,
                  fontWeight: 'bold',
                  marginBottom: '12px',
                }}
              >
                Proficiencies
              </h4>
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
            </div>

            {/* Proficiency Choices */}
            {currentClassData.proficiencyChoices &&
              currentClassData.proficiencyChoices.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4
                    style={{
                      color: textPrimary,
                      fontWeight: 'bold',
                      marginBottom: '12px',
                    }}
                  >
                    Choose Your Proficiencies
                  </h4>
                  {currentClassData.proficiencyChoices.map((choice, index) => (
                    <div key={index} style={{ marginBottom: '16px' }}>
                      <ChoiceSelector
                        choice={choice}
                        selected={
                          proficiencyChoices[getChoiceKey(choice, index)] || []
                        }
                        onSelectionChange={(selected) => {
                          const key = getChoiceKey(choice, index);
                          setProficiencyChoices({
                            ...proficiencyChoices,
                            [key]: selected,
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

            {/* Equipment Options (Display Only) */}
            {currentClassData.equipmentChoices &&
              currentClassData.equipmentChoices.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4
                    style={{
                      color: textPrimary,
                      fontWeight: 'bold',
                      marginBottom: '12px',
                    }}
                  >
                    Equipment Options
                  </h4>
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: bgSecondary,
                      borderRadius: '6px',
                      border: `1px solid ${borderPrimary}`,
                    }}
                  >
                    {currentClassData.equipmentChoices.map(
                      (equipChoice, index) => (
                        <div
                          key={index}
                          style={{
                            marginBottom:
                              index <
                              currentClassData.equipmentChoices.length - 1
                                ? '12px'
                                : 0,
                          }}
                        >
                          <p
                            style={{
                              color: textPrimary,
                              fontSize: '13px',
                              fontWeight: 'bold',
                              marginBottom: '4px',
                            }}
                          >
                            {equipChoice.description}
                          </p>
                          <div style={{ paddingLeft: '12px' }}>
                            {equipChoice.options.map((option, optIdx) => (
                              <div
                                key={optIdx}
                                style={{
                                  color: textPrimary,
                                  fontSize: '14px',
                                  marginBottom: '4px',
                                  opacity: 0.9,
                                }}
                              >
                                • {option}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                    <p
                      style={{
                        color: textMuted,
                        fontSize: '13px',
                        fontStyle: 'italic',
                        marginTop: '8px',
                      }}
                    >
                      * You'll choose your equipment in a later step
                    </p>
                  </div>
                </div>
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
