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
 * (A line and its own answer share only the act tag, not an id.) Every run is
 * delivered whole, in one `onRun` call. THE PRODUCER MARKS THE UNIT: the last
 * act of every run carries `run_end`, so a live run closes on it — never on a
 * timer, never on the next id. A stream that ends inside a run drops the
 * unfinished run, and the catch-up after the last id held re-reads it whole.
 * A page ends only on a run's end, so its runs are whole. An act at or below
 * the last id held is skipped.
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

  /** Delivers one whole run unless this feed already holds its id. */
  const deliver = (run: readonly Act[], source: 'live' | 'catchup') => {
    const id = run[0]?.id;
    if (id === undefined) return;
    if (lastId !== '' && id <= lastId) return; // already held, whole
    lastId = id;
    deps.onRun(run, Object.freeze({ source }));
  };

  const restart = () => {
    lastId = '';
    deps.onRestarted();
  };

  const catchUp = async () => {
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
   * THE OPEN RUN is the live run whose `run_end` has not arrived yet. On
   * `run_end` it is complete and joins `pending`.
   *
   * Complete runs wait for the stream to have nothing more ready (the next
   * macrotask), then go out run by run in one synchronous pass, so a burst
   * reaches the caller in one tick where its refreshes coalesce. That timer
   * batches complete runs only; it never closes one.
   */
  let open: Act[] = [];
  let pending: Act[][] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pending.length === 0) return;
    const complete = pending;
    pending = [];
    if (signal.aborted) return;
    for (const run of complete) deliver(run, 'live');
  };
  /** Ends a stream's intake: complete runs go out, an unfinished one is
   * dropped for the catch-up to re-read whole. */
  const endIntake = () => {
    open = [];
    flush();
  };
  /** Takes one live act; false when the stream broke the run rule. */
  const receive = (act: Act): boolean => {
    if (open.length > 0 && open[0]!.id !== act.id) return false;
    open.push(act);
    if (!act.runEnd) return true;
    pending.push(open);
    open = [];
    if (flushTimer === undefined) flushTimer = setTimeout(flush, 0);
    return true;
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
        for await (const message of deps.stream(lastId, streamSignal)) {
          const item = message.item;
          if (item.case === 'act') {
            // A new id inside an open run: the producer never does this, so
            // fail closed — drop the run and catch up rather than guess.
            if (!receive(item.value)) {
              reopen = true;
              break;
            }
          } else if (item.case === 'restarted') {
            // Retained history follows, not news: re-read it as catch-up.
            endIntake();
            restart();
            reopen = true;
            break;
          } else if (item.case === 'lagged') {
            reopen = true;
            break;
          }
        }
        endIntake();
      } catch {
        endIntake();
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
