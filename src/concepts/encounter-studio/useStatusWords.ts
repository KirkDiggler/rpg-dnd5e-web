/**
 * THE ENGINE'S STATUS WORDS, ASKED ONCE (rpg-project#1220).
 *
 * `AuthoringService.GetStatusWords` answers with the words a status is written
 * in, for the rules release the server runs: one answer per engine release,
 * so the studio asks once per client and keeps the answer for the session.
 * An engine that does not implement it (Unimplemented) or a call that fails
 * gives no words, and the Status effects page shows no form. A failed ask is not
 * kept, so a later mount asks again.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  GetStatusWordsRequestSchema,
  type AuthoringService,
  type GetStatusWordsResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
/** The engine's status words table, as it answers. */
export type StatusWords = GetStatusWordsResponse;

export type StatusWordsClient = Pick<
  Client<typeof AuthoringService>,
  'getStatusWords'
>;

export type StatusWordsState =
  | { status: 'loading'; words: null }
  | { status: 'ready'; words: StatusWords }
  /** No words: the engine has none to give (Unimplemented), the call
   * failed, or the studio did not ask (no server). `reason` says which. */
  | { status: 'unavailable'; words: null; reason: string };

const asked = new WeakMap<StatusWordsClient, Promise<StatusWordsState>>();
const answered = new WeakMap<StatusWordsClient, StatusWordsState>();

/** Ask the client once for its words; the same promise to every caller. */
export function askStatusWords(
  client: StatusWordsClient
): Promise<StatusWordsState> {
  const pending = asked.get(client);
  if (pending) return pending;
  const promise = client
    .getStatusWords(create(GetStatusWordsRequestSchema, {}))
    .then(
      (words): StatusWordsState => ({ status: 'ready', words }),
      (err: unknown): StatusWordsState => ({
        status: 'unavailable',
        words: null,
        reason:
          err instanceof ConnectError && err.code === Code.Unimplemented
            ? 'the engine has no status words'
            : err instanceof ConnectError
              ? `${Code[err.code]}: ${err.rawMessage}`
              : String(err),
      })
    )
    .then((state) => {
      if (state.status === 'ready') answered.set(client, state);
      else asked.delete(client);
      return state;
    });
  asked.set(client, promise);
  return promise;
}

/** Forget the kept answer and any pending ask of a client, so the next
 * caller asks again (tests, and a studio that changes server). */
export function forgetStatusWords(
  client: StatusWordsClient = authoringClient
): void {
  asked.delete(client);
  answered.delete(client);
}

/** The words a client has already answered with, or null. */
export function statusWordsNow(
  client: StatusWordsClient = authoringClient
): StatusWords | null {
  return answered.get(client)?.words ?? null;
}

const NOT_ASKED: StatusWordsState = {
  status: 'unavailable',
  words: null,
  reason: 'not asked',
};

export function useStatusWords({
  client = authoringClient,
  enabled = true,
}: {
  client?: StatusWordsClient;
  /** Ask only while the server is reachable; false gives no words. */
  enabled?: boolean;
} = {}): StatusWordsState {
  const [state, setState] = useState<StatusWordsState>(
    () =>
      answered.get(client) ??
      (enabled ? { status: 'loading', words: null } : NOT_ASKED)
  );
  useEffect(() => {
    if (!enabled) {
      setState(answered.get(client) ?? NOT_ASKED);
      return;
    }
    const known = answered.get(client);
    if (known) {
      setState(known);
      return;
    }
    let live = true;
    setState({ status: 'loading', words: null });
    void askStatusWords(client).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [client, enabled]);
  return state;
}
