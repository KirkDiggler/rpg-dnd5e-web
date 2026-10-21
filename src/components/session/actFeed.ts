/**
 * actFeed — one member's act stream (rpg-project#630, event-stream R12, R14,
 * R27, R28, R31).
 *
 * THE ID IS AN ORDERING KEY, NOT A COUNTER (R27). Nothing here infers a
 * missed act from the ids. Loss is the transport's to report (R28): a stream
 * that ends with `lagged` is caught up with GetStory pages after the last id
 * held, while the server says `more`, then reopened.
 *
 * ACTS SHARING AN ID ARE ONE DELIVERY UNIT. One record entry can fold into
 * several acts that all carry its id: a rest and the concentrations and
 * conditions it ended, a departure or an ending and the conditions it lifted.
 * (A line and its own answer share only the act tag, not an id.) The server
 * never splits such a run across a page or a lag close. A page's runs are
 * delivered whole; a live run is delivered as it arrives and stays open for
 * the rest of it on the same stream (`deliver`), each call carrying its
 * acts' place in the run. Resuming after an id skips the whole run, and an
 * act at or below the last id held is skipped unless it continues the open
 * live run.
 *
 * CATCH-UP FIRST, THEN LIVE. Every (re)connection first pages GetStory after
 * the last id held, delivered as `catchup`, and only then opens StreamEvents
 * after the newest id, delivered as `live`. So the history a client loads on
 * mount is never presented as if it had just happened.
 *
 * A read or a stream that says `restarted` (the id aged out of retention)
 * resets the resume point and calls `onRestarted`; the retained history is
 * then re-read as catch-up, never presented as live.
 *
 * LIVENESS. `refresh` drops the stream, catches up and reopens at once; the
 * hook calls it on window focus and when the page becomes visible.
 *
 * Pure of React so the reconnect rules are tested without a component.
 */
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type {
  GetStoryResponse,
  StreamEventsResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/story_service_pb';

/** GetStory page size while catching up. */
export const STORY_PAGE_LIMIT = 200;

export type ActStreamState = 'live' | 'reconnecting' | 'resyncing';

export interface ActDeliveryMetadata {
  /** `catchup` for a GetStory page, `live` for the stream. */
  source: 'live' | 'catchup';
  /**
   * The first act's place in its same-id run: 0 for a run delivered from its
   * start, N when this call continues a live run already N acts long (see
   * "A LIVE RUN STAYS OPEN").
   */
  startIndex: number;
}

export interface ActFeedDeps {
  stream: (
    afterId: string,
    signal: AbortSignal
  ) => AsyncIterable<StreamEventsResponse>;
  get: (afterId: string, signal: AbortSignal) => Promise<GetStoryResponse>;
  /** One same-id run, whole, in id order. */
  onRun: (run: readonly Act[], metadata: ActDeliveryMetadata) => void;
  /** The resume point aged out; what the caller holds may have a hole. */
  onRestarted: () => void;
  onState: (state: ActStreamState) => void;
  /** Delay before reconnect attempt n (0-based). */
  retryDelayMs: (attempt: number) => number;
  /** Where to resume from; "" is the oldest retained beat. */
  afterId?: string;
}

export interface ActFeed {
  stop: () => void;
  lastId: () => string;
  /**
   * Re-reads now: drops the current stream, catches up from the last id
   * held, and reopens. For the liveness triggers (window focus, the page
   * becoming visible): a half-open stream must not sit stale reporting live.
   */
  refresh: () => void;
}

/** Splits acts into maximal runs of consecutive acts sharing an id. */
export function sameIdRuns(acts: readonly Act[]): Act[][] {
  const runs: Act[][] = [];
  for (const act of acts) {
    const run = runs[runs.length - 1];
    if (run && run[0]?.id === act.id) run.push(act);
    else runs.push([act]);
  }
  return runs;
}

export function startActFeed(deps: ActFeedDeps): ActFeed {
  const controller = new AbortController();
  const signal = controller.signal;
  let lastId = deps.afterId ?? '';
  // The run lastId names, when it was delivered live on the CURRENT stream
  // and may still be continued there, and how many acts it holds so far.
  let openLive = false;
  let openCount = 0;

  /**
   * Delivers one run unless this feed already holds its id.
   *
   * A LIVE RUN STAYS OPEN. The stream hands a run over back to back, but the
   * transport may split it across macrotasks, and the burst it ends has no
   * end marker on the wire. So a live run is delivered as soon as the stream
   * has nothing more ready (its last act is often the turn's end, which the
   * table is waiting on), and stays open: more acts of the same id on the
   * same stream continue it, delivered with their place in the run
   * (`startIndex`), never dropped as already held. A new id, a page, a lag or
   * a new stream closes it. Pages never split a run, so catch-up never
   * continues one.
   */
  const deliver = (run: readonly Act[], source: 'live' | 'catchup') => {
    const id = run[0]?.id;
    if (id === undefined) return;
    if (source === 'live' && openLive && id === lastId) {
      const startIndex = openCount;
      openCount += run.length;
      deps.onRun(run, Object.freeze({ source, startIndex }));
      return;
    }
    if (lastId !== '' && id <= lastId) return; // already held, whole
    lastId = id;
    openLive = source === 'live';
    openCount = run.length;
    deps.onRun(run, Object.freeze({ source, startIndex: 0 }));
  };

  const restart = () => {
    lastId = '';
    openLive = false;
    deps.onRestarted();
  };

  const catchUp = async () => {
    openLive = false;
    for (;;) {
      const response = await deps.get(lastId, signal);
      if (signal.aborted) return;
      if (response.restarted) restart();
      // A page ends only between two ids, so each run here is whole.
      for (const run of sameIdRuns(response.acts)) deliver(run, 'catchup');
      // `more` is the only end signal: a page's length says nothing.
      if (!response.more || response.acts.length === 0) return;
    }
  };

  /**
   * Received acts are held until the stream has nothing more ready (the
   * next macrotask), then delivered run by run in one synchronous pass, so a
   * burst reaches the caller in one tick, where its refreshes coalesce.
   */
  let pending: Act[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pending.length === 0) return;
    const received = pending;
    pending = [];
    if (signal.aborted) return;
    for (const run of sameIdRuns(received)) deliver(run, 'live');
  };
  const receive = (act: Act) => {
    pending.push(act);
    if (flushTimer === undefined) flushTimer = setTimeout(flush, 0);
  };

  const wait = (delay: number) =>
    new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal.addEventListener('abort', onAbort, { once: true });
    });

  // The current stream's own abort, so a refresh can drop it alone.
  let attempt: AbortController | null = null;
  let refreshing = false;

  const run = async () => {
    let retry = 0;
    while (!signal.aborted) {
      let reopen = false;
      attempt = new AbortController();
      const streamSignal = AbortSignal.any([signal, attempt.signal]);
      try {
        deps.onState('resyncing');
        await catchUp();
        if (signal.aborted) return;
        deps.onState('live');
        retry = 0;
        openLive = false;
        for await (const message of deps.stream(lastId, streamSignal)) {
          const item = message.item;
          if (item.case === 'act') {
            receive(item.value);
          } else if (item.case === 'restarted') {
            // Retained history follows, not news: re-read it as catch-up.
            flush();
            restart();
            reopen = true;
            break;
          } else if (item.case === 'lagged') {
            reopen = true;
            break;
          }
        }
        flush();
      } catch {
        flush();
        // OUR abort is the only one that stops the loop. A server or proxy
        // Canceled is a dropped connection like any other.
        if (signal.aborted) return;
      }
      if (signal.aborted) return;
      if (reopen || refreshing) {
        refreshing = false;
        continue; // catch up and reopen at once
      }
      deps.onState('reconnecting');
      await wait(deps.retryDelayMs(retry));
      retry += 1;
    }
  };
  void run();

  return {
    stop: () => {
      clearTimeout(flushTimer);
      controller.abort();
    },
    lastId: () => lastId,
    refresh: () => {
      if (signal.aborted || !attempt) return;
      refreshing = true;
      attempt.abort();
    },
  };
}
