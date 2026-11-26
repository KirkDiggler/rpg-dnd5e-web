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
import {
  statusesNotMapping,
  statusesOf,
  type StatusGiver,
} from './statusesView';
import { statusFormWords } from './statusWords';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import { useStatusSaid, type StatusSaidClient } from './useStatusSaid';
import type { StatusWords } from './useStatusWords';
import { setWord } from './wordsForm';
import { WordsForm } from './WordsForm';

const STATUS = 'status';
const NO_STATUSES_SENTENCE = 'The engine has not said the status effects yet.';
const NOT_A_BLOCK_SENTENCE =
  'This status is not written as a set of words, so it cannot be changed here.';
const NO_WORDS_SENTENCE =
  'The engine has not given its status words, so a status cannot be changed here.';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function StudioStatuses({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  enabled = false,
  client,
  statusWords = null,
  statusWordsUnavailable = null,
  onCommitStatus,
  refusals = [],
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected status's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget, path?: string): void;
  /** Ask the engine to say the selected status: only while it is reachable. */
  enabled?: boolean;
  client?: StatusSaidClient;
  /** The engine's status words: the form is drawn from them (rpg-project#1220). */
  statusWords?: StatusWords | null;
  /** Why there are none, when the studio knows. */
  statusWordsUnavailable?: string | null;
  /** Each change of one status, written as it is made: one undoable change. */
  onCommitStatus?(
    id: string,
    edit: (status: Record<string, unknown>) => Record<string, unknown>
  ): boolean;
  /** The engine's current refusals; those at the selected status show on it. */
  refusals?: readonly { path: string; message: string }[];
}): React.JSX.Element {
  const said = readBack.readBack;
  const statuses = statusesOf(document, said);
  const notMapping = statusesNotMapping(document);
  const selected = statuses.find((status) => status.id === focus) ?? null;
  const statusSaid = useStatusSaid({
    id: selected?.id,
    written: selected?.written,
    client,
    enabled,
  });
  const notice = !said
    ? `${NO_STATUSES_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`
    : readBack.readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  const giver = (g: StatusGiver, index: number): React.JSX.Element => {
    const jump = connectionJump({ kind: g.kind, id: g.id }, document);
    const label = `${g.kind} ${g.id}`;
    return (
      <li key={`${g.path}:${index}`}>
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
      {notMapping && (
        <div className="es-help" role="status">
          <p>
            The file's <code>statuses</code> is not a list of statuses, so none
            can be listed. It is kept as written:
          </p>
          <pre>{stringify({ statuses: notMapping.written })}</pre>
        </div>
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
        empty={
          notMapping
            ? "No status can be listed from the file's statuses."
            : 'This site has no status effects.'
        }
        detail={
          selected ? (
            <div className="es-threads-thread" data-status={selected.id}>
              {said ? (
                selected.said.map((statement, index) => (
                  <p key={`${statement.path}:${index}`}>{statement.sentence}</p>
                ))
              ) : (
                <p className="es-help">{NO_STATUSES_SENTENCE}</p>
              )}
              {refusals
                .filter(
                  (r) =>
                    r.path === `statuses.${selected.id}` ||
                    r.path.startsWith(`statuses.${selected.id}.`)
                )
                .map((r, i) => (
                  <p key={i} className="es-help" role="alert">
                    {r.message}
                  </p>
                ))}
              {statusSaid.status !== 'idle' &&
                statusSaid.status !== 'loading' &&
                !(
                  statusSaid.status === 'said' &&
                  statusSaid.sentence === '' &&
                  statusSaid.parts.length === 0
                ) && (
                  <div className="es-status-said">
                    <h3>What it does</h3>
                    {statusSaid.status === 'said' && (
                      <>
                        <p>{statusSaid.sentence}</p>
                        {statusSaid.parts.length > 1 && (
                          <ul>
                            {statusSaid.parts.map((part, index) => (
                              <li key={`${part.path}:${index}`}>{part.text}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {statusSaid.status === 'refused' &&
                      statusSaid.errors.map((error, index) => (
                        <p key={`${error.path}:${index}`} role="alert">
                          {error.path
                            ? `${error.path}: ${error.message}`
                            : error.message}
                        </p>
                      ))}
                    {statusSaid.status === 'unavailable' && (
                      <p className="es-help">
                        The engine could not be asked: {statusSaid.reason}.
                      </p>
                    )}
                  </div>
                )}
              <StatusChange
                key={selected.id}
                id={selected.id}
                written={selected.written}
                statusWords={statusWords}
                statusWordsUnavailable={statusWordsUnavailable}
                onCommitStatus={onCommitStatus}
              />
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

/** The form of one status, drawn from the engine's words. Each change is
 * written to the site as it is made. */
function StatusChange({
  id,
  written,
  statusWords,
  statusWordsUnavailable,
  onCommitStatus,
}: {
  id: string;
  written: unknown;
  statusWords: StatusWords | null;
  statusWordsUnavailable: string | null;
  onCommitStatus?: (
    id: string,
    edit: (status: Record<string, unknown>) => Record<string, unknown>
  ) => boolean;
}): React.JSX.Element {
  const block = isObject(written) ? written : null;
  const editable = Boolean(statusWords && onCommitStatus && block);
  const body =
    statusWords && onCommitStatus ? (
      block ? (
        <WordsForm
          words={statusFormWords(statusWords.words)}
          place="status"
          idPrefix={`status-${id}`}
          value={block}
          onChange={(next, word) =>
            onCommitStatus(id, (status) => setWord(status, word, next[word]))
          }
        />
      ) : (
        <p className="es-help">{NOT_A_BLOCK_SENTENCE}</p>
      )
    ) : !statusWords ? (
      <p className="es-help">
        {NO_WORDS_SENTENCE}
        {statusWordsUnavailable ? ` ${statusWordsUnavailable}` : ''}
      </p>
    ) : null;
  return (
    <div className="es-item-change">
      <h3>Change</h3>
      {editable && (
        <p className="es-help">
          Each change is written as you make it. Undo takes it back.
        </p>
      )}
      {body}
    </div>
  );
}
