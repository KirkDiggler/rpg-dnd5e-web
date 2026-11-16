/**
 * THREADS FROM A HUB (rpg-project#973, R32). A hub is a fact, a topic, a
 * record or a secret the engine says: its hub sections hold one group per
 * hub, and the folded read-back says each hub's thread in its own words
 * ("Taught by:", "Asked by:", "Held by:", "Told by:", "Revealed by:",
 * "Bars:" …). The thread is the Read back of that hub, folded by default
 * with the full sentences behind each entry, every jump through the one
 * path map. Nothing is stored: the list is the engine's, read from the last
 * read-back (`threadHubs.ts` says which sections and which checks).
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { ReadBack } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import type { StudioReadBack } from './studioPublishing';
import {
  hubSectionsOf,
  NO_THREADS_SENTENCE,
  type ThreadHub,
} from './threadHubs';

/** Where a hub is edited: the thread reads it, its home writes it. */
export type HubHome = 'intel' | 'concealments';
const EDITING_HOMES: Record<string, { section: HubHome; label: string }> = {
  record: { section: 'intel', label: 'Edit in Intel' },
  concealment: { section: 'concealments', label: 'Edit in Concealments' },
};

export function StudioThreads({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  onOpenFact,
  onOpenWay,
  onConfigure,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  focus: ThreadHub | null;
  onSelect(hub: ThreadHub): void;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string, hub?: string): void;
  onOpenWay?(wayId: string): void;
  /** Open a hub's editing home. */
  onConfigure?(section: HubHome): void;
}): React.JSX.Element {
  const sections = hubSectionsOf(readBack.readBack);
  const home = focus ? EDITING_HOMES[focus.kind] : undefined;
  return (
    <section className="es-threads wb-panel" aria-label="Threads">
      <h2>Threads</h2>
      {!readBack.readBack && (
        <p role="status" className="es-help es-readback-notice">
          {`${NO_THREADS_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`}
        </p>
      )}
      <div className="es-threads-body">
        <div className="es-threads-hubs">
          {sections.map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              <ul aria-label={section.title} className="es-threads-list">
                {section.rows.map((row) => {
                  const selected =
                    focus?.kind === row.hub.kind && focus.id === row.hub.id;
                  return (
                    <li key={`${row.hub.kind}:${row.hub.id}`}>
                      <button
                        type="button"
                        data-hub={row.hub.id}
                        data-hub-kind={row.hub.kind}
                        aria-pressed={selected}
                        onClick={() => onSelect(row.hub)}
                      >
                        <span className="es-threads-id">{row.hub.id}</span>{' '}
                        <small>{row.summary}</small>
                        {row.mark && (
                          <span className="es-fact-mark" data-mark={row.mark}>
                            {' '}
                            {row.mark}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {focus && readBack.readBack && (
          <div
            className="es-threads-thread"
            data-thread={`${focus.kind}:${focus.id}`}
          >
            {home && onConfigure && (
              <button
                type="button"
                className="es-link"
                onClick={() => onConfigure(home.section)}
              >
                {home.label}
              </button>
            )}
            <ReadBack
              document={document}
              selection={focus}
              state={readBack}
              onJump={onJump}
              onOpenFact={onOpenFact}
              onOpenWay={onOpenWay}
            />
          </div>
        )}
      </div>
    </section>
  );
}
