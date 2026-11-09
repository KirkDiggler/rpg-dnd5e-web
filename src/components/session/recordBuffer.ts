import type { RecordFeedSnapshot, RecordRow } from './recordFeed';

/** Visible record rows are bounded independently of configuration symbols. */
export const RECORD_MAX_ROWS = 500;

export interface RecordBufferInput {
  rows: readonly RecordRow[];
  symbols?: readonly RecordRow[];
  related?: readonly RecordRow[];
  incoming: readonly RecordRow[];
  limit: number;
}

export interface RecordBufferOutput {
  rows: readonly RecordRow[];
  symbols: readonly RecordRow[];
  related: readonly RecordRow[];
}

function isSymbol(row: RecordRow): boolean {
  return row.beat === 'table' || row.beat === 'behavior_config';
}

/** These are recorded links, not inferred relationships or game rules. */
function reference(row: RecordRow): string | undefined {
  const key =
    row.beat === 'behavior_decision'
      ? 'pick_record'
      : row.beat === 'behavior_work'
        ? 'decision_record'
        : undefined;
  const value = key ? row.fields?.[key] : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Symbols outlive the visible row ring. Retain only available record links
 * needed by visible rows; an older uncached decision remains explicitly absent.
 * Returned arrays never mutate earlier snapshots. */
export function bufferRecordRows(input: RecordBufferInput): RecordBufferOutput {
  const priorSymbols = input.symbols ?? [];
  const knownSymbols = new Set(priorSymbols.map((row) => row.id));
  const added: RecordRow[] = [];
  for (const row of [...input.rows, ...input.incoming]) {
    if (isSymbol(row) && !knownSymbols.has(row.id)) {
      knownSymbols.add(row.id);
      added.push(row);
    }
  }
  const symbols = added.length ? [...priorSymbols, ...added] : priorSymbols;
  const available = new Map<string, RecordRow>();
  for (const row of [
    ...(input.related ?? []),
    ...input.rows,
    ...input.incoming,
  ])
    available.set(row.id, row);
  const visible = new Map<string, RecordRow>();
  for (const row of [...input.rows, ...input.incoming])
    visible.set(row.id, row);
  const rows = [...visible.values()].slice(-input.limit);
  const included = new Set(rows.map((row) => row.id));
  const related: RecordRow[] = [];
  const inspect = [...rows];
  for (let i = 0; i < inspect.length; i++) {
    const id = reference(inspect[i]);
    if (!id || included.has(id)) continue;
    included.add(id);
    const found = available.get(id);
    if (found) {
      related.push(found);
      inspect.push(found);
    }
  }
  return { rows, symbols, related };
}

/** Ordered captured context, deduplicated by record ID. Keeping old symbol
 * records in this order preserves the table version used by each answer. */
export function recordContextRows(
  feed: RecordFeedSnapshot
): readonly RecordRow[] {
  const rows = new Map<string, RecordRow>();
  for (const row of [
    ...(feed.symbols ?? []),
    ...(feed.related ?? []),
    ...feed.rows,
  ])
    rows.set(row.id, row);
  return [...rows.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}
