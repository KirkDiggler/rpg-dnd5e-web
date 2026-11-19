/**
 * THE SERVER'S ENGINE RELEASE (rpg-project#1017): the `encounter_version`
 * of `AuthoringService.GetMachineWords`. A run's content hash is compared
 * with the open encounter's only when the run's `scene_content.engine`
 * equals it.
 *
 * It is the SAME answer the machine drawing's words come from
 * (`useMachineWords`, rpg-project#1015): one ask per client for the
 * studio's life, shared; no call of its own. Asked only while a run that
 * names its encounter is shown.
 */
import { authoringClient } from '@/api/client';
import { useMemo } from 'react';
import type { ServerSide } from './runIdentity';
import { useMachineWords, type MachineWordsClient } from './useMachineWords';

/** `useMachineWords`'s reason for an engine that has no words. */
const NO_WORDS = 'the engine has no machine words';

export type EngineVersionClient = MachineWordsClient;

/** The server's engine release, asked while `enabled`. */
export function useEngineVersion({
  client = authoringClient,
  enabled = true,
}: {
  client?: EngineVersionClient;
  enabled?: boolean;
} = {}): ServerSide {
  const words = useMachineWords({ client, enabled });
  return useMemo<ServerSide>(() => {
    if (words.status === 'ready')
      // An empty release is the server saying it does not know its own.
      return {
        engine: words.words.encounterVersion || null,
        unreachable: false,
      };
    // A failed call is the server not reached; an engine with no words
    // (Unimplemented) or no ask yet says no release. Neither is compared.
    return {
      engine: null,
      unreachable:
        words.status === 'unavailable' &&
        words.reason !== 'not asked' &&
        words.reason !== NO_WORDS,
    };
  }, [words]);
}
