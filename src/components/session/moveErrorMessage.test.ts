import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { formatMoveError, isFightLockError } from './moveErrorMessage';

describe('formatMoveError', () => {
  it('maps the fight-lock FailedPrecondition (session.ErrInBubble, "member is in a fight") to a friendly status line', () => {
    const err = new ConnectError(
      'member is in a fight',
      Code.FailedPrecondition
    );
    expect(formatMoveError(err)).toBe('In a fight — movement is locked.');
  });

  it('does NOT treat every FailedPrecondition as the fight lock -- sibling sentinels pass their own message through unchanged', () => {
    // errors.go's FailedPrecondition bucket also covers ErrNotInFight,
    // ErrClosed, ErrDowned, etc. -- only ErrInBubble's exact wire text
    // should trigger the friendly rewrite (Copilot review risk: a naive
    // code-only check would misfire on all eight sentinels).
    const notInFight = new ConnectError(
      'member is not in a fight',
      Code.FailedPrecondition
    );
    expect(formatMoveError(notInFight)).toBe(notInFight.message);

    const closed = new ConnectError(
      'encounter closed',
      Code.FailedPrecondition
    );
    expect(formatMoveError(closed)).toBe(closed.message);

    const downed = new ConnectError(
      'member is downed',
      Code.FailedPrecondition
    );
    expect(formatMoveError(downed)).toBe(downed.message);
  });

  it('passes through a non-FailedPrecondition ConnectError unchanged', () => {
    const err = new ConnectError(
      'no doorway joins those cells',
      Code.InvalidArgument
    );
    expect(formatMoveError(err)).toBe(err.message);
  });

  it('passes through a plain Error unchanged (existing useSessionWalk contract, mock RPC rejections in tests)', () => {
    const err = new Error('no doorway joins those cells');
    expect(formatMoveError(err)).toBe('no doorway joins those cells');
  });

  it('falls back to a generic message for a non-Error throw', () => {
    expect(formatMoveError('boom')).toBe('Move RPC failed');
    expect(formatMoveError(undefined)).toBe('Move RPC failed');
  });
});

describe('isFightLockError', () => {
  it('is true for the exact fight-lock sentinel (session.ErrInBubble, FailedPrecondition)', () => {
    expect(
      isFightLockError(
        new ConnectError('member is in a fight', Code.FailedPrecondition)
      )
    ).toBe(true);
  });

  it('is false for a sibling FailedPrecondition sentinel', () => {
    expect(
      isFightLockError(
        new ConnectError('member is not in a fight', Code.FailedPrecondition)
      )
    ).toBe(false);
    expect(
      isFightLockError(
        new ConnectError('member is downed', Code.FailedPrecondition)
      )
    ).toBe(false);
  });

  it('is false when the text matches but the code does not (defensive — never actually issued this way server-side)', () => {
    expect(
      isFightLockError(
        new ConnectError('member is in a fight', Code.InvalidArgument)
      )
    ).toBe(false);
  });

  it('is false for a non-ConnectError throw', () => {
    expect(isFightLockError(new Error('member is in a fight'))).toBe(false);
    expect(isFightLockError('boom')).toBe(false);
    expect(isFightLockError(undefined)).toBe(false);
  });
});
