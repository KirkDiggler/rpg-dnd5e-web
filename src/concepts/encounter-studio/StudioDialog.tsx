/**
 * A large studio pop-up: the `.es-dialog` pattern the Behaviours list
 * pop-up uses (MachineStateEdit's ListDialog, rpg-project#996), for any
 * content. Portalled into the studio root so the backdrop covers every
 * pane while the studio's styles apply; focus moves in, Tab stays inside,
 * Escape or the backdrop closes it, and focus returns where it was.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export function StudioDialog({
  title,
  onClose,
  host,
  className = '',
  testId,
  children,
}: {
  title: string;
  onClose(): void;
  /** The studio root to render into, or null to render in place. */
  host: Element | null;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => before?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const dialog = (
    <div className="es-dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={`es-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <header className="es-dialog-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
  return host ? createPortal(dialog, host) : dialog;
}
