import { useEffect, type ReactNode } from 'react';

export type StudioSidebarSection =
  | 'arrange'
  | 'walls'
  | 'tables'
  | 'size'
  | 'doors'
  | 'labels'
  | 'region';

/** One presentation slot, not another document or selection owner. Children
 * stay mounted while tucked away so navigation does not commit/discard forms. */
export function StudioSidebar({
  open,
  section,
  onSectionChange,
  onToggle,
  children,
}: {
  open: boolean;
  section: StudioSidebarSection;
  onSectionChange(section: StudioSidebarSection): void;
  onToggle(): void;
  children: ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    const toggle = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'n'
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [role="alertdialog"]'
        )
      )
        return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, [onToggle]);

  return (
    <aside
      id="studio-sidebar"
      aria-label="Studio options"
      hidden={!open}
      className={`es-sidebar ${section === 'arrange' ? 'es-sidebar-compact' : ''}`}
    >
      <div className="es-sidebar-header">
        <nav className="es-buttons" aria-label="Sidebar sections">
          {(['arrange', 'walls', 'tables'] as const).map((name) => (
            <button
              type="button"
              key={name}
              aria-pressed={section === name}
              onClick={() => onSectionChange(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide options"
          title="Hide options (N)"
        >
          ×
        </button>
      </div>
      <div className="es-sidebar-body">{children}</div>
    </aside>
  );
}
