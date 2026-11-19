/**
 * THE ENGINE'S MACHINE WORDS, ASKED ONCE (rpg-project#1015).
 *
 * `AuthoringService.GetMachineWords` answers with the words of the engine
 * the server runs: one answer per engine release, so the studio asks once
 * per client and keeps the answer for the session. An engine that does not
 * implement it (Unimplemented) or a call that fails gives no words: every
 * label falls back to the ids it showed before. A failed ask is not kept,
 * so a later mount asks again.
 *
 * The table itself is exported typed (`MachineWords`): a later slice's
 * editor offers its beats, conditions and acts from the same answer.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  GetMachineWordsRequestSchema,
  type AuthoringService,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
import type { MachineWords } from './machineWords';

export type MachineWordsClient = Pick<
  Client<typeof AuthoringService>,
  'getMachineWords'
>;

export type MachineWordsState =
  | { status: 'loading'; words: null }
  | { status: 'ready'; words: MachineWords }
  /** No words: the engine has none to give (Unimplemented), the call
   * failed, or the studio did not ask (no server). `reason` says which. */
  | { status: 'unavailable'; words: null; reason: string };

const asked = new WeakMap<MachineWordsClient, Promise<MachineWordsState>>();
const answered = new WeakMap<MachineWordsClient, MachineWordsState>();

/** Ask the client once for its words; the same promise to every caller. */
export function askMachineWords(
  client: MachineWordsClient
): Promise<MachineWordsState> {
  const pending = asked.get(client);
  if (pending) return pending;
  const promise = client
    .getMachineWords(create(GetMachineWordsRequestSchema, {}))
    .then(
      (words): MachineWordsState => ({ status: 'ready', words }),
      (err: unknown): MachineWordsState => ({
        status: 'unavailable',
        words: null,
        reason:
          err instanceof ConnectError && err.code === Code.Unimplemented
            ? 'the engine has no machine words'
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

/** The words a client has already answered with, or null. */
export function machineWordsNow(
  client: MachineWordsClient = authoringClient
): MachineWords | null {
  return answered.get(client)?.words ?? null;
}

const NOT_ASKED: MachineWordsState = {
  status: 'unavailable',
  words: null,
  reason: 'not asked',
};

export function useMachineWords({
  client = authoringClient,
  enabled = true,
}: {
  client?: MachineWordsClient;
  /** Ask only while the server is reachable; false gives no words. */
  enabled?: boolean;
} = {}): MachineWordsState {
  const [state, setState] = useState<MachineWordsState>(
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
    void askMachineWords(client).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [client, enabled]);
  return state;
}
