import type { FeatureInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface FeatureChoiceSelectorProps {
  feature: FeatureInfo;
  onSelect: (featureId: string, choiceKey: string, selection: string) => void;
  currentSelection?: string;
}

export function FeatureChoiceSelector({
  feature,
  onSelect,
  currentSelection,
}: FeatureChoiceSelectorProps) {
  const [selectedOption, setSelectedOption] = useState(currentSelection || '');

  // For now, we'll only handle single choice features
  // TODO: Handle multi-choice features
  const choice = feature.choices[0];
  if (!choice || choice.choose !== 1) {
    return (
      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '6px',
          border: '1px solid var(--border-primary)',
          opacity: 0.7,
        }}
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Complex choice selection not yet supported
        </p>
      </div>
    );
  }

  const handleSelection = (option: string) => {
    setSelectedOption(option);
    onSelect(feature.id, choice.type, option);
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <h5
        style={{
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: 'bold',
          marginBottom: '8px',
        }}
      >
        Choose {choice.choose === 1 ? 'one' : choice.choose}:
      </h5>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {choice.options.map((option) => {
          const isSelected = selectedOption === option;

          return (
            <motion.div
              key={option}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleSelection(option)}
              style={{
                padding: '8px 12px',
                backgroundColor: isSelected
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: 'bold',
                    }}
                  >
                    {option}
                  </div>
                </div>
                {isSelected && (
                  <div
                    style={{
                      marginLeft: '8px',
                      color: 'white',
                      fontSize: '16px',
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
