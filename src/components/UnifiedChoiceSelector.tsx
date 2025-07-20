import type {
  CategoryReference,
  Choice,
  ChoiceOption,
  ExplicitOptions,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';

interface UnifiedChoiceSelectorProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selections: string[]) => void;
  currentSelections?: string[];
  disabled?: boolean;
}

export function UnifiedChoiceSelector({
  choice,
  onSelectionChange,
  currentSelections = [],
  disabled = false,
}: UnifiedChoiceSelectorProps) {
  const [selections, setSelections] = useState<string[]>(currentSelections);
  const [expandedCategory, setExpandedCategory] = useState(false);

  // Handle selection change
  const handleSelection = useCallback(
    (itemId: string) => {
      const newSelections = [...selections];
      const index = newSelections.indexOf(itemId);

      if (index > -1) {
        // Remove if already selected
        newSelections.splice(index, 1);
      } else if (choice.chooseCount === 1) {
        // Replace for single selection
        newSelections.length = 0;
        newSelections.push(itemId);
      } else if (newSelections.length < choice.chooseCount) {
        // Add if under limit
        newSelections.push(itemId);
      }

      setSelections(newSelections);
      onSelectionChange(choice.id, newSelections);
    },
    [choice.chooseCount, choice.id, onSelectionChange, selections]
  );

  // Get display text for choice type
  const getChoiceTypeLabel = () => {
    switch (choice.choiceType) {
      case ChoiceType.EQUIPMENT:
        return 'Equipment';
      case ChoiceType.SKILL:
        return 'Skills';
      case ChoiceType.TOOL:
        return 'Tools';
      case ChoiceType.LANGUAGE:
        return 'Languages';
      case ChoiceType.WEAPON_PROFICIENCY:
        return 'Weapon Proficiencies';
      case ChoiceType.ARMOR_PROFICIENCY:
        return 'Armor Proficiencies';
      case ChoiceType.SPELL:
        return 'Spells';
      case ChoiceType.FEAT:
        return 'Feats';
      default:
        return 'Options';
    }
  };

  // Render explicit options
  const renderExplicitOptions = (options: ExplicitOptions) => {
    return (
      <div className="space-y-2">
        {options.options.map((option, index) => (
          <ChoiceOptionItem
            key={index}
            option={option}
            isSelected={selections.includes(getOptionId(option))}
            onSelect={() => handleSelection(getOptionId(option))}
            disabled={
              disabled ||
              (!selections.includes(getOptionId(option)) &&
                selections.length >= choice.chooseCount)
            }
          />
        ))}
      </div>
    );
  };

  // Render category reference (expandable)
  const renderCategoryReference = (category: CategoryReference) => {
    return (
      <div className="space-y-2">
        <motion.button
          type="button"
          onClick={() => setExpandedCategory(!expandedCategory)}
          className="w-full p-3 text-left rounded-lg border-2 border-dashed transition-all"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex justify-between items-center">
            <span className="font-medium">
              Choose from {category.categoryId.replace(/-/g, ' ')}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {expandedCategory ? '▼' : '▶'}
            </span>
          </div>
        </motion.button>

        {expandedCategory && (
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-muted)',
            }}
          >
            <p className="text-sm">
              Category expansion not yet implemented. This would load all items
              from the "{category.categoryId}" category.
            </p>
            {category.excludeIds.length > 0 && (
              <p className="text-xs mt-2">
                Excludes: {category.excludeIds.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h4
          className="text-sm font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {getChoiceTypeLabel()}
        </h4>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Choose {choice.chooseCount} • Selected: {selections.length}
        </span>
      </div>

      {/* Description */}
      {choice.description && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {choice.description}
        </p>
      )}

      {/* Options */}
      {choice.optionSet.case === 'explicitOptions' &&
        renderExplicitOptions(choice.optionSet.value)}
      {choice.optionSet.case === 'categoryReference' &&
        renderCategoryReference(choice.optionSet.value)}
    </div>
  );
}

// Helper component for rendering individual choice options
interface ChoiceOptionItemProps {
  option: ChoiceOption;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

function ChoiceOptionItem({
  option,
  isSelected,
  onSelect,
  disabled = false,
}: ChoiceOptionItemProps) {
  const content = getOptionContent(option);

  return (
    <motion.div
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.99 }}
      onClick={disabled ? undefined : onSelect}
      className={`p-3 rounded-lg border transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{
        backgroundColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--bg-secondary)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--border-primary)',
      }}
    >
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <div
            className="text-sm font-medium"
            style={{
              color: isSelected ? 'white' : 'var(--text-primary)',
            }}
          >
            {content.name}
          </div>
          {content.quantity && (
            <div
              className="text-xs"
              style={{
                color: isSelected
                  ? 'rgba(255,255,255,0.8)'
                  : 'var(--text-muted)',
              }}
            >
              Quantity: {content.quantity}
            </div>
          )}
        </div>
        {isSelected && <div className="ml-2 text-white">✓</div>}
      </div>
    </motion.div>
  );
}

// Helper functions
function getOptionId(option: ChoiceOption): string {
  switch (option.optionType.case) {
    case 'item':
      return option.optionType.value.itemId;
    case 'countedItem':
      return option.optionType.value.itemId;
    case 'bundle':
      return option.optionType.value.items.map((item) => item.itemId).join('-');
    case 'nestedChoice':
      return option.optionType.value.choice?.id || 'nested';
    default:
      return 'unknown';
  }
}

function getOptionContent(option: ChoiceOption): {
  name: string;
  quantity?: number;
} {
  switch (option.optionType.case) {
    case 'item':
      return { name: option.optionType.value.name };
    case 'countedItem':
      return {
        name: option.optionType.value.name,
        quantity: option.optionType.value.quantity,
      };
    case 'bundle':
      return {
        name: option.optionType.value.items
          .map((item) => `${item.quantity}x ${item.name}`)
          .join(', '),
      };
    case 'nestedChoice':
      return {
        name: option.optionType.value.choice?.description || 'Choose...',
      };
    default:
      return { name: 'Unknown option' };
  }
}
