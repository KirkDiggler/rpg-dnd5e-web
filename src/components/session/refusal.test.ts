import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { isRefusal, refusalMessage } from './refusal';

describe('a server refusal', () => {
  it('is a FAILED_PRECONDITION, shown in the server’s words without the code prefix', () => {
    const error = new ConnectError(
      'body armour cannot change in a fight',
      Code.FailedPrecondition
    );
    expect(isRefusal(error)).toBe(true);
    expect(refusalMessage(error)).toBe('body armour cannot change in a fight');
  });

  it('is not any other failure', () => {
    expect(isRefusal(new ConnectError('boom', Code.Internal))).toBe(false);
    expect(isRefusal(new Error('network'))).toBe(false);
  });
});
