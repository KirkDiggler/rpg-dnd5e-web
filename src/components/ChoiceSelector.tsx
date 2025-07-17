import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { cn } from '../utils/cn';

interface ChoiceSelectorProps {
  choice: Choice;
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  className?: string;
}

export function ChoiceSelector({
  choice,
  selected,
  onSelectionChange,
  className,
}: ChoiceSelectorProps) {
  const [localSelected, setLocalSelected] = useState<string[]>(selected);

  const handleToggle = (option: string) => {
    const newSelected = [...localSelected];
    const index = newSelected.indexOf(option);

    if (index > -1) {
      // Remove if already selected
      newSelected.splice(index, 1);
    } else {
      // Add if not selected
      if (newSelected.length < choice.choose) {
        newSelected.push(option);
      } else {
        // Replace the oldest selection if at limit
        newSelected.shift();
        newSelected.push(option);
      }
    }

    setLocalSelected(newSelected);
    onSelectionChange(newSelected);
  };

  const isSelected = (option: string) => localSelected.includes(option);
  const isAtLimit = localSelected.length >= choice.choose;

  // Format option display
  const formatOption = (option: string) => {
    // Convert snake_case or kebab-case to Title Case
    return option
      .split(/[_-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-text-primary">
          Choose {choice.choose} {formatOption(choice.type)}
          {choice.choose > 1 ? 's' : ''}
        </h4>
        <span className="text-xs text-text-muted">
          {localSelected.length} / {choice.choose} selected
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {choice.options.map((option) => {
          const selected = isSelected(option);
          const disabled = !selected && isAtLimit;

          return (
            <button
              key={option}
              onClick={() => handleToggle(option)}
              disabled={disabled}
              className={cn(
                'px-3 py-2 rounded-md text-sm transition-all duration-200',
                'border border-border-primary',
                selected
                  ? [
                      'bg-accent-primary text-white',
                      'border-accent-primary shadow-sm',
                    ]
                  : disabled
                    ? [
                        'bg-gray-700 text-gray-500',
                        'cursor-not-allowed opacity-50',
                      ]
                    : [
                        'bg-bg-secondary hover:bg-bg-primary',
                        'text-text-primary hover:border-accent-primary',
                        'cursor-pointer',
                      ]
              )}
            >
              {formatOption(option)}
            </button>
          );
        })}
      </div>

      {choice.from && (
        <p className="text-xs text-text-muted mt-2">From: {choice.from}</p>
      )}
    </div>
  );
}
