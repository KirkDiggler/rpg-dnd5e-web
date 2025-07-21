// DEPRECATED: This component uses old Choice properties (choose, from, type, options)
// Should be replaced with UnifiedChoiceSelector - see issue #93
/* eslint-disable */
// @ts-nocheck
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
    <div className={cn('space-y-3', className)}>
      <div
        className="p-4 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Choose {choice.choose} {formatOption(choice.type)}
            {choice.choose > 1 ? 's' : ''}
          </h4>
          <span
            className="text-xs"
            style={{
              color:
                localSelected.length === choice.choose
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
            }}
          >
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
                className="px-3 py-2 rounded-md text-sm transition-all duration-200"
                style={{
                  backgroundColor: selected
                    ? 'var(--accent-primary)'
                    : disabled
                      ? 'var(--bg-primary)'
                      : 'var(--card-bg)',
                  border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  color: selected
                    ? 'white'
                    : disabled
                      ? 'var(--text-secondary)'
                      : 'var(--text-primary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled && !selected) {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled && !selected) {
                    e.currentTarget.style.borderColor = 'var(--border-primary)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                {formatOption(option)}
              </button>
            );
          })}
        </div>

        {choice.from && (
          <p
            className="text-xs mt-3"
            style={{
              color: 'var(--text-primary)',
              opacity: 0.7,
            }}
          >
            From: {choice.from}
          </p>
        )}
      </div>
    </div>
  );
}
