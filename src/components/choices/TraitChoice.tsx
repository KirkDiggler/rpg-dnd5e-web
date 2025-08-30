import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Check, Crown, Flame, Shield, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';

interface TraitChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedTraits: string[]) => void;
  currentSelections: string[];
}

// Helper function to get icon based on trait type
function getTraitIcon(traitName: string): React.ReactNode {
  const name = traitName.toLowerCase();

  if (name.includes('draconic') || name.includes('dragon')) {
    return <Flame className="w-4 h-4" />;
  }
  if (name.includes('ancestry') || name.includes('heritage')) {
    return <Crown className="w-4 h-4" />;
  }
  if (name.includes('defense') || name.includes('resistance')) {
    return <Shield className="w-4 h-4" />;
  }
  if (name.includes('fighting') || name.includes('combat')) {
    return <Zap className="w-4 h-4" />;
  }

  return <Sparkles className="w-4 h-4" />;
}

// Helper function to get trait color based on type
function getTraitColor(traitName: string): string {
  const name = traitName.toLowerCase();

  if (name.includes('red') || name.includes('fire')) return '#ef4444';
  if (name.includes('blue') || name.includes('lightning')) return '#3b82f6';
  if (name.includes('green') || name.includes('poison')) return '#22c55e';
  if (name.includes('white') || name.includes('cold')) return '#e5e7eb';
  if (name.includes('black') || name.includes('acid')) return '#374151';
  if (name.includes('gold') || name.includes('golden')) return '#f59e0b';
  if (name.includes('silver') || name.includes('frost')) return '#94a3b8';
  if (name.includes('bronze') || name.includes('copper')) return '#d97706';
  if (name.includes('brass')) return '#eab308';

  return 'var(--accent-primary)';
}

export function TraitChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: TraitChoiceProps) {
  const [hoveredTrait, setHoveredTrait] = useState<string | null>(null);

  const handleTraitToggle = (traitId: string) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [traitId]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(traitId)
        ? currentSelections.filter((s) => s !== traitId)
        : [...currentSelections, traitId].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit trait options
  if (choice.optionSet.case === 'explicitOptions') {
    const options = choice.optionSet.value.options;

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Crown
            className="w-5 h-5 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
          />
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Trait Selection
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description ||
                `Choose ${choice.chooseCount} trait${choice.chooseCount > 1 ? 's' : ''}`}
            </p>
            {choice.chooseCount > 1 && (
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="text-xs px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'rgba(var(--accent-primary-rgb), 0.2)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {currentSelections.length} / {choice.chooseCount} selected
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {options.map((option, index) => {
            if (option.optionType.case !== 'item') return null;

            const trait = option.optionType.value;
            const isSelected = currentSelections.includes(trait.itemId);
            const isDisabled =
              !isSelected && currentSelections.length >= choice.chooseCount;
            const isHovered = hoveredTrait === trait.itemId;
            const traitColor = getTraitColor(trait.name);

            return (
              <button
                key={`${trait.itemId}_${index}`}
                onClick={() => !isDisabled && handleTraitToggle(trait.itemId)}
                onMouseEnter={() => setHoveredTrait(trait.itemId)}
                onMouseLeave={() => setHoveredTrait(null)}
                disabled={isDisabled}
                className="w-full text-left transition-all duration-200"
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: `2px solid ${
                    isSelected
                      ? traitColor
                      : isHovered && !isDisabled
                        ? 'var(--accent-hover)'
                        : 'var(--border-primary)'
                  }`,
                  backgroundColor: isSelected
                    ? `${traitColor}10`
                    : isHovered && !isDisabled
                      ? 'rgba(var(--accent-primary-rgb), 0.05)'
                      : 'var(--card-bg)',
                  transform:
                    isHovered && !isDisabled
                      ? 'translateX(4px)'
                      : 'translateX(0)',
                  boxShadow: isSelected
                    ? `0 4px 12px ${traitColor}20`
                    : isHovered && !isDisabled
                      ? '0 2px 8px rgba(0, 0, 0, 0.1)'
                      : 'none',
                  opacity: isDisabled ? 0.5 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-2 rounded-full"
                      style={{
                        backgroundColor: isSelected
                          ? traitColor
                          : `${traitColor}30`,
                        color: isSelected ? 'white' : traitColor,
                      }}
                    >
                      {getTraitIcon(trait.name)}
                    </div>
                    <div>
                      <div
                        className="font-medium"
                        style={{
                          color: isSelected
                            ? traitColor
                            : 'var(--text-primary)',
                        }}
                      >
                        {trait.name}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: traitColor,
                        color: 'white',
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle reference options
  if (choice.optionSet.case === 'categoryReference') {
    const refOptions = choice.optionSet.value;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Crown
            className="w-5 h-5 mt-0.5"
            style={{ color: 'var(--accent-primary)' }}
          />
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Trait References
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description || 'Reference options available'}
            </p>
          </div>
        </div>
        <div
          className="text-sm p-3 rounded-lg"
          style={{
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-muted)',
          }}
        >
          Category: {refOptions.categoryId}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
      Unsupported trait choice type: {choice.optionSet.case}
    </div>
  );
}
