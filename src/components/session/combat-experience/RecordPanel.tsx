import { useMemo, useState } from 'react';
import { groupRecord, type RecordAct } from '../recordActs';
import {
  filterRecord,
  type RecordFeedSnapshot,
  type RecordFilter,
  type RecordRow,
} from '../recordFeed';
import styles from './RecordPanel.module.css';
import {
  answeredOf,
  readAnswer,
  symbolsOf,
  type TableSymbol,
} from './recordSymbols';

/**
 * RecordPanel is the debug panel's view of the record stream
 * (rpg-project#628), read as ACTS (rpg-dnd5e-web#1345): one row per act,
 * newest first — the round it was stamped with, who acted, the word that
 * fired and what followed ("reserve-1 · r2 · dash enemy · 12 cells"). The
 * grouping is `recordActs.ts`: the act id every beat carries, a creature's
 * pick joined to the act it drove, and one `world` row per round for beats
 * written outside any act.
 *
 * Collapsed by default. Open, an act shows its pick in its table's words
 * (rpg-project#674: the roll, the path, every row with ✓ load or ✗ reason)
 * and then its beats oldest first, each with its own round and its fields
 * as indented JSON. The act and beat filters match the beats inside acts
 * and show the acts that hold a match, opened.
 *
 * NEWEST FIRST, ONE SCROLL (rpg-dnd5e-web#1342). There is no page. The feed
 * already holds the whole retained record: it catches a lag up with GetRecord
 * pages until the server says `more` is false, keeping the newest
 * RECORD_MAX_ROWS beats.
 */
export function RecordPanel({ feed }: { feed: RecordFeedSnapshot }) {
  const [filter, setFilter] = useState<RecordFilter>({ act: '', beat: '' });
  const symbols = useMemo(() => symbolsOf(feed.rows), [feed.rows]);
  const acts = useMemo(() => groupRecord(feed.rows), [feed.rows]);
  const narrowed = filter.act.trim() !== '' || filter.beat.trim() !== '';
  const matched = useMemo(
    () => new Set(filterRecord(feed.rows, filter).map((row) => row.id)),
    [feed.rows, filter]
  );
  const shown = useMemo(
    () =>
      narrowed
        ? acts.filter((act) => act.beats.some((b) => matched.has(b.id)))
        : acts,
    [acts, matched, narrowed]
  );
  return (
    <div className={styles.panel}>
      <div className={styles.filters} role="search">
        <label>
          <span>Act</span>
          <input
            aria-label="Filter by act id"
            value={filter.act}
            placeholder="e.g. move:01…"
            onChange={(e) => setFilter({ ...filter, act: e.target.value })}
          />
        </label>
        <label>
          <span>Beat</span>
          <input
            aria-label="Filter by beat"
            value={filter.beat}
            placeholder="e.g. moved"
            onChange={(e) => setFilter({ ...filter, beat: e.target.value })}
          />
        </label>
        {narrowed && (
          <button
            type="button"
            onClick={() => setFilter({ act: '', beat: '' })}
          >
            Clear
          </button>
        )}
        <span
          className={styles.count}
          aria-live="off"
          title="Matching / loaded record beats"
        >
          {shown.length} acts · {narrowed ? matched.size : feed.rows.length}/
          {feed.rows.length} beats
        </span>
      </div>
      {feed.notice && (
        <div className={styles.notice} role="status">
          {feed.notice}
        </div>
      )}
      <ol className={styles.acts} aria-label="Record">
        {shown.map((act) => (
          <ActView
            key={act.key}
            act={act}
            symbols={symbols}
            matched={narrowed ? matched : undefined}
            onAct={(id) => setFilter({ ...filter, act: id })}
          />
        ))}
      </ol>
      {shown.length === 0 && (
        <p className={styles.empty}>
          {feed.rows.length === 0
            ? 'No record beats received.'
            : 'No records match these filters.'}
        </p>
      )}
    </div>
  );
}

/** One act: its line, and when open its pick and its beats. A filter match
 * inside it opens it; the reader can still close it. */
function ActView({
  act,
  symbols,
  matched,
  onAct,
}: {
  act: RecordAct;
  symbols: ReadonlyMap<string, TableSymbol>;
  matched: ReadonlySet<string> | undefined;
  onAct: (act: string) => void;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? matched !== undefined;
  const reading = useMemo(() => {
    if (!act.pick) return undefined;
    const answer = answeredOf(act.pick.fields);
    return answer ? readAnswer(answer, symbols.get(act.pick.id)) : undefined;
  }, [act.pick, symbols]);
  const target = str(act.pick?.fields?.target);
  const threat = str(act.pick?.fields?.threat);
  const label = act.world ? 'world' : act.actor || 'unnamed';
  return (
    <li
      className={styles.actItem}
      data-act-key={act.key}
      data-world={act.world ? 'true' : undefined}
    >
      <button
        type="button"
        className={styles.actLine}
        aria-expanded={open}
        aria-label={`Act ${act.key}`}
        onClick={() => setChoice(!open)}
      >
        <strong className={styles.actor}>{label}</strong>
        <span className={styles.round}>r{String(act.round)}</span>
        {act.word && <span className={styles.word}>{act.word}</span>}
        <span className={styles.followed}>
          {act.followed || 'nothing followed'}
        </span>
      </button>
      {open && (
        <div className={styles.actBody}>
          {reading && (
            <div className={styles.pick} aria-label="The pick">
              <p className={styles.reading}>{reading.sentence}</p>
              {(target || threat) && (
                <p className={styles.reading}>
                  {target && `target ${target}`}
                  {target && threat && ' · '}
                  {threat && `threat ${threat}`}
                </p>
              )}
              {reading.lines.length > 0 && (
                <ul className={styles.verdicts} aria-label="Rows of the table">
                  {reading.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ol className={styles.rows} aria-label={`Beats of ${act.key}`}>
            {act.beats.map((row) => (
              <RecordRowView
                key={row.id}
                row={row}
                match={matched?.has(row.id)}
                onAct={onAct}
              />
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function RecordRowView({
  row,
  match,
  onAct,
}: {
  row: RecordRow;
  match: boolean | undefined;
  onAct: (act: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const json = useMemo(
    () => (open ? JSON.stringify(row.fields ?? {}, null, 2) : ''),
    [open, row.fields]
  );
  return (
    <li
      className={`${styles.row}${match ? ` ${styles.match}` : ''}`}
      data-record-id={row.id}
      data-beat={row.beat}
      data-match={match ? 'true' : undefined}
    >
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`Inspect ${row.beat} ${row.id}`}
          onClick={() => setOpen(!open)}
        >
          <span className={styles.round}>r{String(row.at)}</span>
          <code className={styles.id} title={row.id}>
            …{row.id.slice(-6)}
          </code>
          <strong className={styles.beat}>{row.beat || '(no beat)'}</strong>
        </button>
        {row.act ? (
          <button
            type="button"
            className={styles.act}
            title={`Show only ${row.act}`}
            onClick={() => onAct(row.act)}
          >
            {row.act}
          </button>
        ) : (
          <span className={styles.noAct}>no act</span>
        )}
      </div>
      {open && (
        <pre className={styles.fields} aria-label="Record fields">
          <code>{json}</code>
        </pre>
      )}
    </li>
  );
}
