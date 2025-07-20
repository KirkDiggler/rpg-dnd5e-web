import { useListEquipmentByType } from '@/api/hooks';
import type {
  CategoryReference,
  Choice,
  ExplicitOptions,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { ChoiceOptionRenderer } from './ChoiceOptionRenderer';

export interface ChoiceRendererProps {
  choice: Choice;
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  disabled?: boolean;
}

/**
 * Renders a single choice with its options
 */
interface ExpandedOption {
  optionType: {
    case: string;
    value: unknown;
  };
}

export function ChoiceRenderer({
  choice,
  selectedValues,
  onSelectionChange,
  disabled = false,
}: ChoiceRendererProps) {
  const [expandedOptions, setExpandedOptions] = useState<ExpandedOption[]>([]);

  // Handle category reference expansion for equipment
  const categoryRef =
    choice.optionSet.case === 'categoryReference'
      ? (choice.optionSet.value as CategoryReference)
      : null;

  // Map category IDs to equipment types
  const getEquipmentType = (categoryId: string): string | null => {
    const typeMap: Record<string, string> = {
      'simple-melee-weapons': 'Simple Melee',
      'simple-ranged-weapons': 'Simple Ranged',
      'martial-melee-weapons': 'Martial Melee',
      'martial-ranged-weapons': 'Martial Ranged',
      'artisan-tools': "Artisan's Tools",
      'gaming-sets': 'Gaming Set',
      'musical-instruments': 'Instrument',
    };
    return typeMap[categoryId] || null;
  };

  const equipmentType = categoryRef
    ? getEquipmentType(categoryRef.categoryId)
    : null;

  const { data: equipmentData, loading: equipmentLoading } =
    useListEquipmentByType(
      { equipmentType: equipmentType || '' },
      { enabled: !!equipmentType && choice.choiceType === ChoiceType.EQUIPMENT }
    );

  useEffect(() => {
    if (choice.optionSet.case === 'explicitOptions') {
      const explicitOptions = choice.optionSet.value as ExplicitOptions;
      setExpandedOptions(explicitOptions.options);
    } else if (categoryRef && equipmentData?.equipment) {
      // Convert equipment to choice options
      const options = equipmentData.equipment
        .filter((eq) => !categoryRef.excludeIds.includes(eq.equipmentId))
        .map((eq) => ({
          optionType: {
            case: 'item',
            value: {
              itemId: eq.equipmentId,
              name: eq.name,
              description: eq.description,
            },
          },
        }));
      setExpandedOptions(options);
    }
  }, [choice.optionSet, equipmentData, categoryRef]);

  const handleOptionToggle = (optionId: string) => {
    const currentIndex = selectedValues.indexOf(optionId);
    let newSelection: string[];

    if (currentIndex >= 0) {
      // Remove from selection
      newSelection = selectedValues.filter((v) => v !== optionId);
    } else if (choice.chooseCount === 1) {
      // Single selection - replace
      newSelection = [optionId];
    } else if (selectedValues.length < choice.chooseCount) {
      // Multiple selection - add
      newSelection = [...selectedValues, optionId];
    } else {
      // Already at max selection
      return;
    }

    onSelectionChange(newSelection);
  };

  const getOptionId = (option: ExpandedOption): string => {
    switch (option.optionType.case) {
      case 'item': {
        const item = option.optionType.value as { itemId: string };
        return item.itemId;
      }
      case 'countedItem': {
        const countedItem = option.optionType.value as {
          itemId: string;
          quantity: number;
        };
        return `${countedItem.itemId}:${countedItem.quantity}`;
      }
      case 'bundle': {
        const bundle = option.optionType.value as {
          bundleId?: string;
          items: Array<{ itemId: string }>;
        };
        return bundle.bundleId || bundle.items.map((i) => i.itemId).join('-');
      }
      case 'nestedChoice': {
        const nestedChoice = option.optionType.value as { choiceId: string };
        return nestedChoice.choiceId;
      }
      default:
        return '';
    }
  };

  const getChoiceTypeLabel = (type: ChoiceType): string => {
    const labels: Record<ChoiceType, string> = {
      [ChoiceType.UNSPECIFIED]: 'Choice',
      [ChoiceType.EQUIPMENT]: 'Equipment',
      [ChoiceType.SKILL]: 'Skill',
      [ChoiceType.TOOL]: 'Tool Proficiency',
      [ChoiceType.LANGUAGE]: 'Language',
      [ChoiceType.WEAPON]: 'Weapon Proficiency',
      [ChoiceType.ARMOR]: 'Armor Proficiency',
      [ChoiceType.FEAT]: 'Feat',
      [ChoiceType.ABILITY_SCORE]: 'Ability Score',
    };
    return labels[type] || 'Choice';
  };

  const isLoading = equipmentLoading;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {getChoiceTypeLabel(choice.choiceType)}
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {choice.description}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Choose {choice.chooseCount}{' '}
          {choice.chooseCount === 1 ? 'option' : 'options'}
          {selectedValues.length > 0 && ` (${selectedValues.length} selected)`}
        </p>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        ) : (
          expandedOptions.map((option, index) => {
            const optionId = getOptionId(option);
            return (
              <ChoiceOptionRenderer
                key={optionId || index}
                option={option}
                isSelected={selectedValues.includes(optionId)}
                onSelect={() => handleOptionToggle(optionId)}
                disabled={
                  disabled ||
                  (!selectedValues.includes(optionId) &&
                    selectedValues.length >= choice.chooseCount)
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}
