/**
 * THE JOIN SELECTION ENDS WHEN THE MAP'S WOULD (rpg-project#972): Escape, a
 * click on empty canvas and another draft each drop it.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { castlePlacesReadBack } from './fixtures/engineReadBack';
import { usePlacesView } from './usePlacesView';

const GATE = 'door:region-courtyard:region-gatehouse:gate-wall-door';

function setup() {
  const readBack = {
    readBack: castlePlacesReadBack(),
    readBackIsCurrent: true,
    unavailable: null,
  };
  const session = (id: string) =>
    ({
      document: { draft: { id, room: { regions: [] } } },
      arrange: null,
      clearSelection: vi.fn(() => true),
    }) as unknown as Parameters<typeof usePlacesView>[0];
  const hook = renderHook(
    ({ draftId }: { draftId: string }) =>
      usePlacesView(session(draftId), readBack),
    { initialProps: { draftId: 'castle' } }
  );
  act(() => hook.result.current.selectJoin(GATE));
  expect(hook.result.current.selectedJoin?.id).toBe(GATE);
  return hook;
}

describe('usePlacesView: the join selection', () => {
  it('Escape clears it', () => {
    const { result } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.selectedJoin).toBeNull();
  });

  it('a click on empty canvas clears it', () => {
    const { result } = setup();
    act(() => result.current.clearJoin());
    expect(result.current.selectedJoin).toBeNull();
  });

  it('another draft drops it, and a same-id join there is not reselected', () => {
    const { result, rerender } = setup();
    rerender({ draftId: 'a-copy-of-the-castle' });
    expect(result.current.selectedJoin).toBeNull();
    rerender({ draftId: 'castle' });
    expect(result.current.selectedJoin).toBeNull();
  });
});
