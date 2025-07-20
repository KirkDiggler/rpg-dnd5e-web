import type {
  ChoiceOption,
  CountedItemReference,
  ItemBundle,
  ItemReference,
  NestedChoice,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

export interface ChoiceOptionRendererProps {
  option: ChoiceOption;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Renders a single choice option based on its type
 */
export function ChoiceOptionRenderer({
  option,
  isSelected,
  onSelect,
  disabled = false,
}: ChoiceOptionRendererProps) {
  const renderOptionContent = () => {
    switch (option.optionType.case) {
      case 'item': {
        const item = option.optionType.value as ItemReference;
        return (
          <div className="flex items-center justify-between">
            <span>{item.name || item.itemId}</span>
          </div>
        );
      }

      case 'countedItem': {
        const countedItem = option.optionType.value as CountedItemReference;
        return (
          <div className="flex items-center justify-between">
            <span>{countedItem.name || countedItem.itemId}</span>
            <span className="text-sm text-gray-500">
              ×{countedItem.quantity}
            </span>
          </div>
        );
      }

      case 'bundle': {
        const bundle = option.optionType.value as ItemBundle;
        return (
          <div className="space-y-1">
            <div className="font-medium">{bundle.name || 'Item Bundle'}</div>
            <div className="text-sm text-gray-600">
              {bundle.items.map((item, index) => (
                <div key={index}>
                  • {item.name || item.itemId}{' '}
                  {item.quantity > 1 && `×${item.quantity}`}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'nestedChoice': {
        const nested = option.optionType.value as NestedChoice;
        return (
          <div className="space-y-1">
            <div className="font-medium">{nested.description}</div>
            <div className="text-sm text-gray-600">
              Choose {nested.chooseCount} option
              {nested.chooseCount !== 1 ? 's' : ''}
            </div>
          </div>
        );
      }

      default:
        return <span>Unknown option type</span>;
    }
  };

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-full p-3 rounded-lg border transition-all text-left
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {renderOptionContent()}
    </button>
  );
}
