/**
 * ONE LIST-AND-DETAIL PIECE (rpg-project#984). Two panes within the
 * workspace's height, each scrolling on its own: the list (compact rows —
 * a name, one line of summary, small secondary links) and the chosen row's
 * detail beside it, which stays in view however far down the list the row
 * is. Rows are revealable by their key (rpg-project#983), so a jump lands on
 * the row and the row stays visible in its own pane. Up and Down move the
 * choice; Enter or Right goes to the detail. Below a width the panes stack,
 * the detail after the list, and choosing a row reveals the detail.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { RevealLi } from './RevealDiv';
import {
  revealKeyString,
  useReveal,
  useRevealable,
  type RevealKey,
} from './useReveal';

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

/** Below this width the panes stack. */
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
  label,
  groups,
  selected,
  onSelect,
  detail,
  detailLabel,
  empty,
}: {
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
  const reveal = useReveal();
  const detailKey: RevealKey = { kind: 'list-detail', id: label };
  const detailRef = useRef<HTMLElement | null>(null);
  const registerDetail = useRevealable(detailKey);
  const selectedId = selected ? revealKeyString(selected) : null;
  const choose = (key: RevealKey): void => {
    onSelect(key);
    // Stacked, the detail is below the list: bring it into view.
    if (stacked) reveal(detailKey);
  };
  const rows = groups.flatMap((group) => group.rows);
  const move = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    const target =
      event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : null;
    if (target !== null) {
      event.preventDefault();
      const next = rows[target];
      if (!next) return;
      onSelect(next.key);
      const pane = event.currentTarget.closest('.es-ld-list-pane');
      const buttons =
        pane?.querySelectorAll<HTMLButtonElement>('button.es-ld-choose') ?? [];
      buttons[target]?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (revealKeyString(rows[index]!.key) !== selectedId)
        choose(rows[index]!.key);
      detailRef.current?.focus();
    }
  };
  let index = -1;
  return (
    <div className="es-list-detail" data-stacked={stacked || undefined}>
      <div className="es-ld-list-pane" style={{ overflowY: 'auto' }}>
        {rows.length === 0 && empty}
        {groups.map((group, at) =>
          group.rows.length === 0 ? null : (
            <div key={group.title ?? at} className="es-ld-group">
              {group.title && <h3>{group.title}</h3>}
              <ul aria-label={group.title ?? label} className="es-ld-list">
                {group.rows.map((row) => {
                  index += 1;
                  const mine = index;
                  const id = revealKeyString(row.key);
                  const isSelected = id === selectedId;
                  return (
                    <RevealLi
                      key={id}
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
        ref={(element) => {
          detailRef.current = element;
          registerDetail(element);
        }}
        className="es-ld-detail-pane"
        style={{ overflowY: 'auto' }}
        aria-label={detailLabel}
        tabIndex={-1}
      >
        {detail}
      </section>
    </div>
  );
}
