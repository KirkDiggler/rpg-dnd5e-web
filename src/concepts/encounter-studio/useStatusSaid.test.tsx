/**
 * THE STUDIO ASKS THE ENGINE TO SAY A STATUS (rpg-project#1217).
 */
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  FieldErrorSchema,
  SayStatusResponseSchema,
  StatusSaidPartSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_UNIMPLEMENTED_REASON,
  useStatusSaid,
  type StatusSaidClient,
} from './useStatusSaid';

type Said = ReturnType<StatusSaidClient['sayStatus']>;
const clientWith = (answer: (id: string) => Said) => {
  const sayStatus = vi.fn((req: { id: string }) => answer(req.id));
  return {
    client: { sayStatus } as unknown as StatusSaidClient,
    sayStatus,
  };
};
const said = (sentence: string, parts: [string, string][] = []) =>
  Promise.resolve(
    create(SayStatusResponseSchema, {
      name: 'Name',
      sentence,
      parts: parts.map(([path, text]) =>
        create(StatusSaidPartSchema, { path, text })
      ),
    })
  );

describe('useStatusSaid', () => {
  // catches: wrong payload
  it('sends the id and the status as JSON, exactly as written', async () => {
    const written = { name: 'Welcomed', changes: [{ cannot: ['a'] }] };
    const { client, sayStatus } = clientWith(() => said('x'));
    renderHook(() =>
      useStatusSaid({ id: 'welcomed', written, client, enabled: true })
    );
    await waitFor(() => expect(sayStatus).toHaveBeenCalledTimes(1));
    expect(sayStatus.mock.calls[0]![0]).toMatchObject({
      id: 'welcomed',
      statusJson: JSON.stringify(written),
    });
  });

  it('said carries the engine’s sentence and parts in order', async () => {
    const { client } = clientWith(() =>
      said('It does.', [
        ['changes[0]', 'first'],
        ['changes[1]', 'second'],
      ])
    );
    const { result } = renderHook(() =>
      useStatusSaid({ id: 'a', written: { n: 1 }, client, enabled: true })
    );
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('said'));
    expect(result.current).toMatchObject({
      sentence: 'It does.',
      parts: [{ text: 'first' }, { text: 'second' }],
    });
  });

  // catches: an empty sentence shown as said
  it('an answer with errors is refused and carries no sentence', async () => {
    const { client } = clientWith(() =>
      Promise.resolve(
        create(SayStatusResponseSchema, {
          errors: [
            create(FieldErrorSchema, { path: 'changes[0]', message: 'no' }),
          ],
        })
      )
    );
    const { result } = renderHook(() =>
      useStatusSaid({ id: 'a', written: { n: 1 }, client, enabled: true })
    );
    await waitFor(() => expect(result.current.status).toBe('refused'));
    expect(result.current).toEqual({
      status: 'refused',
      errors: [expect.objectContaining({ path: 'changes[0]', message: 'no' })],
    });
    expect('sentence' in result.current).toBe(false);
  });

  it('Unimplemented gives the fixed reason; another failure gives code and message', async () => {
    const one = clientWith(() =>
      Promise.reject(new ConnectError('x', Code.Unimplemented))
    );
    const a = renderHook(() =>
      useStatusSaid({
        id: 'a',
        written: { n: 1 },
        client: one.client,
        enabled: true,
      })
    );
    await waitFor(() => expect(a.result.current.status).toBe('unavailable'));
    expect(a.result.current).toEqual({
      status: 'unavailable',
      reason: STATUS_UNIMPLEMENTED_REASON,
    });
    const two = clientWith(() =>
      Promise.reject(new ConnectError('down', Code.Unavailable))
    );
    const b = renderHook(() =>
      useStatusSaid({
        id: 'a',
        written: { n: 1 },
        client: two.client,
        enabled: true,
      })
    );
    await waitFor(() => expect(b.result.current.status).toBe('unavailable'));
    expect(b.result.current).toEqual({
      status: 'unavailable',
      reason: 'Unavailable: down',
    });
  });

  // catches: an ask while the engine is not reachable, or for text
  it('never asks when not enabled, without an id, or when written is not an object', () => {
    const { client, sayStatus } = clientWith(() => said('x'));
    for (const props of [
      { id: 'a', written: { n: 1 }, enabled: false },
      { id: null, written: { n: 1 }, enabled: true },
      { id: 'a', written: 'text', enabled: true },
      { id: 'a', written: ['l'], enabled: true },
      { id: 'a', written: null, enabled: true },
    ]) {
      const { result } = renderHook(() => useStatusSaid({ ...props, client }));
      expect(result.current).toEqual({ status: 'idle' });
    }
    expect(sayStatus).not.toHaveBeenCalled();
  });

  // catches: the wrong status's sentence kept after a fast change of selection
  it('an older answer that arrives last is dropped', async () => {
    const waiting: Record<string, (v: Awaited<Said>) => void> = {};
    const { client } = clientWith(
      (id) =>
        new Promise((resolve) => {
          waiting[id] = resolve as (v: Awaited<Said>) => void;
        }) as Said
    );
    const { result, rerender } = renderHook(
      ({ id }) => useStatusSaid({ id, written: { id }, client, enabled: true }),
      { initialProps: { id: 'A' } }
    );
    rerender({ id: 'B' });
    waiting.B!(create(SayStatusResponseSchema, { sentence: 'B says' }));
    await waitFor(() => expect(result.current.status).toBe('said'));
    waiting.A!(create(SayStatusResponseSchema, { sentence: 'A says' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toMatchObject({ sentence: 'B says' });
  });

  it('never shows the previous status while the next is loading', async () => {
    const { client } = clientWith((id) =>
      id === 'A' ? said('A says') : new Promise(() => undefined)
    );
    const { result, rerender } = renderHook(
      ({ id }) => useStatusSaid({ id, written: { id }, client, enabled: true }),
      { initialProps: { id: 'A' } }
    );
    await waitFor(() => expect(result.current.status).toBe('said'));
    rerender({ id: 'B' });
    expect(result.current).toEqual({ status: 'loading' });
  });

  // catches: the answer dropped while the same status is asked again (the block blinks)
  it('while the same status is asked again, the last answer rides along as was', async () => {
    const { client } = clientWith((id) =>
      id === 'A' ? said('first') : new Promise(() => undefined)
    );
    const { result, rerender } = renderHook(
      ({ n }) =>
        useStatusSaid({ id: 'A', written: { n }, client, enabled: true }),
      { initialProps: { n: 1 } }
    );
    await waitFor(() => expect(result.current.status).toBe('said'));
    rerender({ n: 2 });
    expect(result.current).toMatchObject({
      status: 'loading',
      was: { status: 'said', sentence: 'first' },
    });
  });

  // catches: was kept across ids, so another status's sentence is drawn
  it('another status gets no was', async () => {
    const { client } = clientWith((id) =>
      id === 'A' ? said('A says') : new Promise(() => undefined)
    );
    const { result, rerender } = renderHook(
      ({ id }) => useStatusSaid({ id, written: { id }, client, enabled: true }),
      { initialProps: { id: 'A' } }
    );
    await waitFor(() => expect(result.current.status).toBe('said'));
    rerender({ id: 'B' });
    expect('was' in result.current).toBe(false);
  });

  // catches: an ask per render
  it('asks again when written changes, and not when the same written re-renders', async () => {
    const { client, sayStatus } = clientWith(() => said('x'));
    const { result, rerender } = renderHook(
      ({ written }) =>
        useStatusSaid({ id: 'a', written, client, enabled: true }),
      { initialProps: { written: { n: 1 } as unknown } }
    );
    await waitFor(() => expect(result.current.status).toBe('said'));
    rerender({ written: { n: 1 } });
    rerender({ written: { n: 1 } });
    expect(sayStatus).toHaveBeenCalledTimes(1);
    rerender({ written: { n: 2 } });
    await waitFor(() => expect(sayStatus).toHaveBeenCalledTimes(2));
  });
});
