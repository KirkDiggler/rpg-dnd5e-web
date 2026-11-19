/**
 * THE SERVER'S ENGINE RELEASE, AS FRESH AS THE HASH IT GUARDS
 * (rpg-project#1017): the `encounter_version` of
 * `AuthoringService.GetMachineWords`. A run's content hash is compared with
 * the open encounter's only when the run's `scene_content.engine` equals
 * it.
 *
 * NOT CACHED for the page's life (review on rpg-dnd5e-web#1464): the api
 * can be re-upped on a newer engine under an open tab, and a release asked
 * an hour ago would then pass two hashes from two engines as comparable.
 * It is asked again each time `ask` changes, which the caller ties to a
 * comparison about to be made: a saved run opened, a watch started, and the
 * open encounter's hash changing (every check answer that brings a new
 * hash, including the first after the server comes back). Until the ask
 * for the current `ask` answers, the release is unconfirmed (null) and no
 * comparison is claimed.
 *
 * The durable contract is for `PutDungeon` to return the engine release
 * beside `content_hash`, so the two come from one answer (passed to the
 * engine lane).
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { GetMachineWordsRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
import type { ServerSide } from './runIdentity';
import type { MachineWordsClient } from './useMachineWords';

export type EngineVersionClient = MachineWordsClient;

const UNCONFIRMED: ServerSide = { engine: null, unreachable: false };

/** The server's engine release, asked afresh whenever `ask` changes while
 * `enabled`; unconfirmed (null) until that ask answers. */
export function useEngineVersion({
  client = authoringClient,
  enabled = true,
  ask,
}: {
  client?: EngineVersionClient;
  enabled?: boolean;
  /** What the release is asked for: a new value asks again. */
  ask: string;
}): ServerSide {
  const [answer, setAnswer] = useState<{ ask: string; side: ServerSide }>({
    ask: '',
    side: UNCONFIRMED,
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    client.getMachineWords(create(GetMachineWordsRequestSchema, {})).then(
      (words) => {
        // An empty release is the server saying it does not know its own.
        if (live)
          setAnswer({
            ask,
            side: {
              engine: words.encounterVersion || null,
              unreachable: false,
            },
          });
      },
      (err: unknown) => {
        // An engine with no words says no release; any other failure is
        // the server not reached.
        const noWords =
          err instanceof ConnectError && err.code === Code.Unimplemented;
        if (live)
          setAnswer({ ask, side: { engine: null, unreachable: !noWords } });
      }
    );
    return () => {
      live = false;
    };
  }, [client, enabled, ask]);
  // An answer for an earlier ask confirms nothing about this one.
  return enabled && answer.ask === ask ? answer.side : UNCONFIRMED;
}
