/**
 * THE ENGINE'S ITEM WORDS, ASKED ONCE (rpg-project#1201).
 *
 * `AuthoringService.GetItemWords` answers with the words an item is written
 * in, for the rules release the server runs: one answer per engine release,
 * so the studio asks once per client and keeps the answer for the session.
 * An engine that does not implement it (Unimplemented) or a call that fails
 * gives no words, and the Items page shows no form. A failed ask is not
 * kept, so a later mount asks again.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  GetItemWordsRequestSchema,
  type AuthoringService,
  type GetItemWordsResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
/** The engine's item words table, as it answers. */
export type ItemWords = GetItemWordsResponse;

export type ItemWordsClient = Pick<
  Client<typeof AuthoringService>,
  'getItemWords'
>;

export type ItemWordsState =
  | { status: 'loading'; words: null }
  | { status: 'ready'; words: ItemWords }
  /** No words: the engine has none to give (Unimplemented), the call
   * failed, or the studio did not ask (no server). `reason` says which. */
  | { status: 'unavailable'; words: null; reason: string };

const asked = new WeakMap<ItemWordsClient, Promise<ItemWordsState>>();
const answered = new WeakMap<ItemWordsClient, ItemWordsState>();

/** Ask the client once for its words; the same promise to every caller. */
export function askItemWords(client: ItemWordsClient): Promise<ItemWordsState> {
  const pending = asked.get(client);
  if (pending) return pending;
  const promise = client
    .getItemWords(create(GetItemWordsRequestSchema, {}))
    .then(
      (words): ItemWordsState => ({ status: 'ready', words }),
      (err: unknown): ItemWordsState => ({
        status: 'unavailable',
        words: null,
        reason:
          err instanceof ConnectError && err.code === Code.Unimplemented
            ? 'the engine has no item words'
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
export function forgetItemWords(
  client: ItemWordsClient = authoringClient
): void {
  asked.delete(client);
  answered.delete(client);
}

/** The words a client has already answered with, or null. */
export function itemWordsNow(
  client: ItemWordsClient = authoringClient
): ItemWords | null {
  return answered.get(client)?.words ?? null;
}

const NOT_ASKED: ItemWordsState = {
  status: 'unavailable',
  words: null,
  reason: 'not asked',
};

export function useItemWords({
  client = authoringClient,
  enabled = true,
}: {
  client?: ItemWordsClient;
  /** Ask only while the server is reachable; false gives no words. */
  enabled?: boolean;
} = {}): ItemWordsState {
  const [state, setState] = useState<ItemWordsState>(
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
    void askItemWords(client).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [client, enabled]);
  return state;
}
