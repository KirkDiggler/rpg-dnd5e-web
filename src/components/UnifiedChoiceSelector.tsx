import { create } from '@bufbuild/protobuf';
import type {
  CategoryReference,
  Choice,
  ChoiceOption,
  ExplicitOptions,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceOptionSchema,
  ChoiceType,
  ItemReferenceSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { EquipmentType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useCallback, useMemo, useState } from 'react';
import { useListEquipmentByType } from '../api/hooks';

interface UnifiedChoiceSelectorProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selections: string[]) => void;
  currentSelections?: string[];
  disabled?: boolean;
}

// Map category IDs to equipment types
function categoryIdToEquipmentType(categoryId: string): EquipmentType | null {
  const mapping: Record<string, EquipmentType> = {
    'simple-weapons': EquipmentType.SIMPLE_MELEE_WEAPON,
    'simple-melee-weapons': EquipmentType.SIMPLE_MELEE_WEAPON,
    'simple-ranged-weapons': EquipmentType.SIMPLE_RANGED_WEAPON,
    'martial-weapons': EquipmentType.MARTIAL_MELEE_WEAPON,
    'martial-melee-weapons': EquipmentType.MARTIAL_MELEE_WEAPON,
    'martial-ranged-weapons': EquipmentType.MARTIAL_RANGED_WEAPON,
    'light-armor': EquipmentType.LIGHT_ARMOR,
    'medium-armor': EquipmentType.MEDIUM_ARMOR,
    'heavy-armor': EquipmentType.HEAVY_ARMOR,
    shields: EquipmentType.SHIELD,
    'adventuring-gear': EquipmentType.ADVENTURING_GEAR,
    tools: EquipmentType.TOOLS,
    'artisan-tools': EquipmentType.ARTISAN_TOOLS,
    'gaming-sets': EquipmentType.GAMING_SET,
    'musical-instruments': EquipmentType.MUSICAL_INSTRUMENT,
    vehicles: EquipmentType.VEHICLE,
  };

  return mapping[categoryId.toLowerCase()] || null;
}

// Check if a category ID represents a weapon type that should show both melee and ranged
function isGeneralWeaponCategory(categoryId: string): boolean {
  return ['simple-weapons', 'martial-weapons'].includes(
    categoryId.toLowerCase()
  );
}

export function UnifiedChoiceSelector({
  choice,
  onSelectionChange,
  currentSelections = [],
  disabled = false,
}: UnifiedChoiceSelectorProps) {
  const [selections, setSelections] = useState<string[]>(currentSelections);

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
    // First check if all options are nested choices - if so, flatten them
    const allNestedChoices = options.options.every(
      (opt) => opt.optionType.case === 'nestedChoice'
    );

    if (allNestedChoices && options.options.length === 1) {
      const nestedChoice = options.options[0].optionType.value?.choice;
      if (nestedChoice && nestedChoice.optionSet.case === 'explicitOptions') {
        // Flatten single nested choice
        return renderExplicitOptions(nestedChoice.optionSet.value);
      }
    }

    return (
      <div className="grid gap-2">
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
      <CategoryReferenceSelector
        category={category}
        selections={selections}
        onSelect={handleSelection}
        chooseCount={choice.chooseCount}
        disabled={disabled}
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Header - only show if not equipment type (equipment has its own header) */}
      {choice.choiceType !== ChoiceType.EQUIPMENT && (
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
      )}

      {/* Description - only show for non-equipment or if it's meaningful */}
      {choice.description && choice.choiceType !== ChoiceType.EQUIPMENT && (
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

// Component for category reference expansion
interface CategoryReferenceSelectorProps {
  category: CategoryReference;
  selections: string[];
  onSelect: (itemId: string) => void;
  chooseCount: number;
  disabled?: boolean;
}

function CategoryReferenceSelector({
  category,
  selections,
  onSelect,
  chooseCount,
  disabled = false,
}: CategoryReferenceSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  // Determine equipment type to fetch
  const equipmentType = useMemo(() => {
    const type = categoryIdToEquipmentType(category.categoryId);
    return type || EquipmentType.UNSPECIFIED;
  }, [category.categoryId]);

  // Use the equipment hook for the primary type
  const { data: primaryEquipment, loading: primaryLoading } =
    useListEquipmentByType(equipmentType, { pageSize: 100 });

  // For general weapon categories, we need a second type
  const needsSecondaryType = isGeneralWeaponCategory(category.categoryId);
  const secondaryType = useMemo(() => {
    if (!needsSecondaryType) return EquipmentType.UNSPECIFIED;

    const lowerId = category.categoryId.toLowerCase();
    if (lowerId === 'simple-weapons') return EquipmentType.SIMPLE_RANGED_WEAPON;
    if (lowerId === 'martial-weapons')
      return EquipmentType.MARTIAL_RANGED_WEAPON;

    return EquipmentType.UNSPECIFIED;
  }, [category.categoryId, needsSecondaryType]);

  const { data: secondaryEquipment, loading: secondaryLoading } =
    useListEquipmentByType(secondaryType, { pageSize: 100 });

  // Combine equipment and filter excluded items
  const allEquipment = useMemo(() => {
    const items = [...(primaryEquipment || [])];
    if (needsSecondaryType && secondaryEquipment) {
      items.push(...secondaryEquipment);
    }

    // Filter out excluded items
    return items.filter((item) => !category.excludeIds.includes(item.id));
  }, [
    primaryEquipment,
    secondaryEquipment,
    needsSecondaryType,
    category.excludeIds,
  ]);

  const loading = primaryLoading || (needsSecondaryType && secondaryLoading);

  const categoryName = category.categoryId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={disabled}
        className="w-full p-4 rounded-lg border-2 border-dashed text-center transition-all hover:border-solid"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
          color: 'var(--text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }}
      >
        <p className="font-medium">Choose Any {categoryName}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Click to view available options
        </p>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
        Loading {categoryName}...
      </div>
    );
  }

  // Convert equipment to choice options
  const options = allEquipment.map((equipment) => {
    const itemRef = create(ItemReferenceSchema, {
      itemId: equipment.id,
      name: equipment.name,
    });

    return create(ChoiceOptionSchema, {
      optionType: {
        case: 'item' as const,
        value: itemRef,
      },
    });
  });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Back to category selection
      </button>

      <div className="grid gap-2 max-h-96 overflow-y-auto">
        {options.map((option, index) => (
          <ChoiceOptionItem
            key={index}
            option={option}
            isSelected={selections.includes(getOptionId(option))}
            onSelect={() => onSelect(getOptionId(option))}
            disabled={
              disabled ||
              (!selections.includes(getOptionId(option)) &&
                selections.length >= chooseCount)
            }
          />
        ))}
      </div>
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
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      style={{
        padding: '12px 16px',
        backgroundColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--card-bg)',
        borderRadius: '6px',
        border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        fontSize: '13px',
        color: isSelected ? 'white' : 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        width: '100%',
        outline: 'none',
        position: 'relative',
        zIndex: 1,
        opacity: disabled ? 0.5 : 1,
        transform: 'translateY(0)',
        boxShadow: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !disabled) {
          e.currentTarget.style.borderColor = 'var(--accent-primary)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !disabled) {
          e.currentTarget.style.borderColor = 'var(--border-primary)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* Icon */}
      {content.icon && (
        <span
          style={{
            fontSize: '18px',
            lineHeight: '1',
          }}
        >
          {content.icon}
        </span>
      )}

      <span style={{ flex: 1 }}>
        {content.name}
        {content.quantity && content.quantity > 1 && (
          <span
            style={{
              color: isSelected ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
              fontSize: '12px',
              marginLeft: '8px',
            }}
          >
            (×{content.quantity})
          </span>
        )}
      </span>

      {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
    </button>
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
  icon?: string;
} {
  switch (option.optionType.case) {
    case 'item':
      return {
        name: option.optionType.value.name,
        icon: getItemIcon(
          option.optionType.value.name,
          option.optionType.value.itemId
        ),
      };
    case 'countedItem':
      return {
        name: option.optionType.value.name,
        quantity: option.optionType.value.quantity,
        icon: getItemIcon(
          option.optionType.value.name,
          option.optionType.value.itemId
        ),
      };
    case 'bundle': {
      const items = option.optionType.value.items;
      return {
        name: items
          .map((item) =>
            item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name
          )
          .join(', '),
        icon: getBundleIcon(items),
      };
    }
    case 'nestedChoice':
      return {
        name: option.optionType.value.choice?.description || 'Choose...',
        icon: '📦',
      };
    default:
      return { name: 'Unknown option', icon: '❓' };
  }
}

// Helper function to get icon based on item name/id
function getItemIcon(name: string, itemId: string): string {
  const nameLower = name.toLowerCase();
  const idLower = itemId.toLowerCase();

  // Armor
  if (nameLower.includes('chain mail') || nameLower.includes('chainmail'))
    return '🛡️';
  if (nameLower.includes('leather armor')) return '🎽';
  if (nameLower.includes('scale mail')) return '🛡️';
  if (nameLower.includes('plate')) return '🛡️';

  // Weapons
  if (nameLower.includes('sword') || nameLower.includes('scimitar'))
    return '⚔️';
  if (nameLower.includes('axe') || nameLower.includes('handaxe')) return '🪓';
  if (nameLower.includes('bow')) return '🏹';
  if (nameLower.includes('crossbow')) return '🏹';
  if (nameLower.includes('dagger') || nameLower.includes('knife')) return '🗡️';
  if (nameLower.includes('hammer') || nameLower.includes('maul')) return '🔨';
  if (nameLower.includes('spear') || nameLower.includes('javelin')) return '🔱';
  if (nameLower.includes('staff') || nameLower.includes('quarterstaff'))
    return '🪄';
  if (nameLower.includes('club') || nameLower.includes('mace')) return '🏏';

  // Ammunition
  if (nameLower.includes('arrow') || nameLower.includes('bolt')) return '➳';

  // Packs
  if (nameLower.includes('pack')) return '🎒';

  // Musical instruments
  if (
    nameLower.includes('lute') ||
    nameLower.includes('viol') ||
    nameLower.includes('instrument')
  )
    return '🎵';

  // Tools
  if (nameLower.includes('tools') || nameLower.includes('kit')) return '🔧';

  // Skills
  if (idLower.includes('acrobatics')) return '🤸';
  if (idLower.includes('animal')) return '🐾';
  if (idLower.includes('arcana')) return '🔮';
  if (idLower.includes('athletics')) return '💪';
  if (idLower.includes('deception')) return '🎭';
  if (idLower.includes('history')) return '📚';
  if (idLower.includes('insight')) return '👁️';
  if (idLower.includes('intimidation')) return '😠';
  if (idLower.includes('investigation')) return '🔍';
  if (idLower.includes('medicine')) return '⚕️';
  if (idLower.includes('nature')) return '🌿';
  if (idLower.includes('perception')) return '👀';
  if (idLower.includes('performance')) return '🎪';
  if (idLower.includes('persuasion')) return '💬';
  if (idLower.includes('religion')) return '⛪';
  if (idLower.includes('sleight')) return '✋';
  if (idLower.includes('stealth')) return '🥷';
  if (idLower.includes('survival')) return '🏕️';

  // Default for weapons/armor
  if (idLower.includes('weapon')) return '⚔️';
  if (idLower.includes('armor')) return '🛡️';

  return '📦';
}

// Helper function to get icon for bundles
function getBundleIcon(
  items: Array<{ name: string; quantity: number }>
): string {
  // Check first item to determine bundle type
  if (items.length > 0) {
    const firstName = items[0].name.toLowerCase();
    if (firstName.includes('armor') || firstName.includes('bow')) return '🏹';
    if (firstName.includes('weapon')) return '⚔️';
  }
  return '📦';
}
