/**
 * THE SERVER'S ENGINE RELEASE, ASKED ONCE (rpg-project#1017): the
 * `encounter_version` of `AuthoringService.GetMachineWords`. A run's
 * content hash is compared with the open encounter's only when the run's
 * `scene_content.engine` equals it.
 *
 * One ask per client for the studio's life; a failed ask is not kept, so a
 * later watch or saved run asks again. Asked only while a run that names
 * its encounter is shown.
 *
 * NOTE: rpg-dnd5e-web#1462 adds `useMachineWords`, which asks the same
 * call for the whole table; once both are on `dev` this can read its
 * answer instead of asking on its own.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import type { Client } from '@connectrpc/connect';
import {
  GetMachineWordsRequestSchema,
  type AuthoringService,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
import type { ServerSide } from './runIdentity';

export type EngineVersionClient = Pick<
  Client<typeof AuthoringService>,
  'getMachineWords'
>;

const answered = new WeakMap<EngineVersionClient, string>();
const asked = new WeakMap<EngineVersionClient, Promise<ServerSide>>();

/** Ask the client once; the same promise to every caller. */
export function askEngineVersion(
  client: EngineVersionClient
): Promise<ServerSide> {
  const known = answered.get(client);
  if (known !== undefined)
    return Promise.resolve({ engine: known, unreachable: false });
  const pending = asked.get(client);
  if (pending) return pending;
  const promise = client
    .getMachineWords(create(GetMachineWordsRequestSchema, {}))
    .then(
      (words): ServerSide => {
        // An empty release is the server saying it does not know its own.
        const engine = words.encounterVersion || null;
        if (engine !== null) answered.set(client, engine);
        else asked.delete(client);
        return { engine, unreachable: false };
      },
      (): ServerSide => {
        asked.delete(client);
        return { engine: null, unreachable: true };
      }
    );
  asked.set(client, promise);
  return promise;
}

const NOT_ASKED: ServerSide = { engine: null, unreachable: false };

/** The server's engine release, asked while `enabled`. */
export function useEngineVersion({
  client = authoringClient,
  enabled = true,
}: {
  client?: EngineVersionClient;
  enabled?: boolean;
} = {}): ServerSide {
  const [state, setState] = useState<ServerSide>(() => {
    const known = answered.get(client);
    return known !== undefined
      ? { engine: known, unreachable: false }
      : NOT_ASKED;
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void askEngineVersion(client).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [client, enabled]);
  return state;
}
