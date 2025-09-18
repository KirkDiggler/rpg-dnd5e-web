import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';

interface SimpleChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selections: string[]) => void;
  currentSelections: string[];
}

export function SimpleChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: SimpleChoiceProps) {
  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h4 className="font-medium text-gray-900 mb-2">
        {choice.description || 'Choice'}
      </h4>
      <p className="text-sm text-gray-600 mb-3">
        Choose {choice.chooseCount} option{choice.chooseCount !== 1 ? 's' : ''}{' '}
        ({choice.options?.case || 'unknown type'})
      </p>

      {currentSelections.length > 0 && (
        <div className="mt-3 p-2 bg-blue-50 rounded">
          <p className="text-sm font-medium text-blue-800">
            Current selections:
          </p>
          <ul className="text-sm text-blue-700 mt-1">
            {currentSelections.map((selection, index) => (
              <li key={index}>• {selection}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => onSelectionChange(choice.id, [])}
        className="mt-3 text-sm text-blue-600 hover:text-blue-800"
      >
        Clear selections
      </button>
    </div>
  );
}
