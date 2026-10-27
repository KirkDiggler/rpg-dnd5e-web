import { useMemo, useState } from 'react';
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
 * (rpg-project#628): one row per beat as the encounter wrote it — id, beat
 * name, act id — narrowed by act id and by beat name (event-stream R8).
 * Opening a row shows its fields as indented JSON. Clicking a row's act id
 * narrows the panel to that act: a walk's steps and the reaction it drew.
 *
 * An `answered` row reads in its table's own words (rpg-project#674): the
 * latest `table` beat for its creature, option and key, read off the whole
 * buffer so a beat filter does not hide the symbols. Collapsed it is the pick
 * and the roll; open, every row of the key with ✓ load or ✗ reason.
 *
 * NEWEST FIRST, ONE SCROLL (rpg-dnd5e-web#1342). The panel lists every loaded
 * beat, latest at the top, and the log scrolls; there is no page. The feed
 * already holds the whole retained record: it catches a lag up with GetRecord
 * pages until the server says `more` is false, keeping the newest
 * RECORD_MAX_ROWS. Only the order on screen is reversed here.
 */
export function RecordPanel({ feed }: { feed: RecordFeedSnapshot }) {
  const [filter, setFilter] = useState<RecordFilter>({ act: '', beat: '' });
  const rows = useMemo(
    () => filterRecord(feed.rows, filter),
    [feed.rows, filter]
  );
  const symbols = useMemo(() => symbolsOf(feed.rows), [feed.rows]);
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const narrowed = filter.act !== '' || filter.beat !== '';
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
            placeholder="e.g. answered"
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
          {rows.length}/{feed.rows.length} loaded
        </span>
      </div>
      {feed.notice && (
        <div className={styles.notice} role="status">
          {feed.notice}
        </div>
      )}
      <ol className={styles.rows} aria-label="Record">
        {newestFirst.map((row) => (
          <RecordRowView
            key={row.id}
            row={row}
            table={symbols.get(row.id)}
            onAct={(act) => setFilter({ ...filter, act })}
          />
        ))}
      </ol>
      {rows.length === 0 && (
        <p className={styles.empty}>
          {feed.rows.length === 0
            ? 'No record beats received.'
            : 'No records match these filters.'}
        </p>
      )}
    </div>
  );
}

function RecordRowView({
  row,
  table,
  onAct,
}: {
  row: RecordRow;
  table: TableSymbol | undefined;
  onAct: (act: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reading = useMemo(() => {
    if (row.beat !== 'answered') return undefined;
    const answer = answeredOf(row.fields);
    return answer ? readAnswer(answer, table) : undefined;
  }, [row.beat, row.fields, table]);
  const json = useMemo(
    () => (open ? JSON.stringify(row.fields ?? {}, null, 2) : ''),
    [open, row.fields]
  );
  return (
    <li className={styles.row} data-record-id={row.id} data-beat={row.beat}>
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`Inspect ${row.beat} ${row.id}`}
          onClick={() => setOpen(!open)}
        >
          <code className={styles.id} title={row.id}>
            …{row.id.slice(-6)}
          </code>
          <strong className={styles.beat}>{row.beat || '(no beat)'}</strong>
          {reading && (
            <span className={styles.reading}>{reading.sentence}</span>
          )}
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
      {open && reading && reading.lines.length > 0 && (
        <ul className={styles.verdicts} aria-label="Rows of the table">
          {reading.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {open && (
        <pre className={styles.fields} aria-label="Record fields">
          <code>{json}</code>
        </pre>
      )}
    </li>
  );
}
