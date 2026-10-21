import { create } from '@bufbuild/protobuf';
import { StreamRecordResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  streamRecord: vi.fn(),
  getRecord: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  recordClient: {
    streamRecord: hoisted.streamRecord,
    getRecord: hoisted.getRecord,
  },
}));

import { RECORD_AGED_OUT_NOTICE } from './recordFeed';
import { useSessionRecordStream } from './useSessionRecordStream';

function ev(id: string) {
  return create(StreamRecordResponseSchema, {
    item: { case: 'event', value: { id, beat: 'moved' } },
  });
}
const restarted = create(StreamRecordResponseSchema, {
  item: { case: 'restarted', value: {} },
});

function hold(messages: unknown[], signal?: AbortSignal) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const m of messages) yield m;
      await new Promise<void>((resolve) => {
        if (!signal || signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve());
      });
    },
  };
}

describe('useSessionRecordStream', () => {
  beforeEach(() => {
    hoisted.streamRecord.mockReset();
    hoisted.getRecord.mockReset();
    hoisted.getRecord.mockResolvedValue({
      events: [],
      restarted: false,
      more: false,
    });
  });

  it('keeps a restart visible across a Debug hide and show', async () => {
    hoisted.streamRecord.mockImplementationOnce(
      (_r: unknown, o: { signal: AbortSignal }) =>
        hold([restarted, ev('Z1')], o.signal)
    );
    hoisted.streamRecord.mockImplementation(
      (_r: unknown, o: { signal: AbortSignal }) => hold([ev('Z2')], o.signal)
    );
    const { result, rerender } = renderHook(
      ({ on }) => useSessionRecordStream('s', 'm', on),
      { initialProps: { on: true } }
    );
    await waitFor(() => expect(result.current.notice).toBeDefined());
    rerender({ on: false });
    rerender({ on: true });
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.id)).toEqual(['Z1', 'Z2'])
    );
    expect(result.current.notice).toBe(RECORD_AGED_OUT_NOTICE);
    expect(hoisted.streamRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ afterId: 'Z1' }),
      expect.anything()
    );
  });

  it('streams nothing while not shown', () => {
    renderHook(() => useSessionRecordStream('s', 'm', false));
    expect(hoisted.streamRecord).not.toHaveBeenCalled();
  });
});
