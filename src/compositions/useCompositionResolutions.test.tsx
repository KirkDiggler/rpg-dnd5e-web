import { stringifyScene } from '@/concepts/world-building/serialization';
import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompositionSource } from './compositionSource';
import { useCompositionResolutions } from './useCompositionResolutions';

describe('useCompositionResolutions source invalidation', () => {
  it('does not publish a late result or error from a replaced credential session', async () => {
    let resolveOld!: (value: Composition) => void;
    const oldRead = new Promise<Composition>((resolve) => {
      resolveOld = resolve;
    });
    const oldSource: CompositionSource = {
      worldId: '123456789012345678',
      reader: {
        getComposition: vi.fn(() => oldRead),
        listCompositions: vi.fn(async () => []),
      },
    };
    const replacement = create(CompositionSchema, {
      id: 'shared-id',
      worldId: '123456789012345678',
      json: stringifyScene({
        version: 1,
        id: 'replacement-scene',
        name: 'Replacement',
        items: [],
        groups: [],
      }),
    });
    const newSource: CompositionSource = {
      worldId: '123456789012345678',
      reader: {
        getComposition: vi.fn(async () => replacement),
        listCompositions: vi.fn(async () => [replacement]),
      },
    };
    const references = [{ ref: 'composition:props:shared-id' }];
    const { result, rerender } = renderHook(
      ({ source }: { source: CompositionSource }) =>
        useCompositionResolutions(references, source),
      { initialProps: { source: oldSource } }
    );

    rerender({ source: newSource });
    await waitFor(() =>
      expect(result.current.get('shared-id')?.status).toBe('ready')
    );

    resolveOld(
      create(CompositionSchema, {
        id: 'shared-id',
        worldId: '123456789012345678',
        json: '{}',
      })
    );
    await Promise.resolve();
    expect(result.current.get('shared-id')).toEqual({
      status: 'ready',
      composition: replacement,
    });

    // The rejection path is guarded by the same source identity. Exercise it
    // with a second pending source so neither late outcome can overwrite B.
    let rejectAnotherOld!: (reason: Error) => void;
    const anotherOldRead = new Promise<Composition>((_resolve, reject) => {
      rejectAnotherOld = reject;
    });
    const anotherOldSource: CompositionSource = {
      ...oldSource,
      reader: {
        ...oldSource.reader,
        getComposition: vi.fn(() => anotherOldRead),
      },
    };
    rerender({ source: anotherOldSource });
    await waitFor(() =>
      expect(anotherOldSource.reader.getComposition).toHaveBeenCalled()
    );
    rerender({ source: newSource });
    await waitFor(() =>
      expect(result.current.get('shared-id')?.status).toBe('ready')
    );
    rejectAnotherOld(new Error('stale access error'));
    await Promise.resolve();
    expect(result.current.get('shared-id')).toEqual({
      status: 'ready',
      composition: replacement,
    });
  });

  it('drops a stale ready composition when source identity refreshes after deletion', async () => {
    const composition = create(CompositionSchema, {
      id: 'composition-delete-me',
      worldId: 'test-world',
      json: stringifyScene({
        version: 1,
        id: 'scene-delete-me',
        name: 'Delete Me',
        items: [],
        groups: [],
      }),
    });
    let stored: typeof composition | null = composition;
    const getComposition = vi.fn(async () => stored);
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        getComposition,
        listCompositions: vi.fn(async () => (stored ? [stored] : [])),
      },
    };
    const references = [{ ref: 'composition:props:composition-delete-me' }];
    const { result, rerender } = renderHook(
      ({ activeSource }: { activeSource: CompositionSource }) =>
        useCompositionResolutions(references, activeSource),
      { initialProps: { activeSource: source } }
    );

    await waitFor(() =>
      expect(result.current.get('composition-delete-me')?.status).toBe('ready')
    );
    stored = null;
    rerender({ activeSource: { ...source } });

    await waitFor(() =>
      expect(result.current.get('composition-delete-me')?.status).toBe(
        'missing'
      )
    );
    expect(getComposition).toHaveBeenCalledTimes(2);
  });
});
