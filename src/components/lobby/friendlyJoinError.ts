/**
 * Maps Connect-RPC join errors to user-facing friendly messages.
 * Raw error details (transport URLs, status codes) stay in console.error.
 */
export function friendlyJoinError(err: unknown): string {
  const message = err instanceof Error ? err.message.toLowerCase() : '';

  if (message.includes('already in encounter')) {
    return 'You are already in an encounter. Leave your current game before joining another.';
  }

  if (
    message.includes('encounter not found') ||
    message.includes('invalid code')
  ) {
    return 'Game not found. Check the code and try again.';
  }

  if (message.includes('full')) {
    return 'This game is already full.';
  }

  return 'Failed to join lobby. Please try again or check the code.';
}
