import type { StreamResponse } from '@connectrpc/connect';
import { HexState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapStreamResponseForLogging } from './streamLogging';

/** Builds a minimal fake source AsyncIterable from a plain array — mirrors
 * how a real transport hands the interceptor an AsyncIterable of decoded
 * messages. */
async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

/** Same duck-typed EncounterEvent shape encounterStreamDispatch.test.ts's
 * makeEvent() fixture uses ({ event: { case, value } }) — streamLogging
 * only ever duck-types this shape, never imports the real EncounterEvent
 * type, so a plain object is a faithful fixture. */
function makeEncounterEventLike(caseName: string, value: unknown) {
  return { event: { case: caseName, value } };
}

function makeStreamResponse<T>(message: AsyncIterable<T>): StreamResponse {
  return {
    stream: true,
    message,
    service: { typeName: 'test.Service' },
    header: new Headers(),
    trailer: new Headers(),
    method: { name: 'TestStream' },
  } as unknown as StreamResponse;
}

/** Drains an AsyncIterable into an array, for order/content assertions. */
async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
}

describe('wrapStreamResponseForLogging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('yields every message in order, unmodified', async () => {
    const messages = [
      makeEncounterEventLike('entityMoved', { entityId: 'a' }),
      makeEncounterEventLike('doorOpened', { doorEntityId: 'door-east' }),
      makeEncounterEventLike('turnEnded', { entityId: 'a' }),
    ];
    const response = makeStreamResponse(fromArray(messages));

    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);
    const received = await drain(wrapped.message);

    expect(received).toEqual(messages);
  });

  it('logs one line per message, in order, with an increasing index', async () => {
    const messages = [
      makeEncounterEventLike('entityMoved', { entityId: 'a' }),
      makeEncounterEventLike('doorOpened', { doorEntityId: 'door-east' }),
    ];
    const response = makeStreamResponse(fromArray(messages));

    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);
    await drain(wrapped.message);

    // Stream-open + 2 messages + stream-end = 4 log lines.
    expect(logSpy).toHaveBeenCalledTimes(4);
    expect(logSpy.mock.calls[0][0]).toContain('Stream opened: Svc.Method');
    expect(logSpy.mock.calls[1][0]).toMatch(
      /Svc\.Method #1 \+\d+ms entityMoved/
    );
    expect(logSpy.mock.calls[1][1]).toBe(messages[0]);
    expect(logSpy.mock.calls[2][0]).toMatch(
      /Svc\.Method #2 \+\d+ms doorOpened/
    );
    expect(logSpy.mock.calls[2][1]).toBe(messages[1]);
    expect(logSpy.mock.calls[3][0]).toContain('Stream ended: Svc.Method');
    expect(logSpy.mock.calls[3][0]).toContain('2 messages');
  });

  it('does not buffer — messages are only pulled from the source as the consumer asks for them', async () => {
    let producedCount = 0;
    async function* countingSource() {
      for (let i = 0; i < 3; i++) {
        producedCount++;
        yield makeEncounterEventLike('entityMoved', { entityId: `e${i}` });
      }
    }
    const response = makeStreamResponse(countingSource());
    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);

    const iterator = wrapped.message[Symbol.asyncIterator]();
    await iterator.next();
    // Only the first message should have been pulled from the underlying
    // source — a buffering implementation would have drained all 3 eagerly.
    expect(producedCount).toBe(1);

    await iterator.next();
    expect(producedCount).toBe(2);
  });

  it('summarizes hexKnowledgeChanged as hex count / visible-vs-remembered split / entity count', async () => {
    const hexKnowledgeEvent = makeEncounterEventLike('hexKnowledgeChanged', {
      hexes: [
        { state: HexState.VISIBLE },
        { state: HexState.VISIBLE },
        { state: HexState.REMEMBERED },
      ],
      entities: [{ id: 'goblin-1' }],
    });
    const response = makeStreamResponse(fromArray([hexKnowledgeEvent]));

    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);
    await drain(wrapped.message);

    const messageLine = logSpy.mock.calls[1][0] as string;
    expect(messageLine).toContain(
      'hexKnowledgeChanged 3 hexes (2 visible, 1 remembered), 1 entities'
    );
  });

  it('falls back to the plain case name for a message with no case set', async () => {
    const response = makeStreamResponse(
      fromArray([{ event: { case: undefined } }])
    );

    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);
    await drain(wrapped.message);

    expect(logSpy.mock.calls[1][0]).toContain('(no case set)');
  });

  it('logs presentation plans as bounded metadata without raw transforms', async () => {
    const plan = {
      presentationId: 'session:enc-1:42',
      attempt: 1,
      bodies: [
        {
          dieId: 'attack-d20',
          state: { linearVelocity: { x: 7, y: 8, z: 9 } },
        },
      ],
      contacts: [],
      terminal: { dice: [{ dieId: 'attack-d20', step: 42 }] },
    };
    const response = makeStreamResponse(fromArray([plan]));

    const wrapped = wrapStreamResponseForLogging(
      'dnd5e.api.session.presentation.v1alpha1.SessionPresentationService.StreamDiceThrows',
      response
    );
    await drain(wrapped.message);

    expect(logSpy.mock.calls[1][1]).toEqual({
      presentationId: 'session:enc-1:42',
      attempt: 1,
      bodyCount: 1,
      contactCount: 0,
      terminalCount: 1,
    });
    expect(logSpy.mock.calls[1][1]).not.toBe(plan);
  });

  it('falls back to no summary label for a non-EncounterEvent-shaped message', async () => {
    const response = makeStreamResponse(fromArray([{ foo: 'bar' }]));

    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);
    await drain(wrapped.message);

    // No case label, but the method/index/elapsed prefix and the raw
    // message (as the last console.log argument) are still present.
    expect(logSpy.mock.calls[1][0]).toMatch(
      /^🟣 Stream: Svc\.Method #1 \+\d+ms$/
    );
    expect(logSpy.mock.calls[1][1]).toEqual({ foo: 'bar' });
  });

  it('logs and rethrows when the underlying stream errors — never swallows it', async () => {
    async function* failingSource() {
      yield makeEncounterEventLike('entityMoved', { entityId: 'a' });
      throw new Error('boom');
    }
    const response = makeStreamResponse(failingSource());
    const wrapped = wrapStreamResponseForLogging('Svc.Method', response);

    await expect(drain(wrapped.message)).rejects.toThrow('boom');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Stream error: Svc.Method');
    expect(errorSpy.mock.calls[0][0]).toContain('1 messages');
  });
});
