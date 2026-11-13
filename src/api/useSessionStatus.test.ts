import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock('./client', () => ({
  sessionClient: { getStatus: hoisted.getStatus },
}));

// Import AFTER vi.mock so the mock is applied
import { PartySharing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useSessionStatus } from './useSessionStatus';

describe('useSessionStatus', () => {
  it('reads the run’s sharing for the session', async () => {
    hoisted.getStatus.mockClear();
    hoisted.getStatus.mockImplementation(async () => ({
      partySharing: PartySharing.OWN,
    }));
    const { result } = renderHook(() => useSessionStatus('run-1'));
    await waitFor(() =>
      expect(result.current.partySharing).toBe(PartySharing.OWN)
    );
    expect(hoisted.getStatus).toHaveBeenCalledWith({ session: 'run-1' });
  });

  it('a failed read leaves UNSPECIFIED and reports the error', async () => {
    hoisted.getStatus.mockImplementation(async () => {
      throw new Error('down');
    });
    const { result } = renderHook(() => useSessionStatus('run-1'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.partySharing).toBe(PartySharing.UNSPECIFIED);
  });

  it('no session reads nothing', () => {
    hoisted.getStatus.mockClear();
    const { result } = renderHook(() => useSessionStatus(''));
    expect(hoisted.getStatus).not.toHaveBeenCalled();
    expect(result.current.partySharing).toBe(PartySharing.UNSPECIFIED);
  });
});
