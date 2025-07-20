import type { ClassInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListClasses } from '../../api/hooks';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import {
  filterChoicesByType,
  UnifiedChoiceSelector,
  useChoiceSelection,
  type ChoiceSelections,
} from './choices';
import { SpellInfoDisplay } from './components/SpellInfoDisplay';
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
  onSelect: (classData: ClassInfo, selections: ChoiceSelections) => void;
  onClose: () => void;
}

export function ClassSelectionModal({
  isOpen,
  currentClass,
  onSelect,
  onClose,
}: ClassSelectionModalProps) {
  const { data: classes, loading, error } = useListClasses();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track selections per class using the unified system
  const [classSelectionsMap, setClassSelectionsMap] = useState<
    Record<string, ChoiceSelections>
  >({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get current class
  const currentClassData = classes[selectedIndex];
  const currentClassName = currentClassData?.name || '';

  // Get selections for current class
  const currentSelections = classSelectionsMap[currentClassName] || {};

  const { selections, setSelection, isValidSelection } = useChoiceSelection({
    initialSelections: currentSelections,
  });

  // Update the class selections map when selections change
  useEffect(() => {
    if (currentClassName) {
      setClassSelectionsMap((prev) => ({
        ...prev,
        [currentClassName]: selections,
      }));
    }
  }, [selections, currentClassName]);

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

  if (!isOpen) return null;

  const handleClassSelect = () => {
    if (!currentClassData) return;

    // Validate all choices are made
    const allChoices = currentClassData.choices || [];

    for (const choice of allChoices) {
      const selectedValues = selections[choice.id] || [];
      if (!isValidSelection(choice, selectedValues)) {
        const choiceTypeLabel = ChoiceType[choice.choiceType] || 'choice';
        setErrorMessage(
          `Please complete the ${choiceTypeLabel.toLowerCase()} selection: "${choice.description}"`
        );
        return;
      }
    }

    // All validations passed
    onSelect(currentClassData, selections);
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
            }}
          >
            Choose Your Class
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: textMuted,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: textMuted,
            }}
          >
            Loading classes...
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: '#ef4444',
            }}
          >
            Error loading classes: {error.message}
          </div>
        ) : (
          <>
            <VisualCarousel
              items={classes.map((cls) => ({
                id: cls.classId,
                name: cls.name,
                description: cls.description,
                visual: getClassEmoji(cls.name),
                color: '#3b82f6',
              }))}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />

            {currentClassData && (
              <div style={{ marginTop: '24px' }}>
                {/* Show equipment choices */}
                {filterChoicesByType(
                  currentClassData.choices || [],
                  ChoiceType.EQUIPMENT
                ).length > 0 && (
                  <CollapsibleSection
                    title="Equipment Options"
                    defaultOpen
                    bgSecondary={bgSecondary}
                    borderPrimary={borderPrimary}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                  >
                    <UnifiedChoiceSelector
                      choices={currentClassData.choices || []}
                      choiceType={ChoiceType.EQUIPMENT}
                      selections={selections}
                      onSelectionsChange={(newSelections) => {
                        Object.entries(newSelections).forEach(
                          ([choiceId, values]) => {
                            setSelection(choiceId, values);
                          }
                        );
                      }}
                    />
                  </CollapsibleSection>
                )}

                {/* Show proficiency choices */}
                {(filterChoicesByType(
                  currentClassData.choices || [],
                  ChoiceType.SKILL
                ).length > 0 ||
                  filterChoicesByType(
                    currentClassData.choices || [],
                    ChoiceType.TOOL
                  ).length > 0) && (
                  <CollapsibleSection
                    title="Proficiency Options"
                    defaultOpen
                    bgSecondary={bgSecondary}
                    borderPrimary={borderPrimary}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                  >
                    <UnifiedChoiceSelector
                      choices={
                        currentClassData.choices?.filter(
                          (c) =>
                            c.choiceType === ChoiceType.SKILL ||
                            c.choiceType === ChoiceType.TOOL
                        ) || []
                      }
                      selections={selections}
                      onSelectionsChange={(newSelections) => {
                        Object.entries(newSelections).forEach(
                          ([choiceId, values]) => {
                            setSelection(choiceId, values);
                          }
                        );
                      }}
                    />
                  </CollapsibleSection>
                )}

                {/* Show spellcasting info if available */}
                {currentClassData.spellcasting && (
                  <CollapsibleSection
                    title="Spellcasting"
                    defaultOpen={false}
                    bgSecondary={bgSecondary}
                    borderPrimary={borderPrimary}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                  >
                    <SpellInfoDisplay
                      spellcasting={currentClassData.spellcasting}
                    />
                  </CollapsibleSection>
                )}

                {/* Error message */}
                {errorMessage && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '14px',
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                {/* Action buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '24px',
                    paddingTop: '24px',
                    borderTop: `1px solid ${borderPrimary}`,
                  }}
                >
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: 'transparent',
                      color: textPrimary,
                      border: `2px solid ${borderPrimary}`,
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClassSelect}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: accentPrimary,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Select {currentClassData.name}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Use React Portal to render at document root
  return createPortal(modalContent, document.body);
}
