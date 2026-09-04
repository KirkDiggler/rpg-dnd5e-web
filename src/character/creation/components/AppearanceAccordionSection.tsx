import type { ReactNode } from 'react';

export type AppearanceSection = 'hair' | 'facialHair' | 'gear';

interface AppearanceAccordionSectionProps {
  readonly section: AppearanceSection;
  readonly title: string;
  readonly openSection: AppearanceSection;
  readonly onOpenSection: (section: AppearanceSection) => void;
  readonly summary: ReactNode;
  readonly children: ReactNode;
}

export function AppearanceAccordionSection({
  section,
  title,
  openSection,
  onOpenSection,
  summary,
  children,
}: AppearanceAccordionSectionProps) {
  const open = openSection === section;
  const regionId = `appearance-${section}-region`;
  return (
    <section className="rounded-lg border border-[var(--border-primary)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onOpenSection(section)}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-[var(--text-muted)]">
          {summary}
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && (
        <div
          id={regionId}
          role="region"
          aria-label={title}
          className="border-t border-[var(--border-primary)] p-3"
        >
          {children}
        </div>
      )}
    </section>
  );
}
