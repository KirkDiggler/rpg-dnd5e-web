import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { isSeatRefusal, parseSeatRefusal } from './seatRefusal';

const REFUSAL =
  'a party character is seated in another run: launch session "new-1": launch: character "char-9" is seated in session "run-7": still live';

describe('parseSeatRefusal', () => {
  it('reads the character and the run out of the launch refusal', () => {
    expect(parseSeatRefusal(REFUSAL)).toEqual({
      character: 'char-9',
      session: 'run-7',
    });
  });

  it('returns null when the message names no seat', () => {
    expect(parseSeatRefusal('lobby members are not all ready')).toBeNull();
    expect(parseSeatRefusal('')).toBeNull();
  });
});

describe('isSeatRefusal', () => {
  it('is true for FailedPrecondition about a seat, parseable or not', () => {
    expect(
      isSeatRefusal(new ConnectError(REFUSAL, Code.FailedPrecondition))
    ).toBe(true);
    expect(
      isSeatRefusal(
        new ConnectError(
          'a character is seated somewhere',
          Code.FailedPrecondition
        )
      )
    ).toBe(true);
  });

  it('is false for other preconditions and other codes', () => {
    expect(
      isSeatRefusal(new ConnectError('not all ready', Code.FailedPrecondition))
    ).toBe(false);
    expect(isSeatRefusal(new ConnectError(REFUSAL, Code.Internal))).toBe(false);
    expect(isSeatRefusal(new Error(REFUSAL))).toBe(false);
  });
});
