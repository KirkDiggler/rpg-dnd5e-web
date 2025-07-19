import { ChoiceCard } from '@/components/ChoiceCard';
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
  if (!choice || choice.count !== 1) {
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
    onSelect(feature.id, choice.key, option);
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
        {choice.type === 'proficiency' && 'Choose a Proficiency:'}
        {choice.type === 'feature' && 'Choose a Feature:'}
        {choice.type === 'language' && 'Choose a Language:'}
        {choice.type !== 'proficiency' &&
          choice.type !== 'feature' &&
          choice.type !== 'language' &&
          'Make a Choice:'}
      </h5>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '8px',
        }}
      >
        {choice.options.map((option) => (
          <motion.div
            key={option}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ChoiceCard
              title={formatOptionName(option)}
              description={getOptionDescription(feature.name, option)}
              selected={selectedOption === option}
              onClick={() => handleSelection(option)}
              compact
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Helper to format option names
function formatOptionName(option: string): string {
  // Handle fighting style options
  if (option.includes('fighting-style')) {
    return option
      .replace('fighting-style:', '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Handle other options
  return option
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper to get descriptions for common feature choices
function getOptionDescription(
  featureName: string,
  option: string
): string | undefined {
  if (featureName.toLowerCase().includes('fighting style')) {
    const fightingStyles: Record<string, string> = {
      'fighting-style:archery': '+2 to attack rolls with ranged weapons',
      'fighting-style:defense': '+1 to AC while wearing armor',
      'fighting-style:dueling': '+2 damage with one-handed weapons',
      'fighting-style:great-weapon-fighting':
        'Reroll 1s and 2s on damage with two-handed weapons',
      'fighting-style:protection':
        'Use reaction to impose disadvantage on attacks against allies',
      'fighting-style:two-weapon-fighting':
        'Add ability modifier to off-hand damage',
    };
    return fightingStyles[option];
  }

  // Add more feature-specific descriptions as needed
  return undefined;
}
