import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const SECTIONS = [
  ['monsters', 'Monsters'],
  ['factions', 'Factions'],
  ['dispositions', 'Dispositions'],
  ['intel', 'Intel'],
  ['tables', 'Tables'],
  ['selection', 'Selection'],
  ['edit', 'Edit'],
] as const;
type Section = (typeof SECTIONS)[number][0];

/** Navigation and visibility only. Panels stay mounted, so tucking the
 * inspector away cannot discard in-progress input or change document state. */
export function WorldBuilderInspector({
  selectionKey,
  children,
}: {
  selectionKey: string;
  children: ReactNode;
}) {
  const contentId = useId();
  const content = useRef<HTMLDivElement>(null);
  const previousSelection = useRef(selectionKey);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState<Section>('monsters');
  const [navigation, setNavigation] = useState(0);

  useEffect(() => {
    if (selectionKey !== previousSelection.current) {
      previousSelection.current = selectionKey;
      if (selectionKey) {
        setCollapsed(false);
        setActive('selection');
        setNavigation((value) => value + 1);
      }
    }
  }, [selectionKey]);

  useEffect(() => {
    if (collapsed || navigation === 0) return;
    const container = content.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-inspector-section="${active}"]`
    );
    if (!container || !target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    // Scroll this inspector, not the page or canvas. Keep keyboard focus on
    // the navigation control that opened the panel.
    container.scrollTop +=
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
  }, [active, collapsed, navigation]);

  useEffect(() => {
    const container = content.current;
    if (!container) return;
    // Native toggle does not bubble. Track root summaries as navigation too,
    // but leave nested disclosures alone so they retain their scroll context.
    const onToggle = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLDetailsElement && target.open) {
        const section = SECTIONS.find(
          ([id]) => id === target.dataset.inspectorSection
        );
        if (section) {
          setActive(section[0]);
          setNavigation((value) => value + 1);
        }
      }
    };
    container.addEventListener('toggle', onToggle, true);
    return () => container.removeEventListener('toggle', onToggle, true);
  }, []);

  return (
    <aside
      className="wb-config-inspector"
      data-collapsed={collapsed}
      aria-label="Site nouns"
    >
      <nav className="wb-inspector-nav" aria-label="Configuration sections">
        <button
          type="button"
          aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Expand inspector' : 'Collapse inspector'}
        </button>
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-label={`Configure ${label}`}
            aria-pressed={!collapsed && active === id}
            aria-controls={contentId}
            disabled={id === 'selection' && !selectionKey}
            onClick={() => {
              setCollapsed(false);
              setActive(id);
              setNavigation((value) => value + 1);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        id={contentId}
        ref={content}
        className="wb-panel wb-inspector wb-inspector-content"
        hidden={collapsed}
      >
        {children}
      </div>
    </aside>
  );
}
