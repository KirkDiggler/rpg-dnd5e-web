/**
 * usePutDungeonPreview — the board's data source. Probes the real
 * `AuthoringService.PutDungeon` RPC once on mount, then either drives the
 * board from LIVE `validate_only` responses (debounced on YAML changes)
 * or falls back to `compileFloorPlanLocally` + the embedded fixture —
 * mirroring the concept's `/author` route probe semantics exactly (the
 * same three-way split the real route's mount-time probe uses):
 *
 *   - `Unimplemented`      -> authoring gate is off server-side -> FIXTURES
 *                             mode, "authoring disabled on this server".
 *   - transport failure
 *     (`Unavailable` or a
 *     non-ConnectError throw) -> can't reach the server at all -> FIXTURES
 *                             mode, a DISTINCT "can't reach server" state
 *                             with a retry action — the concept keeps this
 *                             distinct from the same state
 *                             as gate-off.
 *   - anything else,
 *     including the probe's
 *     own expected
 *     `InvalidArgument`      -> the service exists and answered -> LIVE
 *                             mode.
 *
 * The probe payload is deliberately invalid (`key: ''`) so it fails
 * charset validation before any decode/compile ever runs — a pure
 * liveness check, never a real write (as the original concept brief
 * notes about this exact snippet).
 *
 * Kirk's reframe (TARGET-YAML.md): the YAML pane holds ONE target-dialect
 * document that may use target-dialect-only constructs (walls/holes/start/
 * end/lighting/facing). The live per-edit preview below never sends that
 * document verbatim — it strips to the v1-expressible subset first
 * (`stripToV1Subset`) and previews THAT, exactly what Save & Play would
 * actually persist if clicked right now. A document that isn't even
 * shape-parseable yet (mid-edit) skips this tick silently — the YAML
 * pane's own parse-error path already owns surfacing that.
 *
 * **Capability-probed graduation (this unit, 2026-08-04)**: the strip
 * above used to be a hardcoded snapshot of "what dungeonspec compiles" —
 * it went stale the moment the server moved (Kirk's authoring branch
 * started compiling authored `walls:` and bare `start:` for real while
 * the client kept stripping both unconditionally). This hook now probes
 * `ServerCapabilities` (`capabilityProbe.ts`) once per live connection —
 * on the SAME transition that flips `serverState` to `'live'`, and again
 * on `refreshCapabilities()` — and feeds the result into every
 * `stripToV1Subset` call this hook makes, so the live per-edit preview
 * reflects the true accepted subset, not a stale static one.
 * `capabilities` resets to `null` the moment `serverState` leaves
 * `'live'` (gate-off/unreachable) — a capability observed against one
 * server is never carried into a fixtures-mode fallback.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  PutDungeonRequestSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useEffect, useRef, useState } from 'react';
import {
  probeAllCapabilities,
  type ServerCapabilities,
} from './capabilityProbe';
import { stripToV1Subset, type DungeonDoc } from './dungeonYaml';
import { SHOWCASE_FLOORPLAN } from './fixtures';
import { compileFloorPlanLocally } from './floorPlanCompile';

export type ServerState = 'probing' | 'live' | 'gate-off' | 'unreachable';

export interface UsePutDungeonPreviewResult {
  serverState: ServerState;
  /** Always populated once a doc is available — either a real compiled
   * response (live mode) or the local fallback (fixtures mode). Never
   * null once the concept has a document to show, so the board never has
   * to special-case "no data yet" beyond the initial probe. */
  floorPlan: FloorPlan | null;
  /** Live mode, success=false only — the one flat field_errors entry
   * dungeonspec's v1 validator returns (see PutDungeonResponse's own doc
   * comment). Empty in fixtures mode — see CONTRACT.md's "fixtures mode
   * can't see semantic errors" finding. */
  fieldErrors: ValidationError[];
  /** A malformed-request (InvalidArgument) response is a programming
   * error per the concept's error-transport decision, never author
   * feedback — surfaced separately so callers don't render it as a
   * field_errors-shaped message. */
  requestError: string | null;
  retryProbe: () => void;
  /** `null` until the capability probe suite completes against a live
   * server — every caller that reads this (the "server capabilities"
   * readout, `stripToV1Subset`, Save & Play gating) already treats `null`
   * as "no capabilities," the same conservative-static fallback as
   * before capability probing existed. Never populated outside
   * `serverState === 'live'`. */
  capabilities: ServerCapabilities | null;
  /** Re-runs the full probe suite against the current live server —
   * the capabilities readout's own refresh affordance, independent of
   * `retryProbe` (which re-checks basic reachability, not per-field
   * acceptance). */
  refreshCapabilities: () => void;
}

const DEBOUNCE_MS = 500;

function classifyFailure(err: unknown): 'gate-off' | 'unreachable' | 'other' {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unimplemented) return 'gate-off';
    if (err.code === Code.Unavailable) return 'unreachable';
    return 'other';
  }
  // A non-ConnectError throw (network layer never got a structured gRPC
  // response at all) is exactly the "can't reach the server" case too.
  return 'unreachable';
}

export function usePutDungeonPreview(
  doc: DungeonDoc | null,
  yamlText: string
): UsePutDungeonPreviewResult {
  const [serverState, setServerState] = useState<ServerState>('probing');
  const [liveFloorPlan, setLiveFloorPlan] = useState<FloorPlan | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [probeNonce, setProbeNonce] = useState(0);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(
    null
  );
  const [capabilitiesNonce, setCapabilitiesNonce] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount-time (and manual retry) probe.
  useEffect(() => {
    let cancelled = false;
    setServerState('probing');
    (async () => {
      try {
        await authoringClient.putDungeon(
          create(PutDungeonRequestSchema, {
            key: '',
            yaml: '',
            validateOnly: true,
          })
        );
        if (!cancelled) setServerState('live'); // unexpected success still means reachable
      } catch (err) {
        if (cancelled) return;
        const kind = classifyFailure(err);
        setServerState(kind === 'other' ? 'live' : kind);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probeNonce]);

  // Capability probe: runs once per live connection (this effect's own
  // `serverState` dependency covers both the initial live transition and
  // a `retryProbe`-driven recovery from unreachable/gate-off), and again
  // on `refreshCapabilities()` (via `capabilitiesNonce`). Reset to `null`
  // the instant the server stops being live — a capability observed
  // against one server must never leak into a fixtures-mode fallback or
  // a DIFFERENT server reached after a retry.
  useEffect(() => {
    if (serverState !== 'live') {
      setCapabilities(null);
      return;
    }
    let cancelled = false;
    probeAllCapabilities().then((caps) => {
      if (!cancelled) setCapabilities(caps);
    });
    return () => {
      cancelled = true;
    };
  }, [serverState, capabilitiesNonce]);

  // Live per-edit preview, debounced, only while the probe found the gate on.
  useEffect(() => {
    if (serverState !== 'live' || !doc) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      (async () => {
        setRequestError(null);
        let subsetYaml: string;
        try {
          subsetYaml = stripToV1Subset(
            yamlText,
            capabilities ?? undefined
          ).yaml;
        } catch {
          // Not even shape-parseable yet (mid-edit) — nothing to preview
          // this tick. Not a request/field error; the YAML pane's own
          // parse-error path (DungeonBuilderConcept's applyText) already
          // owns surfacing this.
          return;
        }
        try {
          const response = await authoringClient.putDungeon(
            create(PutDungeonRequestSchema, {
              key: doc.key,
              yaml: subsetYaml,
              validateOnly: true,
            })
          );
          if (response.success) {
            setLiveFloorPlan(response.floorPlan ?? null);
            setFieldErrors([]);
          } else {
            setFieldErrors(response.fieldErrors);
            // Keep the last good floor plan on screen rather than blanking
            // the board on every keystroke of an in-progress edit.
          }
        } catch (err) {
          const kind = classifyFailure(err);
          if (kind === 'unreachable') {
            setServerState('unreachable');
            return;
          }
          // InvalidArgument (key/yaml mismatch, charset) reaching here
          // means the editor itself constructed a malformed request — a
          // programming error, never author feedback.
          setRequestError(
            err instanceof ConnectError
              ? err.message
              : 'PutDungeon request failed'
          );
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [serverState, doc, yamlText, capabilities]);

  const fallbackFloorPlan = doc
    ? doc.key === 'showcase'
      ? SHOWCASE_FLOORPLAN // the real recorded fixture, preferred over a recompute of the unedited doc
      : compileFloorPlanLocally(doc)
    : null;

  const floorPlan =
    serverState === 'live'
      ? (liveFloorPlan ?? (doc ? compileFloorPlanLocally(doc) : null))
      : fallbackFloorPlan;

  return {
    serverState,
    floorPlan,
    fieldErrors: serverState === 'live' ? fieldErrors : [],
    requestError,
    retryProbe: () => setProbeNonce((n) => n + 1),
    capabilities,
    refreshCapabilities: () => setCapabilitiesNonce((n) => n + 1),
  };
}
