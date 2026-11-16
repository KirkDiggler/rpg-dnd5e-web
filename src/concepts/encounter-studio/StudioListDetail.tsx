/**
 * ONE LIST-AND-DETAIL PIECE (rpg-project#984). Two panes that fill the
 * height their container gives them, each scrolling on its own: the list
 * (compact rows — a name, one line of summary, small secondary links) and
 * the chosen row's detail beside it, which stays in view however far down
 * the list the row is. The piece takes its height from its container (a
 * flex chain with `min-height: 0`, see `.es-encounter-panel` in the CSS),
 * never a guess at the viewport.
 *
 * Rows are revealable by their key (rpg-project#983): a jump lands on the
 * row, CHOOSES it so its detail shows, and marks it. Choosing a row by hand
 * marks nothing — the chosen row shows the choice; the mark is for jumps.
 *
 * KEYBOARD: the list is one Tab stop (a roving tabindex over the rows).
 * Up and Down move and choose; Home and End go to the ends; Enter or Right
 * moves focus into the detail; Escape anywhere in the detail, or Left on
 * the detail itself, returns to the chosen row. A row's secondary links
 * stay in the Tab order: Tab from the focused row reaches them.
 *
 * Below a width the panes stack, the detail after the list, and choosing a
 * row scrolls the detail into view once it has rendered.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { RevealLi } from './RevealDiv';
import { revealKeyString, type RevealKey } from './useReveal';

type DataAttributes = { [name: `data-${string}`]: string | undefined };

export interface ListDetailRow {
  /** The row's identity, and the key a jump reveals it by. */
  key: RevealKey;
  name: ReactNode;
  /** One line under the name. */
  summary?: ReactNode;
  /** Small secondary links, outside the row's own button. */
  links?: ReactNode;
  /** Extra attributes on the row's button and on the row itself. */
  buttonData?: DataAttributes;
  rowData?: DataAttributes;
}

export interface ListDetailGroup {
  /** A heading over the group's rows, and its list's name. */
  title?: string;
  rows: readonly ListDetailRow[];
}

/** Below this width the panes stack: the one source of the stacked layout
 * (the CSS styles `[data-stacked]`, it has no media query of its own). */
export const STACK_QUERY = '(max-width: 52rem)';

function useStacked(): boolean {
  const query = (): MediaQueryList | null => {
    try {
      return window.matchMedia?.(STACK_QUERY) ?? null;
    } catch {
      return null;
    }
  };
  const [stacked, setStacked] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return;
    const changed = (): void => setStacked(list.matches);
    list.addEventListener?.('change', changed);
    return () => list.removeEventListener?.('change', changed);
  }, []);
  return stacked;
}

export function StudioListDetail({
  id,
  label,
  groups,
  selected,
  onSelect,
  detail,
  detailLabel,
  empty,
}: {
  /** The piece's own id: its panes' element ids derive from it. */
  id: string;
  /** The list's name when it has one group with no title. */
  label: string;
  groups: readonly ListDetailGroup[];
  selected: RevealKey | null;
  onSelect(key: RevealKey): void;
  detail: ReactNode;
  detailLabel: string;
  /** Shown in the list pane when there are no rows. */
  empty?: ReactNode;
}): React.JSX.Element {
  const stacked = useStacked();
  const listRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const selectedId = selected ? revealKeyString(selected) : null;
  const rows = groups.flatMap((group) => group.rows);
  const selectedIndex = rows.findIndex(
    (row) => revealKeyString(row.key) === selectedId
  );
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;
  // Stacked, a row chosen by hand brings its detail into view — after the
  // detail has rendered, so the scroll lands on the new detail.
  const [scrollToDetail, setScrollToDetail] = useState(0);
  useLayoutEffect(() => {
    if (scrollToDetail > 0)
      detailRef.current?.scrollIntoView({ block: 'start' });
  }, [scrollToDetail]);
  const choose = (key: RevealKey): void => {
    onSelect(key);
    if (stacked) setScrollToDetail((count) => count + 1);
  };
  const rowButtons = (): HTMLButtonElement[] => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
      'button.es-ld-choose'
    ) ?? []),
  ];
  const focusRow = (index: number): void => {
    rowButtons()[index]?.focus();
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = rows.length - 1;
    const target =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target !== null) {
      event.preventDefault();
      if (target !== index) onSelect(rows[target]!.key);
      focusRow(target);
      return;
    }
    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (revealKeyString(rows[index]!.key) !== selectedId)
        onSelect(rows[index]!.key);
      detailRef.current?.focus();
    }
  };
  const backToList = (event: KeyboardEvent<HTMLElement>): void => {
    const atStart = event.target === event.currentTarget;
    if (event.key === 'Escape' || (event.key === 'ArrowLeft' && atStart)) {
      event.preventDefault();
      focusRow(tabStop);
    }
  };
  let index = -1;
  return (
    <div
      className="es-list-detail"
      data-stacked={stacked || undefined}
      id={`${id}-list-detail`}
    >
      <div
        ref={listRef}
        className="es-ld-list-pane"
        id={`${id}-list`}
        data-scroll-pane=""
      >
        {rows.length === 0 && empty}
        {groups.map((group, at) =>
          group.rows.length === 0 ? null : (
            <div key={group.title ?? at} className="es-ld-group">
              {group.title && <h3>{group.title}</h3>}
              <ul aria-label={group.title ?? label} className="es-ld-list">
                {group.rows.map((row) => {
                  index += 1;
                  const mine = index;
                  const key = revealKeyString(row.key);
                  const isSelected = key === selectedId;
                  return (
                    <RevealLi
                      key={key}
                      revealKey={row.key}
                      // A jump to a row chooses it, so its detail shows.
                      onReveal={() => {
                        if (!isSelected) onSelect(row.key);
                      }}
                      className="es-ld-row"
                      data-selected={isSelected || undefined}
                      {...row.rowData}
                    >
                      <button
                        type="button"
                        className="es-ld-choose"
                        aria-pressed={isSelected}
                        tabIndex={mine === tabStop ? 0 : -1}
                        onClick={() => choose(row.key)}
                        onKeyDown={(event) => move(event, mine)}
                        {...row.buttonData}
                      >
                        <span className="es-ld-name">{row.name}</span>
                        {row.summary !== undefined && (
                          <>
                            {' · '}
                            <span className="es-ld-summary">{row.summary}</span>
                          </>
                        )}
                      </button>
                      {row.links && (
                        <div className="es-ld-links">{row.links}</div>
                      )}
                    </RevealLi>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </div>
      <section
        ref={detailRef}
        id={`${id}-detail`}
        className="es-ld-detail-pane"
        data-scroll-pane=""
        aria-label={detailLabel}
        tabIndex={-1}
        onKeyDown={backToList}
      >
        {detail}
      </section>
    </div>
  );
}
