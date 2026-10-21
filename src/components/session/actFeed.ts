/**
 * actFeed — one member's act stream (rpg-project#630, event-stream R12, R14,
 * R27, R28, R31).
 *
 * THE ID IS AN ORDERING KEY, NOT A COUNTER (R27). Nothing here infers a
 * missed act from the ids. Loss is the transport's to report (R28): a stream
 * that ends with `lagged` is caught up with GetStory pages after the last id
 * held, while the server says `more`, then reopened.
 *
 * ACTS SHARING AN ID ARE ONE DELIVERY UNIT. One record beat can fold into
 * several acts that all carry its id: a rest and the concentrations it ended,
 * a failed line and its own answer. The server never splits such a run across
 * a page or a lag close, so this feed delivers each run whole, in one
 * `onRun` call, and resumes after the last run it delivered. An act whose id
 * is at or below that id is one this feed already delivered as part of its
 * run, and is skipped.
 *
 * CATCH-UP FIRST, THEN LIVE. Every (re)connection first pages GetStory after
 * the last id held, delivered as `catchup`, and only then opens StreamEvents
 * after the newest id, delivered as `live`. So the history a client loads on
 * mount is never presented as if it had just happened.
 *
 * A read or a stream that says `restarted` (the id aged out of retention)
 * resets the resume point and calls `onRestarted`.
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

const LIVE: ActDeliveryMetadata = Object.freeze({ source: 'live' });
const CATCHUP: ActDeliveryMetadata = Object.freeze({ source: 'catchup' });

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

  /** Delivers one run unless this feed already delivered its id. */
  const deliver = (run: readonly Act[], metadata: ActDeliveryMetadata) => {
    const id = run[0]?.id;
    if (id === undefined) return;
    if (lastId !== '' && id <= lastId) return; // already held, whole
    lastId = id;
    deps.onRun(run, metadata);
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
      for (const run of sameIdRuns(response.acts)) deliver(run, CATCHUP);
      // `more` is the only end signal: a page's length says nothing.
      if (!response.more || response.acts.length === 0) return;
    }
  };

  /**
   * The stream sends a run's acts back to back, and a burst (a monster
   * round) as many runs back to back. Received acts are held until the stream
   * has nothing more ready (the next macrotask), then delivered run by run in
   * one synchronous pass — so a run is never handed over in parts, and a
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
    for (const run of sameIdRuns(received)) deliver(run, LIVE);
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

  const run = async () => {
    let attempt = 0;
    while (!signal.aborted) {
      let lagged = false;
      try {
        deps.onState('resyncing');
        await catchUp();
        if (signal.aborted) return;
        deps.onState('live');
        attempt = 0;
        for await (const message of deps.stream(lastId, signal)) {
          const item = message.item;
          if (item.case === 'act') {
            receive(item.value);
          } else if (item.case === 'restarted') {
            flush();
            restart(); // the replay that follows starts at the oldest beat
          } else if (item.case === 'lagged') {
            lagged = true;
            break;
          }
        }
        flush();
        if (lagged) continue; // catch up and reopen at once
      } catch {
        flush();
        // OUR abort is the only one that stops the loop. A server or proxy
        // Canceled is a dropped connection like any other.
        if (signal.aborted) return;
      }
      if (signal.aborted) return;
      deps.onState('reconnecting');
      await wait(deps.retryDelayMs(attempt));
      attempt += 1;
    }
  };
  void run();

  return {
    stop: () => {
      clearTimeout(flushTimer);
      controller.abort();
    },
    lastId: () => lastId,
  };
}
