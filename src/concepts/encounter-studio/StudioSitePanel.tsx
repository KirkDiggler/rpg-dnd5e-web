import type { ReactNode } from 'react';

export type SiteOperation =
  | 'world'
  | 'references'
  | 'import'
  | 'save'
  | 'copy'
  | 'download';

const GROUPS: readonly {
  label: string;
  operations: readonly { id: SiteOperation; label: string }[];
}[] = [
  {
    label: 'Open',
    operations: [
      { id: 'world', label: 'My World' },
      { id: 'references', label: 'References' },
      { id: 'import', label: 'Import YAML' },
    ],
  },
  {
    label: 'Save',
    operations: [
      { id: 'save', label: 'My World' },
      { id: 'copy', label: 'Save a copy' },
      { id: 'download', label: 'Download YAML' },
    ],
  },
];

/** One presentation slot; the workspace keeps the draft and publishing owner. */
export function StudioSitePanel({
  name,
  status,
  operation,
  busy,
  onOperation,
  onClose,
  recovery,
  children,
}: {
  name: string;
  status: string;
  operation: SiteOperation;
  busy: boolean;
  onOperation(operation: SiteOperation): void;
  onClose(): void;
  recovery: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section
      id="studio-site"
      className="es-site-panel"
      aria-label="Site management"
    >
      <header className="es-site-heading">
        <div>
          <h2>{name}</h2>
          <p className="es-help" aria-live="polite">
            {status || 'Not saved to My World in this session.'}
          </p>
        </div>
        <button type="button" onClick={onClose} disabled={busy}>
          Close Site
        </button>
      </header>
      <div className="es-site-body">
        <nav aria-label="Site operations" className="es-site-nav">
          {GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <h3>{group.label}</h3>
              {group.operations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={operation === item.id}
                  disabled={busy}
                  onClick={() => onOperation(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="es-site-content">{children}</div>
      </div>
      <footer className="es-site-recovery">
        <span>Browser recovery only — not a save to My World.</span>
        {recovery}
      </footer>
    </section>
  );
}
