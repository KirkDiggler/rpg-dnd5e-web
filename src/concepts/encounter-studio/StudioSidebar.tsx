import { useEffect, type ReactNode } from 'react';

/** The sidebar sections still in use. Build has one, the inspector, so its
 * sidebar renders no section nav; Regions keeps its own (S3 retires it). */
export type StudioSidebarSection =
  | 'inspector'
  | 'regions'
  | 'region'
  | 'labels'
  | 'tables';

/** One presentation slot, not another document or selection owner. Children
 * stay mounted while tucked away so navigation does not commit/discard forms. */
export function StudioSidebar({
  open,
  section,
  onSectionChange,
  onToggle,
  children,
  sections = [],
  keyboardEnabled = true,
  compact = false,
}: {
  open: boolean;
  section: StudioSidebarSection;
  onSectionChange(section: StudioSidebarSection): void;
  onToggle(): void;
  children: ReactNode;
  /** Absent or empty: no section nav (the Build inspector). */
  sections?: readonly { id: StudioSidebarSection; label: string }[];
  keyboardEnabled?: boolean;
  compact?: boolean;
}): React.JSX.Element {
  useEffect(() => {
    if (!keyboardEnabled) return;
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
  }, [onToggle, keyboardEnabled]);

  return (
    <aside
      id="studio-sidebar"
      aria-label="Studio options"
      hidden={!open}
      className={`es-sidebar ${compact ? 'es-sidebar-compact' : ''}`}
    >
      <div className="es-sidebar-header">
        {sections.length > 0 && (
          <nav className="es-buttons" aria-label="Sidebar sections">
            {sections.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                aria-pressed={section === id}
                onClick={() => onSectionChange(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
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
