import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Language } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

interface LanguageChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

// Helper to convert Language enum to display name
function getLanguageDisplayName(languageEnum: Language): string {
  const languageNames: Record<Language, string> = {
    [Language.UNSPECIFIED]: 'Unknown',
    [Language.COMMON]: 'Common',
    [Language.DWARVISH]: 'Dwarvish',
    [Language.ELVISH]: 'Elvish',
    [Language.GIANT]: 'Giant',
    [Language.GNOMISH]: 'Gnomish',
    [Language.GOBLIN]: 'Goblin',
    [Language.HALFLING]: 'Halfling',
    [Language.ORC]: 'Orc',
    [Language.ABYSSAL]: 'Abyssal',
    [Language.CELESTIAL]: 'Celestial',
    [Language.DRACONIC]: 'Draconic',
    [Language.DEEP_SPEECH]: 'Deep Speech',
    [Language.INFERNAL]: 'Infernal',
    [Language.PRIMORDIAL]: 'Primordial',
    [Language.SYLVAN]: 'Sylvan',
    [Language.UNDERCOMMON]: 'Undercommon',
  };
  return languageNames[languageEnum] || 'Unknown';
}

// Get all available languages organized by type
function getAllLanguages() {
  const standard = [
    Language.COMMON,
    Language.DWARVISH,
    Language.ELVISH,
    Language.GIANT,
    Language.GNOMISH,
    Language.GOBLIN,
    Language.HALFLING,
    Language.ORC,
  ];

  const exotic = [
    Language.ABYSSAL,
    Language.CELESTIAL,
    Language.DRACONIC,
    Language.DEEP_SPEECH,
    Language.INFERNAL,
    Language.PRIMORDIAL,
    Language.SYLVAN,
    Language.UNDERCOMMON,
  ];

  return { standard, exotic };
}

export function LanguageChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: LanguageChoiceProps) {
  const handleLanguageToggle = (languageId: string) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [languageId]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(languageId)
        ? currentSelections.filter((id) => id !== languageId)
        : [...currentSelections, languageId].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit language options
  if (choice.optionSet.case === 'explicitOptions') {
    const options = choice.optionSet.value.options;

    return (
      <div className="space-y-3">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
            ({currentSelections.length}/{choice.chooseCount} selected)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((option) => {
            if (option.optionType.case !== 'item') return null;

            const language = option.optionType.value;
            const isSelected = currentSelections.includes(language.itemId);
            const isDisabled =
              !isSelected && currentSelections.length >= choice.chooseCount;

            return (
              <button
                key={language.itemId}
                type="button"
                onClick={
                  isDisabled
                    ? undefined
                    : () => handleLanguageToggle(language.itemId)
                }
                disabled={isDisabled}
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
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  outline: 'none',
                  opacity: isDisabled ? 0.5 : 1,
                  transform: 'translateY(0)',
                  boxShadow: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && !isDisabled) {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow =
                      '0 4px 12px rgba(0,0,0,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isDisabled) {
                    e.currentTarget.style.borderColor = 'var(--border-primary)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <span style={{ fontSize: '18px', lineHeight: '1' }}>💬</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="font-medium">{language.name}</div>
                  {/* ItemReference no longer has description in v0.1.13 */}
                </div>
                {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle category reference (typical for language choices)
  if (choice.optionSet.case === 'categoryReference') {
    const category = choice.optionSet.value;
    const excludeIds = category.excludeIds || [];
    const { standard, exotic } = getAllLanguages();

    // Filter out excluded languages
    const availableStandard = standard.filter(
      (lang) => !excludeIds.includes(Language[lang].toLowerCase())
    );
    const availableExotic = exotic.filter(
      (lang) => !excludeIds.includes(Language[lang].toLowerCase())
    );

    return (
      <div className="space-y-4">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
            ({currentSelections.length}/{choice.chooseCount} selected)
          </span>
        </div>

        {/* Standard Languages */}
        {availableStandard.length > 0 && (
          <div
            className="border rounded-lg p-4"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--card-bg)',
            }}
          >
            <div
              className="font-medium mb-3 text-sm"
              style={{ color: 'var(--accent-primary)' }}
            >
              Standard Languages
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableStandard.map((language) => {
                const languageId = Language[language].toLowerCase();
                const languageName = getLanguageDisplayName(language);
                const isSelected = currentSelections.includes(languageId);
                const isDisabled =
                  !isSelected && currentSelections.length >= choice.chooseCount;

                return (
                  <button
                    key={languageId}
                    type="button"
                    onClick={
                      isDisabled
                        ? undefined
                        : () => handleLanguageToggle(languageId)
                    }
                    disabled={isDisabled}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: isSelected
                        ? 'var(--accent-primary)'
                        : 'transparent',
                      borderRadius: '4px',
                      border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'}`,
                      fontSize: '13px',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      outline: 'none',
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.backgroundColor =
                          'var(--bg-secondary)';
                        e.currentTarget.style.borderColor =
                          'var(--border-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: '1' }}>
                      💬
                    </span>
                    <span className="text-sm flex-1">{languageName}</span>
                    {isSelected && <span style={{ fontSize: '12px' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Exotic Languages */}
        {availableExotic.length > 0 && (
          <div
            className="border rounded-lg p-4"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--card-bg)',
            }}
          >
            <div
              className="font-medium mb-3 text-sm"
              style={{ color: 'var(--accent-primary)' }}
            >
              Exotic Languages
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableExotic.map((language) => {
                const languageId = Language[language].toLowerCase();
                const languageName = getLanguageDisplayName(language);
                const isSelected = currentSelections.includes(languageId);
                const isDisabled =
                  !isSelected && currentSelections.length >= choice.chooseCount;

                return (
                  <button
                    key={languageId}
                    type="button"
                    onClick={
                      isDisabled
                        ? undefined
                        : () => handleLanguageToggle(languageId)
                    }
                    disabled={isDisabled}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: isSelected
                        ? 'var(--accent-primary)'
                        : 'transparent',
                      borderRadius: '4px',
                      border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'}`,
                      fontSize: '13px',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      outline: 'none',
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.backgroundColor =
                          'var(--bg-secondary)';
                        e.currentTarget.style.borderColor =
                          'var(--border-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isDisabled) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: '1' }}>
                      💬
                    </span>
                    <span className="text-sm flex-1">{languageName}</span>
                    {isSelected && <span style={{ fontSize: '12px' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Show validation message */}
        {currentSelections.length > 0 &&
          currentSelections.length < choice.chooseCount && (
            <div
              className="text-sm p-2 rounded"
              style={{
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              Select {choice.chooseCount - currentSelections.length} more
              language
              {choice.chooseCount - currentSelections.length !== 1 ? 's' : ''}
            </div>
          )}

        {currentSelections.length === choice.chooseCount && (
          <div
            className="text-sm p-2 rounded"
            style={{
              color: 'var(--accent-primary)',
              backgroundColor: 'var(--accent-primary)15',
            }}
          >
            ✓ All language selections complete
          </div>
        )}
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
        Unsupported language choice structure: {choice.optionSet.case}
      </div>
    </div>
  );
}
