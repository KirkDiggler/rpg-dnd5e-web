/**
 * THREADS FROM A HUB (rpg-project#973, R32). A hub is a fact or a topic the
 * engine says: its "Facts" and "Topics" sections hold one group per hub
 * (about `{fact|topic, id}`), and the folded read-back says each hub's
 * thread in its own words ("Taught by:", "Asked by:", "Wakes:"). The thread
 * is the Read back of that hub, folded by default with the full sentences
 * behind each entry, every jump through the one path map. Nothing is
 * stored: the list is the engine's, read from the last read-back.
 *
 * The row's counts and its mark are a presence check over the engine's own
 * entries in the hub's group, keyed on the engine's kinds: `fact.teach` /
 * `topic.grant` teach it, `fact.ask` / `topic.ask` ask it.
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { ReadBack } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import type { StudioReadBack } from './studioPublishing';
import {
  hubsOf,
  NO_THREADS_SENTENCE,
  TAUGHT,
  type ThreadHub,
} from './threadHubs';

export function StudioThreads({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  onOpenFact,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  focus: ThreadHub | null;
  onSelect(hub: ThreadHub): void;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string, hub?: 'fact' | 'topic'): void;
}): React.JSX.Element {
  const hubs = hubsOf(readBack.readBack);
  const groups: [ThreadHub['kind'], string][] = [
    ['fact', 'Facts'],
    ['topic', 'Topics'],
  ];
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
          {groups.map(([kind, title]) =>
            hubs[kind].length === 0 ? null : (
              <div key={kind}>
                <h3>{title}</h3>
                <ul aria-label={title} className="es-threads-list">
                  {hubs[kind].map((row) => {
                    const mark =
                      row.asked === 0 && row.taught > 0
                        ? `${TAUGHT[kind]}, never asked`
                        : row.taught === 0 && row.asked > 0
                          ? `asked, never ${TAUGHT[kind]}`
                          : null;
                    const selected =
                      focus?.kind === kind && focus.id === row.hub.id;
                    return (
                      <li key={row.hub.id}>
                        <button
                          type="button"
                          data-hub={row.hub.id}
                          aria-pressed={selected}
                          onClick={() => onSelect(row.hub)}
                        >
                          <span className="es-threads-id">{row.hub.id}</span>{' '}
                          <small>
                            {`${TAUGHT[kind]} by ${row.taught}, asked by ${row.asked}`}
                          </small>
                          {mark && (
                            <span className="es-fact-mark" data-mark={mark}>
                              {' '}
                              {mark}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}
        </div>
        {focus && readBack.readBack && (
          <div
            className="es-threads-thread"
            data-thread={`${focus.kind}:${focus.id}`}
          >
            <ReadBack
              document={document}
              selection={focus}
              state={readBack}
              onJump={onJump}
              onOpenFact={onOpenFact}
            />
          </div>
        )}
      </div>
    </section>
  );
}
