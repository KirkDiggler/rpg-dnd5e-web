/**
 * useAuthoringGate — decides whether Home's "Dungeon Builder" button
 * should even be shown (rpg-project#194, the graduation unit). Runs the
 * SAME minimal liveness probe `usePutDungeonPreview.ts`'s mount-time
 * effect uses — an empty-key `PutDungeon(validate_only: true)` call,
 * deliberately invalid so it fails charset validation before any decode/
 * compile ever runs — and classifies the result the same three-way split
 * that hook's own doc comment describes:
 *
 *   - `Unimplemented`   -> authoring is gated off server-side (this
 *                          deployment's compose doesn't set
 *                          `RPG_AUTHORING_ENABLED`) -> the button is
 *                          HIDDEN entirely. A deployed build with
 *                          authoring off shows no way in at all.
 *   - `Unavailable` / a
 *     non-ConnectError
 *     throw               -> can't reach the server right now -> button
 *                          shown, disabled, with a small retry
 *                          affordance (`DungeonBuilderHomeButton.tsx`).
 *   - anything else,
 *     including the
 *     probe's own
 *     expected
 *     `InvalidArgument`   -> the service exists and answered -> button
 *                          shown, live.
 *
 * This is a SEPARATE probe instance from `usePutDungeonPreview`'s own —
 * intentionally: that hook only mounts once the author is already inside
 * the builder (`AuthorView`), but the button gating this hook drives has
 * to resolve on Home, before the builder component tree exists at all.
 * Home never blocks its own render on this: `useAuthoringGate` starts at
 * `'probing'` (or the cached terminal state, see below) and resolves
 * asynchronously; the caller renders nothing (or a disabled/loading
 * affordance) until it settles, same "don't block render" discipline
 * `usePutDungeonPreview` already follows for the board itself.
 *
 * **Cached per session** (module-level, resets only on a full page
 * reload): once a probe resolves to `'live'` or `'gate-off'`, later
 * mounts of this hook (e.g. leaving and returning to Home) reuse that
 * result instead of re-probing — the server's authoring-gate setting
 * doesn't flip mid-session in practice, and re-probing on every Home
 * visit would be a live network call for no new information, mirroring
 * why `useCreationFloorPlanPreview` (`usePutDungeonPreview.ts`) doesn't
 * re-run the capability suite independently either. `'unreachable'` is
 * deliberately NOT cached the same way — a transient network blip
 * clearing up shouldn't require a page reload to notice — so a fresh
 * mount after an unreachable result re-probes once on its own.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { PutDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
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

/** Module-level cache — see this file's own doc comment on why only the
 * two TERMINAL states (`live`/`gate-off`) are cached, not `unreachable`. */
let cachedTerminalState: 'live' | 'gate-off' | null = null;

/** The one probe call + classification, factored out so both the hook and
 * its tests can exercise it directly. Never throws. */
export async function probeAuthoringGate(): Promise<AuthoringGateState> {
  try {
    await authoringClient.putDungeon(
      create(PutDungeonRequestSchema, {
        key: '',
        yaml: '',
        validateOnly: true,
      })
    );
    return 'live'; // unexpected success still means reachable
  } catch (err) {
    if (err instanceof ConnectError) {
      if (err.code === Code.Unimplemented) return 'gate-off';
      // A real connection failure (refused/DNS/etc.) doesn't reach the
      // server at all, so there's no trailer to carry a real gRPC status
      // — connect-web's ConnectError.from() wraps it with its OWN default,
      // Code.Unknown (verified live, this unit, 2026-08-07: a genuinely
      // unreachable rpg-api produced `code: 2` — Unknown — never
      // `Code.Unavailable`). Code.Unavailable is kept too since a real
      // server-side "temporarily unavailable" trailer would carry it
      // legitimately, but it is NOT what an actually-down server produces
      // through this transport, contrary to what this file (and
      // usePutDungeonPreview.ts's own classifyFailure, fixed alongside
      // this) previously assumed and had never verified against a real
      // dead server.
      if (err.code === Code.Unavailable || err.code === Code.Unknown) {
        return 'unreachable';
      }
      return 'live'; // the probe's own expected InvalidArgument, etc.
    }
    // A non-ConnectError throw (network layer never got a structured gRPC
    // response at all) is exactly the "can't reach the server" case too.
    return 'unreachable';
  }
}

export function useAuthoringGate(): UseAuthoringGateResult {
  const [state, setState] = useState<AuthoringGateState>(
    cachedTerminalState ?? 'probing'
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // A cached terminal result from an earlier mount this session — reuse
    // it without hitting the network again, unless this run was triggered
    // by an explicit retry (nonce > 0), which always re-probes for real.
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
