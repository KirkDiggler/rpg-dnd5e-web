import type { RaceInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListRaces } from '../../api/hooks';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import {
  filterChoicesByType,
  UnifiedChoiceSelector,
  useChoiceSelection,
  type ChoiceSelections,
} from './choices';
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
      'Walking in two worlds but truly belonging to neither, half-elves combine the best qualities of their elf and human parents.',
    'Half-Orc':
      'Whether united under the leadership of a mighty warlock or fighting in their own hordes, orcs and half-orcs are fierce warriors.',
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
  onSelect: (raceData: RaceInfo, selections: ChoiceSelections) => void;
  onClose: () => void;
}

export function RaceSelectionModal({
  isOpen,
  currentRace,
  onSelect,
  onClose,
}: RaceSelectionModalProps) {
  const { data: races, loading, error } = useListRaces();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track selections per race using the unified system
  const [raceSelectionsMap, setRaceSelectionsMap] = useState<
    Record<string, ChoiceSelections>
  >({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get current race
  const currentRaceData = races[selectedIndex];
  const currentRaceName = currentRaceData?.name || '';

  // Get selections for current race
  const currentSelections = raceSelectionsMap[currentRaceName] || {};

  const { selections, setSelection, isValidSelection } = useChoiceSelection({
    initialSelections: currentSelections,
  });

  // Update the race selections map when selections change
  useEffect(() => {
    if (currentRaceName) {
      setRaceSelectionsMap((prev) => ({
        ...prev,
        [currentRaceName]: selections,
      }));
    }
  }, [selections, currentRaceName]);

  // Reset selected index when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');

      // Set selected index based on current race
      if (currentRace && races.length > 0) {
        const index = races.findIndex((race) => race.name === currentRace);
        if (index >= 0) {
          setSelectedIndex(index);
        }
      }
    }
  }, [isOpen, currentRace, races]);

  if (!isOpen) return null;

  const handleRaceSelect = () => {
    if (!currentRaceData) return;

    // Validate all choices are made
    const allChoices = currentRaceData.choices || [];

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
    onSelect(currentRaceData, selections);
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
            Choose Your Race
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
            Loading races...
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: '#ef4444',
            }}
          >
            Error loading races: {error.message}
          </div>
        ) : (
          <>
            <VisualCarousel
              items={races.map((race) => ({
                id: race.raceId,
                name: race.name,
                description: getRaceDescription(race.name),
                visual: getRaceEmoji(race.name),
                color: '#10b981',
              }))}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />

            {currentRaceData && (
              <div style={{ marginTop: '24px' }}>
                {/* Show language choices */}
                {filterChoicesByType(
                  currentRaceData.choices || [],
                  ChoiceType.LANGUAGE
                ).length > 0 && (
                  <CollapsibleSection
                    title="Language Options"
                    defaultOpen
                    bgSecondary={bgSecondary}
                    borderPrimary={borderPrimary}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                  >
                    <UnifiedChoiceSelector
                      choices={currentRaceData.choices || []}
                      choiceType={ChoiceType.LANGUAGE}
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
                  currentRaceData.choices || [],
                  ChoiceType.SKILL
                ).length > 0 ||
                  filterChoicesByType(
                    currentRaceData.choices || [],
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
                        currentRaceData.choices?.filter(
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

                {/* Show ability score bonuses */}
                {currentRaceData.abilityScoreBonuses &&
                  currentRaceData.abilityScoreBonuses.length > 0 && (
                    <CollapsibleSection
                      title="Ability Score Bonuses"
                      defaultOpen={false}
                      bgSecondary={bgSecondary}
                      borderPrimary={borderPrimary}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                    >
                      <div className="space-y-2">
                        {currentRaceData.abilityScoreBonuses.map((bonus) => (
                          <div
                            key={bonus.ability}
                            className="flex items-center justify-between"
                            style={{ color: textPrimary }}
                          >
                            <span className="capitalize">{bonus.ability}</span>
                            <span className="font-medium">+{bonus.bonus}</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                {/* Show traits */}
                {currentRaceData.traits &&
                  currentRaceData.traits.length > 0 && (
                    <CollapsibleSection
                      title="Racial Traits"
                      defaultOpen={false}
                      bgSecondary={bgSecondary}
                      borderPrimary={borderPrimary}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                    >
                      <div className="space-y-3">
                        {currentRaceData.traits.map((trait) => (
                          <div key={trait.name}>
                            <h4
                              className="font-medium"
                              style={{ color: textPrimary }}
                            >
                              {trait.name}
                            </h4>
                            <p
                              className="text-sm mt-1"
                              style={{ color: textMuted }}
                            >
                              {trait.description}
                            </p>
                          </div>
                        ))}
                      </div>
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
                    onClick={handleRaceSelect}
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
                    Select {currentRaceData.name}
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
