import type { BackgroundInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Background,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListBackgrounds } from '../../api/hooks';
import { ChoiceRenderer } from '../../components/ChoiceRenderer';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import type {
  BackgroundModalChoices,
  EquipmentChoice,
} from '../../types/choices';
import {
  getLanguageDisplay,
  getSkillDisplay,
  getToolProficiencyDisplay,
} from '../../utils/enumDisplay';
import { isCompleteEquipmentChoice } from '../../utils/equipmentChoiceSelections';
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

// Helper function to get background emoji based on name
function getBackgroundEmoji(backgroundName: string): string {
  const backgroundEmojiMap: Record<string, string> = {
    Acolyte: '🙏',
    Criminal: '🗡️',
    'Folk Hero': '🛡️',
    Noble: '👑',
    Sage: '📚',
    Soldier: '⚔️',
    Hermit: '🧙',
    Entertainer: '🎭',
    Guild: '🔨',
    Outlander: '🏕️',
    Sailor: '⚓',
    Urchin: '🥷',
  };
  return backgroundEmojiMap[backgroundName] || '📜';
}

// Hardcoded descriptions for backgrounds since API doesn't provide them
function getBackgroundDescription(backgroundName: string): string {
  const backgroundDescriptions: Record<string, string> = {
    Acolyte:
      'You have spent your life in the service of a temple to a specific god or pantheon of gods.',
    Criminal:
      'You are an experienced criminal with a history of breaking the law.',
    'Folk Hero':
      'You come from a humble social rank, but you are destined for so much more.',
    Noble:
      'You understand wealth, power, and privilege. You carry a noble title, and your family owns land.',
    Sage: 'You spent years learning the lore of the multiverse, mastering various fields of study.',
    Soldier:
      'War has been your life for as long as you care to remember. You trained as a youth, studied tactics and strategy.',
    Hermit:
      'You lived in seclusion—either in a sheltered community such as a monastery, or entirely alone—for a formative part of your life.',
    Entertainer:
      'You thrive in front of an audience. You know how to entrance them, entertain them, and even inspire them.',
    Guild:
      "You are a member of an artisan's guild, skilled in a particular field and closely associated with other artisans.",
    Outlander:
      'You grew up in the wilds, far from civilization and the comforts of town and technology.',
    Sailor:
      'You sailed on a seagoing vessel for years. In that time, you faced down mighty storms and monsters of the deep.',
    Urchin:
      'You grew up on the streets alone, orphaned, and poor. You had to learn to provide for yourself.',
  };
  return (
    backgroundDescriptions[backgroundName] ||
    "A unique background that shapes your character's history and skills."
  );
}

interface BackgroundSelectionModalProps {
  isOpen: boolean;
  currentBackground?: Background | string;
  existingProficiencies?: Set<string>;
  existingLanguages?: Set<string>;
  existingChoices?: BackgroundModalChoices;
  onSelect: (
    background: BackgroundInfo,
    choices: BackgroundModalChoices
  ) => void;
  onClose: () => void;
}

export function BackgroundSelectionModal({
  isOpen,
  currentBackground,
  // existingProficiencies, // TODO: Use when implementing proficiency conflict detection
  // existingLanguages, // TODO: Use when implementing language conflict detection
  existingChoices,
  onSelect,
  onClose,
}: BackgroundSelectionModalProps) {
  const { data: backgrounds, loading, error } = useListBackgrounds();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Track choices per background, keyed by background name
  const [backgroundChoicesMap, setBackgroundChoicesMap] = useState<
    Record<string, BackgroundModalChoices>
  >({});

  // Set initial selected index based on current background
  useEffect(() => {
    if (currentBackground && backgrounds.length > 0) {
      const index = backgrounds.findIndex(
        (bg) => String(bg.backgroundId) === currentBackground
      );
      if (index >= 0) {
        setSelectedIndex(index);
      }
    }
  }, [currentBackground, backgrounds]);

  // Initialize choices for the current background from existingChoices, once
  useEffect(() => {
    if (isOpen && currentBackground && existingChoices) {
      const bg = backgrounds.find(
        (candidate) => String(candidate.backgroundId) === currentBackground
      );
      if (bg) {
        setBackgroundChoicesMap((prev) => ({
          ...prev,
          [bg.name]: existingChoices,
        }));
      }
    }
    // Only re-run when the modal opens for a given background/choices set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedBackground = backgrounds[selectedIndex];
  const choiceKey = selectedBackground?.name || '';
  const currentBackgroundChoices = backgroundChoicesMap[choiceKey] || {
    equipment: [],
    tools: [],
  };

  const handleConfirm = () => {
    if (!selectedBackground) {
      setErrorMessage('No background selected');
      return;
    }

    setErrorMessage('');

    const declaredChoices = selectedBackground.choices || [];

    const equipmentChoices = declaredChoices.filter(
      (choice) => choice.choiceType === ChoiceCategory.EQUIPMENT
    );
    for (const choice of equipmentChoices) {
      const equipmentChoice = currentBackgroundChoices.equipment?.find(
        (ec) => ec.choiceId === choice.id
      );
      if (!isCompleteEquipmentChoice(choice, equipmentChoice)) {
        setErrorMessage(
          `Please complete each equipment category: ${choice.description}`
        );
        return;
      }
    }

    const toolChoices = declaredChoices.filter(
      (choice) => choice.choiceType === ChoiceCategory.TOOLS
    );
    for (const choice of toolChoices) {
      const toolChoice = currentBackgroundChoices.tools?.find(
        (tc) => tc.choiceId === choice.id
      );
      const selected = toolChoice?.tools || [];
      if (selected.length !== choice.chooseCount) {
        setErrorMessage(
          `Please select ${choice.chooseCount} tool${choice.chooseCount > 1 ? 's' : ''}: ${choice.description}`
        );
        return;
      }
    }

    onSelect(selectedBackground, currentBackgroundChoices);
    onClose();
  };

  if (!isOpen) return null;

  // Inline styles for the portal elements
  const overlayStyles: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    backdropFilter: 'blur(4px)',
  };

  const modalStyles: React.CSSProperties = {
    backgroundColor: getCSSVariable('--bg-primary', '#1a1a1a'),
    maxWidth: '1200px',
    width: '90%',
    maxHeight: '85vh',
    borderRadius: '8px',
    border: `2px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    color: getCSSVariable('--text-primary', '#ffffff'),
  };

  const headerStyles: React.CSSProperties = {
    padding: '1.5rem',
    borderBottom: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const contentStyles: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  };

  const leftPanelStyles: React.CSSProperties = {
    flex: 1,
    borderRight: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const carouselContainerStyles: React.CSSProperties = {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: '0.875rem',
    color: getCSSVariable('--text-muted', '#999'),
    lineHeight: '1.4',
    marginTop: '0.5rem',
  };

  const rightPanelStyles: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const detailsContainerStyles: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
  };

  const footerStyles: React.CSSProperties = {
    padding: '1.5rem',
    borderTop: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
  };

  const buttonStyles: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const cancelButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: 'transparent',
    border: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    color: getCSSVariable('--text-primary', '#ffffff'),
  };

  const confirmButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: getCSSVariable('--accent-primary', '#5865F2'),
    border: 'none',
    color: 'white',
  };

  return createPortal(
    <div style={overlayStyles} onClick={onClose}>
      <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyles}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            Select Your Background
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: getCSSVariable('--text-muted', '#999'),
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={contentStyles}>
          <div style={leftPanelStyles}>
            <div style={carouselContainerStyles}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                Available Backgrounds
              </h3>
              {loading && <div>Loading backgrounds...</div>}
              {error && (
                <div style={{ color: '#ff4444' }}>
                  Error loading backgrounds: {error.message}
                </div>
              )}
              {!loading && !error && backgrounds.length > 0 && (
                <>
                  <VisualCarousel
                    items={backgrounds.map((bg) => ({
                      name: bg.name,
                      emoji: getBackgroundEmoji(bg.name),
                    }))}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                  />
                  {selectedBackground && (
                    <div style={descriptionStyles}>
                      {getBackgroundDescription(selectedBackground.name)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={rightPanelStyles}>
            <div style={detailsContainerStyles}>
              {selectedBackground && (
                <>
                  <h3
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      marginBottom: '1rem',
                    }}
                  >
                    {selectedBackground.name}
                  </h3>

                  {/* Show granted skill proficiencies */}
                  {selectedBackground.skillProficiencies &&
                    selectedBackground.skillProficiencies.length > 0 && (
                      <CollapsibleSection
                        title="Skill Proficiencies"
                        defaultOpen={true}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          {selectedBackground.skillProficiencies.map(
                            (skill, index) => (
                              <span
                                key={index}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  backgroundColor: getCSSVariable(
                                    '--bg-secondary',
                                    '#2a2a2a'
                                  ),
                                  borderRadius: '9999px',
                                  fontSize: '0.875rem',
                                }}
                              >
                                {getSkillDisplay(skill)}
                              </span>
                            )
                          )}
                        </div>
                      </CollapsibleSection>
                    )}

                  {/* Show granted languages */}
                  {selectedBackground.languages &&
                    selectedBackground.languages.length > 0 && (
                      <CollapsibleSection title="Languages" defaultOpen={true}>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          {selectedBackground.languages.map(
                            (language, index) => (
                              <span
                                key={index}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  backgroundColor: getCSSVariable(
                                    '--bg-secondary',
                                    '#2a2a2a'
                                  ),
                                  borderRadius: '9999px',
                                  fontSize: '0.875rem',
                                }}
                              >
                                {getLanguageDisplay(language)}
                              </span>
                            )
                          )}
                        </div>
                      </CollapsibleSection>
                    )}

                  {/* Show tool proficiencies */}
                  {selectedBackground.toolProficiencies &&
                    selectedBackground.toolProficiencies.length > 0 && (
                      <CollapsibleSection
                        title="Tool Proficiencies"
                        defaultOpen={true}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          {selectedBackground.toolProficiencies.map(
                            (tool, index) => (
                              <span
                                key={index}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  backgroundColor: getCSSVariable(
                                    '--bg-secondary',
                                    '#2a2a2a'
                                  ),
                                  borderRadius: '9999px',
                                  fontSize: '0.875rem',
                                }}
                              >
                                {getToolProficiencyDisplay(String(tool))}
                              </span>
                            )
                          )}
                        </div>
                      </CollapsibleSection>
                    )}

                  {/* Additional choices - equipment and/or tool proficiency, granted by rulebooks/dnd5e v0.146.0+ */}
                  {selectedBackground.choices &&
                    selectedBackground.choices.length > 0 && (
                      <CollapsibleSection
                        title="Additional Choices"
                        defaultOpen={true}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.25rem',
                          }}
                        >
                          {/* Equipment choices */}
                          {selectedBackground.choices
                            .filter(
                              (choice) =>
                                choice.choiceType === ChoiceCategory.EQUIPMENT
                            )
                            .map((choice) => {
                              const foundEquipment =
                                currentBackgroundChoices.equipment?.find(
                                  (ec) => ec.choiceId === choice.id
                                );
                              const equipmentSelections: string[] = [];
                              if (foundEquipment?.bundleId) {
                                equipmentSelections.push(
                                  foundEquipment.bundleId
                                );
                                foundEquipment.categorySelections?.forEach(
                                  (cat) => {
                                    cat.equipmentIds.forEach((id) => {
                                      equipmentSelections.push(
                                        `cat${cat.categoryIndex}:${id}:${id}`
                                      );
                                    });
                                  }
                                );
                              }
                              return (
                                <div key={choice.id}>
                                  <h4
                                    style={{
                                      fontSize: '0.9375rem',
                                      fontWeight: 600,
                                      marginBottom: '0.5rem',
                                    }}
                                  >
                                    Choose Your Equipment{' '}
                                    <span style={{ color: '#ef4444' }}>*</span>
                                  </h4>
                                  <ChoiceRenderer
                                    choice={choice}
                                    currentSelections={equipmentSelections}
                                    hasInvalidPersistedEquipmentSelection={
                                      foundEquipment?.hasUnconsumedItems ??
                                      false
                                    }
                                    onSelectionChange={(
                                      _choiceId,
                                      selections
                                    ) => {
                                      setBackgroundChoicesMap((prev) => {
                                        const current = prev[choiceKey] || {
                                          equipment: [],
                                          tools: [],
                                        };
                                        const updatedEquipment =
                                          current.equipment?.filter(
                                            (ec) => ec.choiceId !== choice.id
                                          ) || [];

                                        if (selections.length > 0) {
                                          const firstSel = selections[0];
                                          const bundleId =
                                            firstSel.split(':')[0];

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

                                                let catEntry =
                                                  categorySelections.find(
                                                    (c) =>
                                                      c.categoryIndex ===
                                                      catIndex
                                                  );
                                                if (!catEntry) {
                                                  catEntry = {
                                                    categoryIndex: catIndex,
                                                    equipmentIds: [],
                                                  };
                                                  categorySelections.push(
                                                    catEntry
                                                  );
                                                }
                                                catEntry.equipmentIds.push(
                                                  equipId
                                                );
                                              }
                                            });

                                          const equipmentChoice: EquipmentChoice =
                                            {
                                              choiceId: choice.id,
                                              bundleId,
                                              categorySelections,
                                            };
                                          updatedEquipment.push(
                                            equipmentChoice
                                          );
                                        }

                                        return {
                                          ...prev,
                                          [choiceKey]: {
                                            ...current,
                                            equipment: updatedEquipment,
                                          },
                                        };
                                      });
                                    }}
                                  />
                                </div>
                              );
                            })}

                          {/* Tool proficiency choices */}
                          {selectedBackground.choices
                            .filter(
                              (choice) =>
                                choice.choiceType === ChoiceCategory.TOOLS
                            )
                            .map((choice) => (
                              <div key={choice.id}>
                                <h4
                                  style={{
                                    fontSize: '0.9375rem',
                                    fontWeight: 600,
                                    marginBottom: '0.5rem',
                                  }}
                                >
                                  Choose Your Tool Proficiencies{' '}
                                  <span style={{ color: '#ef4444' }}>*</span>
                                </h4>
                                <ChoiceRenderer
                                  choice={choice}
                                  currentSelections={
                                    currentBackgroundChoices.tools?.find(
                                      (tc) => tc.choiceId === choice.id
                                    )?.tools || []
                                  }
                                  onSelectionChange={(
                                    _choiceId,
                                    selections
                                  ) => {
                                    const toolEnums = selections as Tool[];
                                    setBackgroundChoicesMap((prev) => {
                                      const current = prev[choiceKey] || {
                                        equipment: [],
                                        tools: [],
                                      };
                                      const updatedTools =
                                        current.tools?.filter(
                                          (tc) => tc.choiceId !== choice.id
                                        ) || [];

                                      if (toolEnums.length > 0) {
                                        updatedTools.push({
                                          choiceId: choice.id,
                                          tools: toolEnums,
                                        });
                                      }

                                      return {
                                        ...prev,
                                        [choiceKey]: {
                                          ...current,
                                          tools: updatedTools,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </div>
                            ))}
                        </div>
                      </CollapsibleSection>
                    )}
                </>
              )}
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: '1rem 1.5rem',
                  backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  borderTop: '1px solid rgba(255, 68, 68, 0.3)',
                  color: '#ff4444',
                  fontSize: '0.875rem',
                }}
              >
                {errorMessage}
              </div>
            )}

            <div style={footerStyles}>
              <button
                onClick={onClose}
                style={cancelButtonStyles}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = getCSSVariable(
                    '--bg-secondary',
                    '#2a2a2a'
                  );
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                style={confirmButtonStyles}
                disabled={!selectedBackground}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = getCSSVariable(
                      '--accent-hover',
                      '#4752C4'
                    );
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = getCSSVariable(
                    '--accent-primary',
                    '#5865F2'
                  );
                }}
              >
                Select Background
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
