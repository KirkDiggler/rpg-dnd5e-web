import { useEffect, useRef } from 'react';
import {
  factIndexOf,
  type FactUse,
  type FactUseTarget,
} from '../world-building/factIndex';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { AboutPanel } from './FieldHelp';

export interface StudioFactsProps {
  document: Readonly<RoomDraftDocument>;
  /** Select the placed thing, or open the home section, a use names. */
  onOpen(target: FactUseTarget): void;
  /** A fact to bring into view, from a read-back ref. */
  focus?: string | null;
}

/** The Encounter home's Facts section: every fact the document mentions,
 * who writes it and who reads it. Derived on every render; it stores nothing
 * (rpg-project#576, B9). */
export function StudioFacts({
  document,
  onOpen,
  focus,
}: StudioFactsProps): React.JSX.Element {
  const rows = factIndexOf(document);
  const focused = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    focused.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focus]);
  return (
    <section aria-label="Facts" className="es-social-panel es-facts-index">
      <h2>Facts</h2>
      <AboutPanel>
        <p>
          Every fact this encounter mentions, with what writes it and what reads
          it. A fact exists because something names it; nothing here is stored.
        </p>
      </AboutPanel>
      {rows.length === 0 ? (
        <p className="es-help">No fact is mentioned yet.</p>
      ) : (
        <ul className="es-inspector-list">
          {rows.map((row) => (
            <li
              key={row.fact}
              ref={row.fact === focus ? focused : undefined}
              data-fact={row.fact}
              data-focused={row.fact === focus || undefined}
            >
              <strong>{row.fact}</strong>
              {' · written by '}
              <Uses uses={row.writers} onOpen={onOpen} />
              {' · read by '}
              <Uses uses={row.readers} onOpen={onOpen} />
              {row.readers.length === 0 && (
                <span className="es-fact-mark" data-mark="never-read">
                  {' '}
                  · written, never read
                </span>
              )}
              {row.writers.length === 0 && (
                <span className="es-fact-mark" data-mark="never-written">
                  {' '}
                  · read, never written
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Uses({
  uses,
  onOpen,
}: {
  uses: readonly FactUse[];
  onOpen(target: FactUseTarget): void;
}): React.JSX.Element {
  if (uses.length === 0) return <>nothing</>;
  return (
    <>
      {uses.map((use, index) => (
        <span key={`${use.kind}:${use.label}`}>
          {index > 0 && ', '}
          {use.target ? (
            <button
              type="button"
              className="es-link"
              onClick={() => onOpen(use.target!)}
            >
              {use.label}
            </button>
          ) : (
            use.label
          )}
        </span>
      ))}
    </>
  );
}
