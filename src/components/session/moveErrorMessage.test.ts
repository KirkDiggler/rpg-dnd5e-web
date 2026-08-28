import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { formatMoveError, isNotYourTurnError } from './moveErrorMessage';

describe('formatMoveError', () => {
  it('maps the not-your-turn FailedPrecondition (toolkit#1169 session.ErrNotYourTurn, "not your turn") to a friendly status line', () => {
    const err = new ConnectError('not your turn', Code.FailedPrecondition);
    expect(formatMoveError(err)).toBe('Not your turn — movement is locked.');
  });

  it('does NOT treat every FailedPrecondition as the turn lock -- sibling sentinels pass their own message through unchanged', () => {
    // errors.go's FailedPrecondition bucket also covers ErrNotInFight,
    // ErrClosed, ErrDowned, ErrCannotAfford, etc. -- only the exact
    // sentinel text should trigger a rewrite (Copilot review risk: a
    // naive code-only check would misfire on every sibling).
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

    // ErrCannotAfford's own movement text (toolkit#1169's Move.go) already
    // reads player-friendly unmodified -- must NOT be caught by the
    // sentinel (it doesn't name "not your turn").
    const cannotAfford = new ConnectError(
      'movement: 20 ft needed, 15 ft left',
      Code.FailedPrecondition
    );
    expect(formatMoveError(cannotAfford)).toBe(cannotAfford.message);
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

describe('isNotYourTurnError (toolkit#1169)', () => {
  it('is true for the exact not-your-turn sentinel (session.ErrNotYourTurn, FailedPrecondition)', () => {
    expect(
      isNotYourTurnError(
        new ConnectError('not your turn', Code.FailedPrecondition)
      )
    ).toBe(true);
  });

  it('is false for a sibling FailedPrecondition sentinel', () => {
    expect(
      isNotYourTurnError(
        new ConnectError('member is downed', Code.FailedPrecondition)
      )
    ).toBe(false);
    expect(
      isNotYourTurnError(
        new ConnectError(
          'movement: 20 ft needed, 15 ft left',
          Code.FailedPrecondition
        )
      )
    ).toBe(false);
  });

  it('is false when the text matches but the code does not', () => {
    expect(
      isNotYourTurnError(
        new ConnectError('not your turn', Code.InvalidArgument)
      )
    ).toBe(false);
  });

  it('is false for a non-ConnectError throw', () => {
    expect(isNotYourTurnError(new Error('not your turn'))).toBe(false);
    expect(isNotYourTurnError('boom')).toBe(false);
    expect(isNotYourTurnError(undefined)).toBe(false);
  });
});
