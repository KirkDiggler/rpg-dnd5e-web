import { useMemo, useState } from 'react';
import {
  filterRecord,
  type RecordFeedSnapshot,
  type RecordFilter,
  type RecordRow,
} from '../recordFeed';
import styles from './RecordPanel.module.css';

/**
 * RecordPanel is the debug panel's view of the record stream
 * (rpg-project#628): one row per beat as the encounter wrote it — id, beat
 * name, act id — narrowed by act id and by beat name (event-stream R8).
 * Opening a row shows its fields as indented JSON. Clicking a row's act id
 * narrows the panel to that act: a walk's steps and the reaction it drew.
 */
export function RecordPanel({ feed }: { feed: RecordFeedSnapshot }) {
  const [filter, setFilter] = useState<RecordFilter>({ act: '', beat: '' });
  const rows = useMemo(
    () => filterRecord(feed.rows, filter),
    [feed.rows, filter]
  );
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
        <span className={styles.count} aria-live="off">
          {rows.length}/{feed.rows.length}
        </span>
      </div>
      {feed.notice && (
        <div className={styles.notice} role="status">
          {feed.notice}
        </div>
      )}
      <ol className={styles.rows} aria-label="Record">
        {rows.map((row) => (
          <RecordRowView
            key={row.id}
            row={row}
            onAct={(act) => setFilter({ ...filter, act })}
          />
        ))}
      </ol>
    </div>
  );
}

function RecordRowView({
  row,
  onAct,
}: {
  row: RecordRow;
  onAct: (act: string) => void;
}) {
  const [open, setOpen] = useState(false);
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
