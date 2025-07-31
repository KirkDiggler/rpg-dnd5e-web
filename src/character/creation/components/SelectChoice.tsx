import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useRef, useState } from 'react';

interface SelectChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
  label?: string;
}

export function SelectChoice({
  choice,
  onSelectionChange,
  currentSelections,
  label,
}: SelectChoiceProps) {
  const [selectedValues, setSelectedValues] =
    useState<string[]>(currentSelections);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setSelectedValues(currentSelections);
  }, [currentSelections]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (choice.chooseCount === 1) {
      // Single select
      const value = e.target.value;
      setSelectedValues(value ? [value] : []);
      onSelectionChange(choice.id, value ? [value] : []);
    } else {
      // Multi-select
      const selected = Array.from(
        e.target.selectedOptions,
        (option) => option.value
      );
      if (selected.length <= choice.chooseCount) {
        setSelectedValues(selected);
        onSelectionChange(choice.id, selected);
      }
    }
  };

  if (choice.optionSet.case !== 'explicitOptions') {
    return (
      <div style={{ color: 'var(--text-muted)' }}>
        Unsupported choice type: {choice.optionSet.case}
      </div>
    );
  }

  const options = choice.optionSet.value.options;
  const isMultiple = choice.chooseCount > 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={`choice-${choice.id}`}
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label || choice.description}
        </label>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {isMultiple ? `Select up to ${choice.chooseCount}` : 'Select one'}
        </span>
      </div>

      <select
        ref={selectRef}
        id={`choice-${choice.id}`}
        multiple={isMultiple}
        value={isMultiple ? selectedValues : selectedValues[0] || ''}
        onChange={handleChange}
        className="w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
          color: 'var(--text-primary)',
          minHeight: isMultiple ? '120px' : '40px',
          fontSize: '14px',
        }}
        size={isMultiple ? Math.min(options.length, 6) : undefined}
      >
        {!isMultiple && (
          <option value="" style={{ color: 'var(--text-muted)' }}>
            -- Select {label || 'an option'} --
          </option>
        )}

        {options.map((option, index) => {
          let optionValue = '';
          let optionLabel = '';

          if (option.optionType.case === 'item') {
            const item = option.optionType.value;
            optionValue = item.itemId;
            optionLabel = item.name;
          } else if (option.optionType.case === 'countedItem') {
            const counted = option.optionType.value;
            optionValue = counted.itemId;
            optionLabel = `${counted.name}${counted.count > 1 ? ` (${counted.count})` : ''}`;
          } else if (option.optionType.case === 'bundle') {
            optionValue = `bundle_${index}`;
            optionLabel = `Equipment Bundle ${index + 1}`;
          } else if (option.optionType.case === 'nestedChoice') {
            optionValue = `nested_${index}`;
            optionLabel =
              option.optionType.value.description || `Choice ${index + 1}`;
          }

          const isDisabled =
            isMultiple &&
            !selectedValues.includes(optionValue) &&
            selectedValues.length >= choice.chooseCount;

          return (
            <option
              key={optionValue}
              value={optionValue}
              disabled={isDisabled}
              style={{
                color: isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
                padding: '4px',
              }}
            >
              {optionLabel}
            </option>
          );
        })}
      </select>

      {isMultiple && selectedValues.length > 0 && (
        <div className="text-xs" style={{ color: 'var(--accent-primary)' }}>
          Selected: {selectedValues.length} / {choice.chooseCount}
        </div>
      )}
    </div>
  );
}
