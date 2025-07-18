import type { RaceInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useListRaces } from '../../api/hooks';
import { ChoiceSelector } from '../../components/ChoiceSelector';
import { CollapsibleSection } from '../../components/CollapsibleSection';
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

// Helper function to get race emoji based on name
function getRaceEmoji(raceName: string): string {
  const raceEmojiMap: Record<string, string> = {
    Human: '👨',
    Elf: '🧝',
    Dwarf: '🧔',
    Halfling: '🧙',
    Dragonborn: '🐉',
    Gnome: '🧞',
    'Half-Elf': '🧝‍♂️',
    'Half-Orc': '🗡️',
    Tiefling: '😈',
  };
  return raceEmojiMap[raceName] || '🧝';
}

// Hardcoded descriptions for races since API doesn't provide them
function getRaceDescription(raceName: string): string {
  const raceDescriptions: Record<string, string> = {
    Human:
      'Versatile and ambitious, humans are the most adaptable of the common races. They have the drive to achieve great things in their relatively short lifespans.',
    Elf: 'Elves are magical people of otherworldly grace, living in harmony with the natural world. They love nature, music, art, and magic.',
    Dwarf:
      'Bold and hardy, dwarves are renowned for their skill as warriors, miners, and workers of stone and metal. They live in mountainous regions.',
    Halfling:
      'Small but brave, halflings are an affable and cheerful folk. They prefer the comforts of home to dangerous adventures.',
    Dragonborn:
      'Born of dragons, dragonborn walk proudly through a world that greets them with fearful incomprehension.',
    Gnome:
      "Small, clever, and energetic, gnomes use their long lives to explore the world's brightest possibilities.",
    'Half-Elf':
      'Walking in two worlds but belonging to neither, half-elves combine human curiosity with elven grace.',
    'Half-Orc':
      'Whether united under the leadership of a mighty warlock or scattered, half-orcs often struggle with their dual nature.',
    Tiefling:
      'Bearing a curse from an infernal heritage, tieflings face constant suspicion wherever they go.',
  };
  return (
    raceDescriptions[raceName] ||
    'A fascinating race with unique traits and abilities.'
  );
}

interface RaceSelectionModalProps {
  isOpen: boolean;
  currentRace?: string;
  onSelect: (race: RaceInfo, choices: RaceChoices) => void;
  onClose: () => void;
}

export interface RaceChoices {
  languages: Record<string, string[]>;
  proficiencies: Record<string, string[]>;
}

export function RaceSelectionModal({
  isOpen,
  currentRace,
  onSelect,
  onClose,
}: RaceSelectionModalProps) {
  const { data: races, loading, error } = useListRaces();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (currentRace && races.length > 0) {
      const index = races.findIndex((race) => race.name === currentRace);
      return index >= 0 ? index : 0;
    }
    return 0;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<
    'left' | 'right'
  >('right');

  // Track choices
  const [languageChoices, setLanguageChoices] = useState<
    Record<string, string[]>
  >({});
  const [proficiencyChoices, setProficiencyChoices] = useState<
    Record<string, string[]>
  >({});

  // Reset choices when modal opens
  useEffect(() => {
    if (isOpen) {
      setLanguageChoices({});
      setProficiencyChoices({});
    }
  }, [isOpen]);

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
        <div style={{ color: 'white', fontSize: '18px' }}>Loading races...</div>
      </div>,
      document.body
    );
  }

  if (error || races.length === 0) {
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
            ? `Error loading races: ${error.message}`
            : 'No races available'}
        </div>
      </div>,
      document.body
    );
  }

  const currentRaceData = races[selectedIndex];
  const nextRaceData = races[(selectedIndex + 1) % races.length];
  const prevRaceData = races[(selectedIndex - 1 + races.length) % races.length];

  const nextRace = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setAnimationDirection('right');
    setTimeout(() => {
      setSelectedIndex((prev) => (prev + 1) % races.length);
      setIsTransitioning(false);
      // Clear choices when switching races
      setLanguageChoices({});
      setProficiencyChoices({});
    }, 150);
  };

  const prevRace = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setAnimationDirection('left');
    setTimeout(() => {
      setSelectedIndex((prev) => (prev - 1 + races.length) % races.length);
      setIsTransitioning(false);
      // Clear choices when switching races
      setLanguageChoices({});
      setProficiencyChoices({});
    }, 150);
  };

  const handleSelect = () => {
    // Validate all choices are made
    const hasLanguageChoice = currentRaceData.languageOptions;
    const hasProficiencyChoices =
      currentRaceData.proficiencyOptions &&
      currentRaceData.proficiencyOptions.length > 0;

    if (hasLanguageChoice && currentRaceData.languageOptions) {
      const key = getChoiceKey(currentRaceData.languageOptions, 0);
      const selected = languageChoices[key] || [];
      const validation = validateChoice(
        currentRaceData.languageOptions,
        selected
      );
      if (!validation.isValid) {
        alert(validation.errors.join('\n'));
        return;
      }
    }

    if (hasProficiencyChoices) {
      for (let i = 0; i < currentRaceData.proficiencyOptions.length; i++) {
        const choice = currentRaceData.proficiencyOptions[i];
        const key = getChoiceKey(choice, i);
        const selected = proficiencyChoices[key] || [];
        const validation = validateChoice(choice, selected);
        if (!validation.isValid) {
          alert(validation.errors.join('\n'));
          return;
        }
      }
    }

    onSelect(currentRaceData, {
      languages: languageChoices,
      proficiencies: proficiencyChoices,
    });
    onClose();
  };

  if (!isOpen) return null;

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
            Choose Your Race
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
              onClick={prevRace}
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
              title={`Previous: ${prevRaceData.name}`}
            >
              <div style={{ fontSize: '20px' }}>
                {getRaceEmoji(prevRaceData.name)}
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
                  {getRaceEmoji(currentRaceData.name)}
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
                  {currentRaceData.name}
                </h3>
                <p style={{ color: textMuted, fontSize: '14px', margin: 0 }}>
                  {selectedIndex + 1} of {races.length}
                </p>
              </div>
            </div>

            <button
              onClick={nextRace}
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
              title={`Next: ${nextRaceData.name}`}
            >
              <div style={{ fontSize: '20px' }}>
                {getRaceEmoji(nextRaceData.name)}
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
            <div style={{ marginBottom: '20px' }}>
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
                  fontSize: '15px',
                  lineHeight: '1.5',
                }}
              >
                {currentRaceData.description ||
                  getRaceDescription(currentRaceData.name)}
              </p>
            </div>

            {/* Enhanced Descriptions */}
            {(currentRaceData.ageDescription ||
              currentRaceData.alignmentDescription ||
              currentRaceData.sizeDescription) && (
              <div style={{ marginBottom: '20px' }}>
                {currentRaceData.ageDescription && (
                  <div style={{ marginBottom: '12px' }}>
                    <h5
                      style={{
                        color: textPrimary,
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }}
                    >
                      Age
                    </h5>
                    <p
                      style={{
                        color: textPrimary,
                        fontSize: '13px',
                        lineHeight: '1.4',
                        opacity: 0.9,
                      }}
                    >
                      {currentRaceData.ageDescription}
                    </p>
                  </div>
                )}
                {currentRaceData.alignmentDescription && (
                  <div style={{ marginBottom: '12px' }}>
                    <h5
                      style={{
                        color: textPrimary,
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }}
                    >
                      Alignment
                    </h5>
                    <p
                      style={{
                        color: textPrimary,
                        fontSize: '13px',
                        lineHeight: '1.4',
                        opacity: 0.9,
                      }}
                    >
                      {currentRaceData.alignmentDescription}
                    </p>
                  </div>
                )}
                {currentRaceData.sizeDescription && (
                  <div style={{ marginBottom: '12px' }}>
                    <h5
                      style={{
                        color: textPrimary,
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }}
                    >
                      Size Details
                    </h5>
                    <p
                      style={{
                        color: textPrimary,
                        fontSize: '13px',
                        lineHeight: '1.4',
                        opacity: 0.9,
                      }}
                    >
                      {currentRaceData.sizeDescription}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Core Stats */}
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
                  Ability Score Increases
                </h4>
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: bgSecondary,
                    borderRadius: '6px',
                    border: `1px solid ${borderPrimary}`,
                  }}
                >
                  {Object.entries(currentRaceData.abilityBonuses || {}).length >
                  0 ? (
                    Object.entries(currentRaceData.abilityBonuses || {}).map(
                      ([ability, bonus]) => (
                        <div
                          key={ability}
                          style={{
                            color: textPrimary,
                            fontSize: '13px',
                            marginBottom: '4px',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>
                            {ability.charAt(0).toUpperCase() + ability.slice(1)}
                          </span>
                          <span
                            style={{ color: accentPrimary, fontWeight: 'bold' }}
                          >
                            +{bonus}
                          </span>
                        </div>
                      )
                    )
                  ) : (
                    <div style={{ color: textMuted, fontSize: '14px' }}>
                      No ability bonuses
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4
                  style={{
                    color: textPrimary,
                    fontWeight: 'bold',
                    marginBottom: '8px',
                  }}
                >
                  Size & Movement
                </h4>
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
                      fontSize: '13px',
                      marginBottom: '4px',
                    }}
                  >
                    <strong>Size:</strong>{' '}
                    {currentRaceData.size === 1
                      ? 'Medium'
                      : currentRaceData.size === 2
                        ? 'Small'
                        : 'Medium'}
                  </div>
                  <div style={{ color: textPrimary, fontSize: '13px' }}>
                    <strong>Speed:</strong> {currentRaceData.speed} feet
                  </div>
                </div>
              </div>
            </div>

            {/* Languages */}
            {currentRaceData.languages &&
              currentRaceData.languages.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4
                    style={{
                      color: textPrimary,
                      fontWeight: 'bold',
                      marginBottom: '8px',
                    }}
                  >
                    Languages
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
                    {currentRaceData.languages.map((lang, i) => (
                      <span key={i}>
                        {typeof lang === 'string' ? lang : lang.toString()}
                        {i < currentRaceData.languages.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Language Choices */}
            {currentRaceData.languageOptions && (
              <div style={{ marginBottom: '20px' }}>
                <ChoiceSelector
                  choice={currentRaceData.languageOptions}
                  selected={
                    languageChoices[
                      getChoiceKey(currentRaceData.languageOptions, 0)
                    ] || []
                  }
                  onSelectionChange={(selected) => {
                    const key = getChoiceKey(
                      currentRaceData.languageOptions!,
                      0
                    );
                    setLanguageChoices({ ...languageChoices, [key]: selected });
                  }}
                />
              </div>
            )}

            {/* Proficiency Choices */}
            {currentRaceData.proficiencyOptions &&
              currentRaceData.proficiencyOptions.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {currentRaceData.proficiencyOptions.map((choice, index) => (
                    <ChoiceSelector
                      key={index}
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
                  ))}
                </div>
              )}

            {/* Racial Traits */}
            <CollapsibleSection title="Racial Traits" defaultOpen={true}>
              <div
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: bgSecondary,
                  borderRadius: '6px',
                  border: `1px solid ${borderPrimary}`,
                }}
              >
                {currentRaceData.traits && currentRaceData.traits.length > 0 ? (
                  currentRaceData.traits.map((trait, i) => (
                    <div key={i} style={{ marginBottom: '8px' }}>
                      <div
                        style={{
                          color: textPrimary,
                          fontSize: '13px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {trait.name}
                        {trait.isChoice && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 4px',
                              backgroundColor: accentPrimary,
                              color: 'white',
                              borderRadius: '3px',
                            }}
                          >
                            Choice
                          </span>
                        )}
                      </div>
                      {trait.description && (
                        <div
                          style={{
                            color: textPrimary,
                            fontSize: '14px',
                            lineHeight: '1.4',
                            opacity: 0.9,
                          }}
                        >
                          {trait.description}
                        </div>
                      )}
                      {trait.isChoice &&
                        trait.options &&
                        trait.options.length > 0 && (
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '13px',
                              color: textMuted,
                            }}
                          >
                            Options: {trait.options.join(', ')}
                          </div>
                        )}
                    </div>
                  ))
                ) : (
                  <div style={{ color: textMuted, fontSize: '14px' }}>
                    No racial traits available
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* Proficiencies */}
            {currentRaceData.proficiencies &&
              currentRaceData.proficiencies.length > 0 && (
                <CollapsibleSection title="Proficiencies" defaultOpen={false}>
                  <div
                    style={{
                      padding: '8px',
                      backgroundColor: bgSecondary,
                      borderRadius: '6px',
                      border: `1px solid ${borderPrimary}`,
                      fontSize: '14px',
                      color: textPrimary,
                      opacity: 0.9,
                      marginBottom: '12px',
                    }}
                  >
                    {currentRaceData.proficiencies.join(', ')}
                  </div>
                </CollapsibleSection>
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
            Select {currentRaceData.name}
          </button>
        </div>
      </div>
    </div>
  );

  // Render modal into document.body using a portal
  return createPortal(modalContent, document.body);
}
