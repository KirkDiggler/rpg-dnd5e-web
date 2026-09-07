/**
 * Per-message logging for Connect server-streaming RPCs.
 *
 * client.ts's loggingInterceptor logs unary requests/responses in full, but
 * is blind to streams: for a `StreamResponse`, `response.message` is an
 * `AsyncIterable`, not a message — so the interceptor previously logged the
 * iterator object once, at stream open, and never saw a single event. That
 * is why live `StreamEncounter` events (fog reveals, entity moves, ...) were
 * invisible in devtools while ordinary unary calls were fully visible.
 *
 * `wrapStreamResponseForLogging` replaces `response.message` with an async
 * generator that logs each message as it passes through, plus stream
 * open/end/error, while staying fully lazy — it never buffers, so streaming
 * behavior (backpressure, cancellation via the request's AbortSignal) is
 * unchanged. `for await...of` inside the wrapper's generator body forwards
 * `.return()`/`.throw()` from the consumer straight into the underlying
 * iterable per the language spec, so early teardown (e.g.
 * useEncounterStream's abort-on-unmount) still propagates correctly.
 *
 * Split out of client.ts (rather than inlined in the interceptor) so that
 * file stays small/readable and the summarization logic below — in
 * particular making `hexKnowledgeChanged` genuinely useful, since it's the
 * event read most — lives in one, independently testable place.
 */
import type { StreamResponse } from '@connectrpc/connect';
import { HexState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

interface OneofEnvelope {
  case: string | undefined;
  value?: unknown;
}

/** Duck-types a proto oneof accessor shape ({ case, value }) at `field` —
 * generic-safe: works for ANY message that happens to carry a oneof named
 * `field` (EncounterEvent's `event` today), never assumes the message IS
 * one. */
function oneofEnvelope(
  message: unknown,
  field: string
): OneofEnvelope | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const envelope = (message as Record<string, unknown>)[field];
  if (!envelope || typeof envelope !== 'object') return undefined;
  if (!('case' in envelope)) return undefined;
  return envelope as OneofEnvelope;
}

/**
 * Summarizes a HexKnowledgeChanged payload as hex count, the VISIBLE vs
 * REMEMBERED split, and entity count — e.g. "12 hexes (9 visible, 3
 * remembered), 2 entities" — rather than a bare object dump. This is the
 * highest-traffic event on the encounter stream and the hardest to scan
 * without this: "reveals arrive, un-reveals don't" is immediate from this
 * one line instead of a console hunt through nested hex arrays.
 *
 * Defensive on shape (`value` is `unknown` off the duck-typed oneof) —
 * falls back to a bare case-name label if `hexes`/`entities` aren't arrays.
 */
function summarizeHexKnowledgeChanged(value: unknown): string {
  if (!value || typeof value !== 'object') return 'hexKnowledgeChanged';
  const hexes = (value as { hexes?: unknown }).hexes;
  const entities = (value as { entities?: unknown }).entities;
  if (!Array.isArray(hexes) || !Array.isArray(entities)) {
    return 'hexKnowledgeChanged';
  }
  const visible = hexes.filter(
    (hex) => (hex as { state?: unknown }).state === HexState.VISIBLE
  ).length;
  const remembered = hexes.filter(
    (hex) => (hex as { state?: unknown }).state === HexState.REMEMBERED
  ).length;
  return `hexKnowledgeChanged ${hexes.length} hexes (${visible} visible, ${remembered} remembered), ${entities.length} entities`;
}

/**
 * Summarizes one streamed message for the per-line log label: the oneof
 * case name for an EncounterEvent-shaped message (`payload.case` — e.g.
 * "entityMoved") since the case is the thing you actually scan for, a
 * richer summary for `hexKnowledgeChanged` specifically (see
 * summarizeHexKnowledgeChanged), and an empty label for anything that
 * doesn't duck-type as one (a plain-message stream — the full object still
 * follows as the log's last argument regardless).
 */
const PRESENTATION_SERVICE_PREFIX =
  'dnd5e.api.session.presentation.v1alpha1.SessionPresentationService.';

function streamLogPayload(methodName: string, message: unknown) {
  if (
    !methodName.startsWith(PRESENTATION_SERVICE_PREFIX) ||
    !message ||
    typeof message !== 'object'
  ) {
    return message;
  }
  const plan = message as Record<string, unknown>;
  const terminal =
    plan.terminal && typeof plan.terminal === 'object'
      ? (plan.terminal as Record<string, unknown>)
      : undefined;
  return {
    presentationId:
      typeof plan.presentationId === 'string' ? plan.presentationId : '',
    attempt: typeof plan.attempt === 'number' ? plan.attempt : 0,
    bodyCount: Array.isArray(plan.bodies) ? plan.bodies.length : 0,
    contactCount: Array.isArray(plan.contacts) ? plan.contacts.length : 0,
    terminalCount: Array.isArray(terminal?.dice) ? terminal.dice.length : 0,
  };
}

function summarizeStreamMessage(message: unknown): string {
  const envelope = oneofEnvelope(message, 'event');
  if (!envelope) return '';
  if (envelope.case === undefined) return '(no case set)';
  if (envelope.case === 'hexKnowledgeChanged') {
    return summarizeHexKnowledgeChanged(envelope.value);
  }
  return envelope.case;
}

/**
 * Wraps a StreamResponse's `message` AsyncIterable so each message is
 * logged as it passes through, plus stream open/end/error. `methodName`
 * should already be formatted the same way as the unary request/response
 * logs (`${service.typeName}.${method.name}`) for a consistent devtools
 * view. Returns a NEW response object (the input is not mutated) whose
 * `message` is the logging-wrapped generator — every other field is passed
 * through verbatim.
 *
 * Callers gate this behind `import.meta.env.MODE === 'development'`
 * themselves (see client.ts) — this function always logs when called, so
 * it must never run in production.
 */
export function wrapStreamResponseForLogging<Res extends StreamResponse>(
  methodName: string,
  response: Res
): Res {
  const openedAt = Date.now();
  console.log(`🟣 Stream opened: ${methodName}`);

  async function* logged() {
    let index = 0;
    try {
      for await (const message of response.message) {
        index++;
        const elapsedMs = Date.now() - openedAt;
        const label = summarizeStreamMessage(message);
        console.log(
          `🟣 Stream: ${methodName} #${index} +${elapsedMs}ms${
            label ? ` ${label}` : ''
          }`,
          streamLogPayload(methodName, message)
        );
        yield message;
      }
      const elapsedMs = Date.now() - openedAt;
      console.log(
        `⚪ Stream ended: ${methodName} (${index} messages, ${elapsedMs}ms)`
      );
    } catch (err) {
      const elapsedMs = Date.now() - openedAt;
      console.error(
        `🔴 Stream error: ${methodName} (${index} messages, ${elapsedMs}ms)`,
        err
      );
      throw err;
    }
  }

  return { ...response, message: logged() };
}
