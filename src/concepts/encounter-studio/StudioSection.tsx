import { useId, type ReactNode } from 'react';
import { AboutPanel } from './FieldHelp';

/** One titled part of a studio panel. The inspector's selection name is its
 * h2; a section is an h3 and a sub-section an h4, so every part of a panel
 * begins with a heading at the studio's type scale (rpg-project#579). */
export function StudioSection({
  title,
  level,
  children,
  about,
  className,
}: {
  title: string;
  level: 'section' | 'subsection';
  children: ReactNode;
  /** Panel-level help, behind one "About this panel" disclosure. */
  about?: ReactNode;
  /** Extra classes, for a shared panel that keeps its own block styling. */
  className?: string;
}): React.JSX.Element {
  const id = useId();
  const Heading = level === 'section' ? 'h3' : 'h4';
  return (
    <section
      aria-labelledby={id}
      className={`es-section${level === 'subsection' ? ' es-subsection' : ''}${className ? ` ${className}` : ''}`}
    >
      <Heading id={id} className="es-section-heading">
        {title}
      </Heading>
      {about !== undefined && about !== null && about !== false && (
        <AboutPanel>{about}</AboutPanel>
      )}
      {children}
    </section>
  );
}
