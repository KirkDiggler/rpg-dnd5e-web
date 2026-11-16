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
import { targetOfPath, type RefusalTarget } from './refusalJump';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import {
  hubSectionsOf,
  NO_THREADS_SENTENCE,
  type ThreadHub,
} from './threadHubs';

/** Where a hub is edited: the thread reads it, its home writes it. */
const EDITING_HOMES: Record<string, { label: string }> = {
  record: { label: 'Edit in Intel' },
  concealment: { label: 'Edit in Concealments' },
};

export function StudioThreads({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  onOpenFact,
  wayOpener,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  focus: ThreadHub | null;
  onSelect(hub: ThreadHub): void;
  onJump?(target: RefusalTarget, path?: string): void;
  onOpenFact?(id: string, hub?: string): void;
  wayOpener?(wayId: string): (() => void) | null;
}): React.JSX.Element {
  const sections = hubSectionsOf(readBack.readBack);
  const home = focus ? EDITING_HOMES[focus.kind] : undefined;
  // The edit link lands on the hub's own form through the one path map, by
  // the path of the hub's own statement (the first of its group).
  const hubPath = focus
    ? readBack.readBack?.sections
        .flatMap((section) => section.groups)
        .find(
          (group) =>
            group.about?.kind === focus.kind && group.about.id === focus.id
        )?.statements[0]?.path
    : undefined;
  const editTarget = hubPath ? targetOfPath(hubPath, document) : null;
  return (
    <section className="es-threads wb-panel" aria-label="Threads">
      <h2>Threads</h2>
      {!readBack.readBack && (
        <p role="status" className="es-help es-readback-notice">
          {`${NO_THREADS_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`}
        </p>
      )}
      <StudioListDetail
        label="Hubs"
        groups={sections.map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            key: { kind: row.hub.kind, id: row.hub.id },
            name: <span className="es-threads-id">{row.hub.id}</span>,
            summary: (
              <>
                {row.summary}
                {row.note && <small data-note={row.note}> {row.note}</small>}
                {row.mark && (
                  <span className="es-fact-mark" data-mark={row.mark}>
                    {' '}
                    {row.mark}
                  </span>
                )}
              </>
            ),
            buttonData: {
              'data-hub': row.hub.id,
              'data-hub-kind': row.hub.kind,
            },
          })),
        }))}
        selected={focus}
        onSelect={(key) =>
          onSelect({ kind: key.kind, id: key.id } as ThreadHub)
        }
        detailLabel="Thread"
        detail={
          focus && readBack.readBack ? (
            <div
              className="es-threads-thread"
              data-thread={`${focus.kind}:${focus.id}`}
            >
              {home && editTarget && onJump && (
                <button
                  type="button"
                  className="es-link"
                  onClick={() => onJump(editTarget, hubPath)}
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
                wayOpener={wayOpener}
              />
            </div>
          ) : null
        }
      />
    </section>
  );
}
