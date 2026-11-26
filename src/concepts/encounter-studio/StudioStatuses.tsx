/**
 * STATUS EFFECTS (rpg-project#1215): the site's statuses, each as the engine
 * says it, its words as written, and the lines that give it. It only shows:
 * nothing here declares, edits or gives a status. The studio types no word of
 * what a status does; every sentence is the engine's, the block is the file's.
 */
import { stringify } from 'yaml';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { statusesOf, type StatusGiver } from './statusesView';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';

const STATUS = 'status';
const NO_STATUSES_SENTENCE = 'The engine has not said the status effects yet.';

export function StudioStatuses({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected status's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget, path?: string): void;
}): React.JSX.Element {
  const said = readBack.readBack;
  const statuses = statusesOf(document, said);
  const selected = statuses.find((status) => status.id === focus) ?? null;
  const notice = !said
    ? `${NO_STATUSES_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`
    : readBack.readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  const giver = (g: StatusGiver): React.JSX.Element => {
    const jump = connectionJump({ kind: g.kind, id: g.id }, document);
    const label = `${g.kind} ${g.id}`;
    return (
      <li key={g.path}>
        {jump?.kind === 'target' && onJump ? (
          <button
            type="button"
            className="es-link es-readback-ref"
            onClick={() => onJump(jump.target)}
          >
            {label}
          </button>
        ) : (
          <span className="es-readback-ref">{label}</span>
        )}
        {g.receiver && <> gives it to {g.receiver}</>}
      </li>
    );
  };
  return (
    <section className="es-items wb-panel" aria-label="Status effects">
      <h2>Status effects</h2>
      {notice && (
        <p role="status" className="es-help es-readback-notice">
          {notice}
        </p>
      )}
      <StudioListDetail
        id="statuses"
        label="Status effects"
        groups={[
          {
            rows: statuses.map((status) => ({
              key: { kind: STATUS, id: status.id },
              name: status.name,
              summary: [
                status.id,
                said && status.givenBy.length > 0
                  ? `given by ${status.givenBy.length}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              rowData: { 'data-status': status.id },
            })),
          },
        ]}
        selected={selected ? { kind: STATUS, id: selected.id } : null}
        onSelect={(key) => onSelect(key.id)}
        detailLabel="Status effect"
        empty="This site has no status effects."
        detail={
          selected ? (
            <div className="es-threads-thread" data-status={selected.id}>
              {said ? (
                selected.said.map((statement) => (
                  <p key={statement.path}>{statement.sentence}</p>
                ))
              ) : (
                <p className="es-help">{NO_STATUSES_SENTENCE}</p>
              )}
              <h3>As written</h3>
              <pre>{stringify({ [selected.id]: selected.written })}</pre>
              {said && (
                <>
                  <h3>Given by</h3>
                  {selected.givenBy.length > 0 ? (
                    <ul className="es-readback-links">
                      {selected.givenBy.map(giver)}
                    </ul>
                  ) : (
                    <p className="es-help">No line gives it.</p>
                  )}
                </>
              )}
            </div>
          ) : null
        }
      />
    </section>
  );
}
