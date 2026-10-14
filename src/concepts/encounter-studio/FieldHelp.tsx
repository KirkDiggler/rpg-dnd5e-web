import { useId, useState, type ReactNode } from 'react';

/** One field's help, off the main flow (rpg-project#579): a "?" beside the
 * field that reveals its sentence below it. Status and refusal lines are not
 * help; they stay inline. */
export function FieldHelp({
  field,
  children,
}: {
  field: string;
  children: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="es-field-help">
      <button
        type="button"
        className="es-help-toggle"
        aria-label={`About ${field}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      <span id={id} className="es-help es-field-help-text" hidden={!open}>
        {children}
      </span>
    </span>
  );
}

/** What play does not render is said (R19): wall and region finishes and
 * region lighting stay in the studio's presentation block. */
export const STUDIO_ONLY_HELP =
  'Play does not render this yet; it stays in the studio until the look catalog.';

/** A panel's own help, behind one disclosure that starts closed. */
export function AboutPanel({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <details className="es-about">
      <summary>About this panel</summary>
      <div className="es-help">{children}</div>
    </details>
  );
}
