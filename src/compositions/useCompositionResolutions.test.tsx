import { stringifyScene } from '@/concepts/world-building/serialization';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompositionSource } from './compositionSource';
import { useCompositionResolutions } from './useCompositionResolutions';

describe('useCompositionResolutions source invalidation', () => {
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
