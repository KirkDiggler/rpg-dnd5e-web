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
 */
export function RecordPanel({ feed }: { feed: RecordFeedSnapshot }) {
  const [filter, setFilter] = useState<RecordFilter>({ act: '', beat: '' });
  const rows = useMemo(
    () => filterRecord(feed.rows, filter),
    [feed.rows, filter]
  );
  const symbols = useMemo(() => symbolsOf(feed.rows), [feed.rows]);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  // Persist the clamp so a cleared/restarted buffer cannot resurrect an old page.
  if (page !== currentPage) setPage(currentPage);
  const start = currentPage * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const changeFilter = (next: RecordFilter) => {
    setFilter(next);
    setPage(0);
  };
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
            onChange={(e) => changeFilter({ ...filter, act: e.target.value })}
          />
        </label>
        <label>
          <span>Beat</span>
          <input
            aria-label="Filter by beat"
            value={filter.beat}
            placeholder="e.g. answered"
            onChange={(e) => changeFilter({ ...filter, beat: e.target.value })}
          />
        </label>
        {narrowed && (
          <button
            type="button"
            onClick={() => changeFilter({ act: '', beat: '' })}
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
        <nav
          className={styles.pagination}
          aria-label="Record pages"
          title="Pages of the loaded record buffer"
        >
          <label className={styles.pageSize}>
            Rows
            <select
              aria-label="Record rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.range}>
            {rows.length ? start + 1 : 0}–{start + pageRows.length} of{' '}
            {rows.length}
          </span>
          <button
            type="button"
            aria-label="Previous record page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next record page"
            disabled={currentPage === pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      </div>
      {feed.notice && (
        <div className={styles.notice} role="status">
          {feed.notice}
        </div>
      )}
      <ol className={styles.rows} aria-label="Record">
        {pageRows.map((row) => (
          <RecordRowView
            key={row.id}
            row={row}
            table={symbols.get(row.id)}
            onAct={(act) => changeFilter({ ...filter, act })}
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
