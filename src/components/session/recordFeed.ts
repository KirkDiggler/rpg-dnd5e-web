/**
 * recordFeed — the debug panel's copy of the session record (rpg-project#628,
 * event-stream R8, R14, R15, R28).
 *
 * The record stream is not per recipient and has no counting ids: the id is
 * an ordering key (R27), so this feed never infers a missed beat from the
 * numbers. Loss is the transport's to report (R28): a stream that ends with
 * `lagged` is caught up with GetRecord after the last id held, then reopened
 * from the newest id. A dropped connection reopens after the last id held.
 * A read that `restarted` (the id aged out of retention) replaces the buffer
 * and says so once.
 *
 * Pure of React so the reconnect rules are tested without a component.
 */
import type { RecordEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import type {
  GetRecordResponse,
  StreamRecordResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';

/** Rows kept, oldest dropped first — the debug feed's existing cap. */
export const RECORD_MAX_ROWS = 500;

/** GetRecord page size while catching up after a lag. */
export const RECORD_PAGE_LIMIT = 200;

export const RECORD_AGED_OUT_NOTICE = 'Older beats aged out of the record.';

/** One record beat as the panel shows it. */
export interface RecordRow {
  readonly id: string;
  readonly at: bigint;
  readonly act: string;
  readonly beat: string;
  readonly fields: Readonly<Record<string, unknown>> | undefined;
}

export interface RecordFeedSnapshot {
  readonly rows: readonly RecordRow[];
  readonly notice: string | undefined;
}

export interface RecordFeedDeps {
  stream: (
    afterId: string,
    signal: AbortSignal
  ) => AsyncIterable<StreamRecordResponse>;
  get: (afterId: string, signal: AbortSignal) => Promise<GetRecordResponse>;
  onChange: (snapshot: RecordFeedSnapshot) => void;
  /** Delay before reconnect attempt n (0-based). */
  retryDelayMs: (attempt: number) => number;
  /** Where to resume from; "" is the oldest retained beat. */
  afterId?: string;
  rows?: readonly RecordRow[];
}

export interface RecordFeed {
  stop: () => void;
  lastId: () => string;
  snapshot: () => RecordFeedSnapshot;
}

export function toRecordRow(event: RecordEvent): RecordRow {
  return {
    id: event.id,
    at: event.at,
    act: event.act,
    beat: event.beat,
    fields: event.fields,
  };
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (err instanceof Error &&
      (err.name === 'AbortError' || /abort|cancel/i.test(err.message)))
  );
}

export function startRecordFeed(deps: RecordFeedDeps): RecordFeed {
  const controller = new AbortController();
  const signal = controller.signal;
  let rows: RecordRow[] = [...(deps.rows ?? [])];
  let lastId = deps.afterId ?? rows[rows.length - 1]?.id ?? '';
  let notice: string | undefined;

  const publish = () => deps.onChange({ rows, notice });

  const append = (events: readonly RecordEvent[]) => {
    let changed = false;
    for (const event of events) {
      if (lastId !== '' && event.id <= lastId) continue; // already held
      rows.push(toRecordRow(event));
      lastId = event.id;
      changed = true;
    }
    if (rows.length > RECORD_MAX_ROWS) {
      rows = rows.slice(rows.length - RECORD_MAX_ROWS);
    }
    if (changed) publish();
  };

  const catchUp = async () => {
    for (;;) {
      const response = await deps.get(lastId, signal);
      if (signal.aborted) return;
      if (response.restarted) {
        rows = [];
        lastId = '';
        notice = RECORD_AGED_OUT_NOTICE;
        publish();
      }
      append(response.events);
      if (response.events.length < RECORD_PAGE_LIMIT) return;
    }
  };

  const run = async () => {
    let attempt = 0;
    while (!signal.aborted) {
      let lagged = false;
      try {
        for await (const message of deps.stream(lastId, signal)) {
          if (message.item.case === 'event') {
            append([message.item.value]);
            attempt = 0;
          } else if (message.item.case === 'lagged') {
            lagged = true;
            break;
          }
        }
        if (lagged) {
          await catchUp();
          attempt = 0;
          continue; // reopen from the newest id at once
        }
      } catch (err) {
        if (isAbort(err, signal)) return;
      }
      if (signal.aborted) return;
      const delay = deps.retryDelayMs(attempt);
      attempt += 1;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };
  void run();

  return {
    stop: () => controller.abort(),
    lastId: () => lastId,
    snapshot: () => ({ rows, notice }),
  };
}

/** The panel's two narrowings (R8): by act id and by beat name. */
export interface RecordFilter {
  readonly act: string;
  readonly beat: string;
}

export function filterRecord(
  rows: readonly RecordRow[],
  filter: RecordFilter
): readonly RecordRow[] {
  const act = filter.act.trim();
  const beat = filter.beat.trim();
  if (!act && !beat) return rows;
  return rows.filter(
    (row) => (!act || row.act === act) && (!beat || row.beat === beat)
  );
}
