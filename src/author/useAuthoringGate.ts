/**
 * useAuthoringGate — is authoring on, server-side, for THIS build's
 * server? One probe per page session (cached module-level once it
 * answers live or gate-off; an unreachable answer is never cached so
 * `retry` can recover).
 *
 * The probe is `GetDungeon("reference-tomb")` (plan W): the tomb is the
 * one dungeon every registry boots with (rpg-api refuses to boot
 * without a compiling content dir), so with authoring on this simply
 * succeeds. `Unimplemented` is the registered-or-not answer (rpg-api
 * registers `AuthoringService` only under `RPG_AUTHORING_ENABLED=1`);
 * `Unavailable`/`Unknown`/a raw network throw mean the server itself is
 * not there (connect-web wraps a genuine connection failure as
 * `Code.Unknown`, verified live — never `Unavailable`); any other code
 * (a `NotFound` from a content dir without the tomb, say) still proves
 * the service is reachable.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { GetDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';

export type AuthoringGateState =
  | 'probing'
  | 'live'
  | 'gate-off'
  | 'unreachable';

export interface UseAuthoringGateResult {
  state: AuthoringGateState;
  /** Re-runs the probe against the current server — the retry affordance
   * shown while `state === 'unreachable'`. */
  retry: () => void;
}

export const AUTHORING_PROBE_KEY = 'reference-tomb';

let cachedTerminalState: 'live' | 'gate-off' | null = null;

export async function probeAuthoringGate(): Promise<AuthoringGateState> {
  try {
    await authoringClient.getDungeon(
      create(GetDungeonRequestSchema, { key: AUTHORING_PROBE_KEY })
    );
    return 'live';
  } catch (err) {
    if (err instanceof ConnectError) {
      if (err.code === Code.Unimplemented) return 'gate-off';
      if (err.code === Code.Unavailable || err.code === Code.Unknown) {
        return 'unreachable';
      }
      return 'live';
    }
    return 'unreachable';
  }
}

export function useAuthoringGate(): UseAuthoringGateResult {
  const [state, setState] = useState<AuthoringGateState>(
    cachedTerminalState ?? 'probing'
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (cachedTerminalState !== null && nonce === 0) {
      setState(cachedTerminalState);
      return;
    }
    let cancelled = false;
    setState('probing');
    probeAuthoringGate().then((result) => {
      if (cancelled) return;
      if (result === 'live' || result === 'gate-off') {
        cachedTerminalState = result;
      }
      setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { state, retry: () => setNonce((n) => n + 1) };
}
