import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';

// Display info for any enum value
export interface EnumDisplayInfo {
  name: string;
  description?: string;
}

// Layout options - implement 'rows' and 'grouped' now, others later
export type ChoiceLayout = 'rows' | 'grid' | 'chips' | 'grouped';

export interface EnumChoiceProps<T extends number> {
  // Core data
  choice: Choice;
  available: T[];
  currentSelections: T[];

  // Display - function that returns display info for each enum value
  getDisplayInfo: (value: T) => EnumDisplayInfo;

  // Optional grouping - when provided, items are grouped under headers
  getGroup?: (value: T) => string;
  groupOrder?: string[]; // Optional ordering of group headers

  // Layout hint (defaults to 'rows', auto-uses 'grouped' if getGroup provided)
  layout?: ChoiceLayout;

  // Callback
  onSelectionChange: (choiceId: string, selections: T[]) => void;
}

/**
 * The box or dot that says an option can be picked, and whether it is.
 *
 * WITHOUT IT A MULTI-PICK LOOKS LIKE A LIST YOU PICK ONE FROM. The rows layout
 * drew no mark at all — its input is `display: none` and nothing stood in for
 * it — so ten instruments rendered as ten plain bars directly under a grouped
 * skills list that DID draw checkboxes. Two controls, the same question, two
 * different affordances, and the one that looked single-select was the one
 * asking for three (Kirk's walk, rpg-project#397).
 *
 * Square for a pick that ADDS, round for one that REPLACES, which is the same
 * shape language a checkbox and a radio carry.
 */
function SelectionMark({
  isSelected,
  replaces,
}: {
  isSelected: boolean;
  replaces: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '18px',
        height: '18px',
        marginTop: '2px',
        borderRadius: replaces ? '50%' : '4px',
        border: `2px solid ${isSelected ? 'white' : 'var(--border-primary)'}`,
        backgroundColor: isSelected ? 'white' : 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isSelected && (
        <span
          style={{
            width: '10px',
            height: '10px',
            borderRadius: replaces ? '50%' : '2px',
            backgroundColor: 'var(--accent-primary)',
          }}
        />
      )}
    </span>
  );
}

export function EnumChoice<T extends number>({
  choice,
  available,
  currentSelections,
  getDisplayInfo,
  getGroup,
  groupOrder,
  layout,
  onSelectionChange,
}: EnumChoiceProps<T>) {
  // Filter out UNSPECIFIED values (value 0) - these should never be displayed to users
  const filteredAvailable = available.filter((item) => item !== 0);

  // Auto-detect layout
  const effectiveLayout = layout || (getGroup ? 'grouped' : 'rows');

  // A CHOOSE-ONE PICK REPLACES; A CHOOSE-MANY PICK ADDS. That difference is
  // the whole of the control's behaviour, and it is read off the requirement's
  // own count rather than off what the requirement is for — so any choose-N
  // skill, tool, language or fighting-style requirement behaves the same way.
  const replaces = choice.chooseCount === 1;

  const handleToggle = (value: T) => {
    if (replaces) {
      onSelectionChange(choice.id, [value]);
      return;
    }
    const newSelections = currentSelections.includes(value)
      ? currentSelections.filter((s) => s !== value)
      : [...currentSelections, value].slice(0, choice.chooseCount);
    onSelectionChange(choice.id, newSelections);
  };

  /**
   * Whether an unpicked option is refused right now.
   *
   * A FULL CHOOSE-ONE CHOICE IS NOT FULL, it is DECIDED, and a decision can be
   * changed. Treating it as full disabled every other option the moment the
   * first was picked, which locked the player into their first click with no
   * way back — visible on every single-pick requirement in creation, not just
   * the bard's. The limit only refuses a pick that would ADD an N+1th.
   */
  const refusesMore = (isSelected: boolean) =>
    !isSelected && !replaces && currentSelections.length >= choice.chooseCount;

  // Render grouped layout
  if (effectiveLayout === 'grouped' && getGroup) {
    // Group items by the group function
    const itemsByGroup: Record<string, T[]> = {};

    filteredAvailable.forEach((item) => {
      const group = getGroup(item);
      if (!itemsByGroup[group]) {
        itemsByGroup[group] = [];
      }
      itemsByGroup[group].push(item);
    });

    // Order groups if specified
    const groups = groupOrder || Object.keys(itemsByGroup);

    return (
      <div className="space-y-4">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          {choice.chooseCount > 1 && (
            <span
              className="text-sm ml-2"
              style={{ color: 'var(--text-muted)' }}
            >
              ({currentSelections.length}/{choice.chooseCount} selected)
            </span>
          )}
        </div>

        {groups.map((group) => {
          const items = itemsByGroup[group];
          if (!items || items.length === 0) return null;

          return (
            <div
              key={group}
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
                {group}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item) => {
                  const isSelected = currentSelections.includes(item);
                  const isDisabled = refusesMore(isSelected);
                  const info = getDisplayInfo(item);

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={
                        isDisabled ? undefined : () => handleToggle(item)
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
                      }}
                      className="hover:transform hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <SelectionMark
                        isSelected={isSelected}
                        replaces={replaces}
                      />
                      <span>{info.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render rows layout (default)
  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          marginBottom: '8px',
        }}
      >
        {choice.description}
        {choice.chooseCount > 1 && (
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            ({currentSelections.length}/{choice.chooseCount} selected)
          </span>
        )}
        {choice.chooseCount === 1 && (
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            (Choose {choice.chooseCount})
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredAvailable.map((item) => {
          const isSelected = currentSelections.includes(item);
          const isDisabled = refusesMore(isSelected);
          const info = getDisplayInfo(item);

          return (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: isSelected
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                border: `2px solid ${
                  isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'
                }`,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                color: isSelected ? 'white' : 'var(--text-primary)',
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              <input
                type={replaces ? 'radio' : 'checkbox'}
                checked={isSelected}
                onChange={() => !isDisabled && handleToggle(item)}
                disabled={isDisabled}
                style={{ display: 'none' }}
              />
              <SelectionMark isSelected={isSelected} replaces={replaces} />
              <span
                style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
              >
                <span style={{ fontSize: '14px', fontWeight: '600' }}>
                  {info.name}
                </span>
                {info.description && (
                  <span
                    style={{
                      fontSize: '12px',
                      marginTop: '4px',
                      opacity: isSelected ? 0.9 : 0.7,
                    }}
                  >
                    {info.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
