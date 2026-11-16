import { useRef, type KeyboardEvent } from 'react';

export interface StudioTab<K extends string> {
  key: K;
  label: string;
}

/** ONE ROW OF THE ENCOUNTER SIDE'S NAVIGATION (rpg-project#982): a tab bar.
 * The selected tab is the one in the Tab order (roving tabindex);
 * Left/Right move and select along the bar, Home/End to its ends, and Tab
 * leaves it. Each tab names the panel it controls. */
export function StudioTabBar<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  idOf,
  panelId,
  level,
}: {
  /** The bar's accessible name. */
  label: string;
  tabs: readonly StudioTab<K>[];
  selected: K;
  onSelect(key: K): void;
  /** The DOM id of a tab, so its panel can be labelled by it. */
  idOf(key: K): string;
  /** The panel the bar's tabs control. */
  panelId: string;
  level: 'primary' | 'secondary';
}): React.JSX.Element {
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = tabs.findIndex((tab) => tab.key === selected);
    const next =
      event.key === 'ArrowRight'
        ? (at + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const key = tabs[next]!.key;
    onSelect(key);
    refs.current.get(key)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={`es-tabbar es-tabbar-${level}`}
      onKeyDown={move}
    >
      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        return (
          <button
            key={tab.key}
            ref={(node) => {
              if (node) refs.current.set(tab.key, node);
              else refs.current.delete(tab.key);
            }}
            type="button"
            role="tab"
            id={idOf(tab.key)}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
