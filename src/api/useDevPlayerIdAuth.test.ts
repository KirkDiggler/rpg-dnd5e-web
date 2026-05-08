import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  setAuth: vi.fn(),
}));

import { setAuth } from './auth';
import { useDevPlayerIdAuth } from './useDevPlayerIdAuth';

const mockSetAuth = vi.mocked(setAuth);

beforeEach(() => {
  mockSetAuth.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDevPlayerIdAuth', () => {
  it('calls setAuth with the override when devPlayerIdOverride is provided', () => {
    renderHook(() => useDevPlayerIdAuth('alice'));
    expect(mockSetAuth).toHaveBeenCalledOnce();
    expect(mockSetAuth).toHaveBeenCalledWith(null, 'alice');
  });

  it('does NOT call setAuth when devPlayerIdOverride is null', () => {
    renderHook(() => useDevPlayerIdAuth(null));
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('re-calls setAuth when override changes', () => {
    const { rerender } = renderHook(
      ({ override }: { override: string | null }) =>
        useDevPlayerIdAuth(override),
      { initialProps: { override: 'alice' as string | null } }
    );
    expect(mockSetAuth).toHaveBeenCalledWith(null, 'alice');

    mockSetAuth.mockReset();
    rerender({ override: 'bob' });
    expect(mockSetAuth).toHaveBeenCalledWith(null, 'bob');
  });

  it('does NOT call setAuth when override transitions from set to null', () => {
    const { rerender } = renderHook(
      ({ override }: { override: string | null }) =>
        useDevPlayerIdAuth(override),
      { initialProps: { override: 'alice' as string | null } }
    );
    mockSetAuth.mockReset();
    rerender({ override: null });
    expect(mockSetAuth).not.toHaveBeenCalled();
  });
});
