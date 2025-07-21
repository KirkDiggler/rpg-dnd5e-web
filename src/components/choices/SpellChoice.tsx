import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';

interface SpellChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

export function SpellChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: SpellChoiceProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSpellToggle = (spellId: string) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [spellId]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(spellId)
        ? currentSelections.filter((id) => id !== spellId)
        : [...currentSelections, spellId].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit spell options
  if (choice.optionSet.case === 'explicitOptions') {
    const options = choice.optionSet.value.options;

    // Filter spells by search term
    const filteredOptions = options.filter((option) => {
      if (option.optionType.case !== 'item') return true;
      const spell = option.optionType.value;
      return spell.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
      <div className="space-y-4">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
            ({currentSelections.length}/{choice.chooseCount} selected)
          </span>
        </div>

        {/* Search bar for filtering spells */}
        {options.length > 6 && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search spells..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{
                borderColor: 'var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredOptions.map((option) => {
            if (option.optionType.case !== 'item') return null;

            const spell = option.optionType.value;
            const isSelected = currentSelections.includes(spell.itemId);
            const isDisabled =
              !isSelected && currentSelections.length >= choice.chooseCount;

            return (
              <div
                key={spell.itemId}
                className={`border rounded-md p-3 ${isDisabled ? 'opacity-50' : ''}`}
                style={{
                  borderColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--border-primary)',
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)15'
                    : 'var(--card-bg)',
                }}
              >
                <label className="flex items-start cursor-pointer">
                  <input
                    type={choice.chooseCount === 1 ? 'radio' : 'checkbox'}
                    name={choice.chooseCount === 1 ? choice.id : undefined}
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => handleSpellToggle(spell.itemId)}
                    className="mr-3 mt-1"
                  />
                  <div className="flex-1">
                    <div
                      className="font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {spell.name}
                    </div>
                    {/* ItemReference no longer has description in v0.1.13 */}
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        {filteredOptions.length === 0 && searchTerm && (
          <div
            className="text-center py-4"
            style={{ color: 'var(--text-muted)' }}
          >
            No spells found matching "{searchTerm}"
          </div>
        )}
      </div>
    );
  }

  // Handle category reference (e.g., "wizard-cantrips", "level-1-spells")
  if (choice.optionSet.case === 'categoryReference') {
    const category = choice.optionSet.value;

    return (
      <div className="space-y-3">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
        </div>

        <div
          className="border rounded-lg p-4"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          <div className="space-y-2">
            <div
              className="font-medium text-sm"
              style={{ color: 'var(--accent-primary)' }}
            >
              Spell Category: {category.categoryId}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              This spell choice requires fetching spells from the API based on
              category.
              <br />
              Category ID: {category.categoryId}
              <br />
              Excluded IDs:{' '}
              {category.excludeIds.length > 0
                ? category.excludeIds.join(', ')
                : 'None'}
            </div>
            <div
              className="text-xs mt-3 p-2 rounded"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-muted)',
              }}
            >
              📝 TODO: Implement spell fetching by category using
              ListSpellsByLevel API
              {category.categoryId.includes('cantrip') && (
                <>
                  <br />• Level: 0 (cantrips)
                  <br />• Class: {category.categoryId.replace('-cantrips', '')}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 border rounded"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--card-bg)',
      }}
    >
      <div style={{ color: 'var(--text-primary)' }}>
        Unsupported spell choice structure: {choice.optionSet.case}
      </div>
    </div>
  );
}
