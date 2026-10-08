import { errorMessage } from '@/utils/combatFormat';
import { Code, ConnectError } from '@connectrpc/connect';

/** A verb the server declined on a precondition (not your turn, downed,
 * cannot afford, mid-fight): the refusal is the answer, not a fault. */
export function isRefusal(error: unknown): boolean {
  return (
    error instanceof ConnectError && error.code === Code.FailedPrecondition
  );
}

/** The server's own message, without the transport's `[code]` prefix. */
export function refusalMessage(error: unknown): string {
  return error instanceof ConnectError ? error.rawMessage : errorMessage(error);
}
