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
 *
 * **Graduation (rpg-project#194, 2026-08-07)**: this hook now takes an
 * optional `forceFixtures` param — see its own doc comment on
 * `usePutDungeonPreview` below. Nothing about the live-probing path
 * itself changed; the flag only adds a way to skip it.
 *
 * **v0.3 wire consumption (this unit, 2026-08-05)**: this file also
 * exports `useCreationFloorPlanPreview`, a second, narrower hook for
 * creation mode's OWN document — creation mode never called `PutDungeon`
 * at all before this unit (its floor came exclusively from
 * `creation/canvasFloor.ts`'s client-side `deriveCanvasFloorCells`). It
 * deliberately does NOT re-run the mount-time reachability probe or the
 * capability-probe suite above — `serverState`/`capabilities` describe
 * the SERVER, not which document is being edited, so a second instance
 * probing independently would double real network traffic (including the
 * 17-request capability suite) for no new information, every time this
 * component renders, regardless of which mode tab is even active (React's
 * rules of hooks mean both hook calls run unconditionally in
 * `DungeonBuilderConcept.tsx`). Callers pass the ALREADY-established
 * `serverState`/`capabilities` from this hook's own instance instead. Both
 * hooks share the same request-building/response-classification logic
 * (`compileLive` below) so the two paths can't silently drift from each
 * other.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  PutDungeonRequestSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  probeAllCapabilities,
  type ServerCapabilities,
} from './capabilityProbe';
import { stripToV1Subset, type DungeonDoc } from './dungeonYaml';
import { SHOWCASE_FLOORPLAN } from './fixtures';
import { compileFloorPlanLocally } from './floorPlanCompile';
import type { AuthoringUnaryClient } from './useSaveDungeon';

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
    // Real bug fix (graduation unit, rpg-project#194, 2026-08-07): a
    // genuine connection failure (refused/DNS/etc.) never reaches the
    // server, so there's no trailer to carry a real gRPC status —
    // connect-web's `ConnectError.from()` wraps it with ITS OWN default,
    // `Code.Unknown`, not `Code.Unavailable`. Live-verified against an
    // actually-unreachable rpg-api (this unit's Home-button gate proof,
    // `useAuthoringGate.ts`, hit this exact path first: `code: 2` —
    // Unknown — never 14/Unavailable). Before this fix, an unreachable
    // server fell through to `'other'` below and was reported as LIVE —
    // this hook's own mount-time probe had never actually been exercised
    // against a real dead server, only against a hand-mocked
    // `Code.Unavailable` (which a legitimate server-side "temporarily
    // unavailable" trailer would still carry — kept for that case, just
    // not relied on alone anymore).
    if (err.code === Code.Unavailable || err.code === Code.Unknown) {
      return 'unreachable';
    }
    return 'other';
  }
  // A non-ConnectError throw (network layer never got a structured gRPC
  // response at all) is exactly the "can't reach the server" case too.
  return 'unreachable';
}

/** One live `validate_only` `PutDungeon` call, shaped and classified —
 * the exact request-building/response-handling `usePutDungeonPreview`'s
 * own per-edit effect used to inline, factored out so
 * `useCreationFloorPlanPreview` (below) can run the identical request for
 * a SECOND document without a second copy of this logic to drift out of
 * sync with this one. Never throws. */
type LiveCompileResult =
  | { kind: 'unparseable' }
  | { kind: 'success'; floorPlan: FloorPlan | null }
  | { kind: 'field-errors'; fieldErrors: ValidationError[] }
  | { kind: 'unreachable' }
  | { kind: 'request-error'; message: string };

async function compileLive(
  doc: DungeonDoc,
  yamlText: string,
  capabilities: ServerCapabilities | null,
  client: AuthoringUnaryClient
): Promise<LiveCompileResult> {
  let subsetYaml: string;
  try {
    subsetYaml = stripToV1Subset(yamlText, capabilities ?? undefined).yaml;
  } catch {
    // Not even shape-parseable yet (mid-edit) — nothing to preview this
    // tick. Not a request/field error; the YAML pane's own parse-error
    // path (DungeonBuilderConcept's applyText) already owns surfacing
    // this.
    return { kind: 'unparseable' };
  }
  try {
    const response = await client.putDungeon(
      create(PutDungeonRequestSchema, {
        key: doc.key,
        yaml: subsetYaml,
        validateOnly: true,
      })
    );
    if (response.success) {
      return { kind: 'success', floorPlan: response.floorPlan ?? null };
    }
    return { kind: 'field-errors', fieldErrors: response.fieldErrors };
  } catch (err) {
    const kind = classifyFailure(err);
    if (kind === 'unreachable') return { kind: 'unreachable' };
    // InvalidArgument (key/yaml mismatch, charset) reaching here means the
    // editor itself constructed a malformed request — a programming
    // error, never author feedback.
    return {
      kind: 'request-error',
      message:
        err instanceof ConnectError ? err.message : 'PutDungeon request failed',
    };
  }
}

export function usePutDungeonPreview(
  doc: DungeonDoc | null,
  yamlText: string,
  /** Graduation unit (rpg-project#194): when true, skips the mount-time
   * probe entirely and pins `serverState` at `'gate-off'` — the existing,
   * fully-built FIXTURES-MODE fallback path — without ever calling
   * `PutDungeon`. Used by the Concepts Lab dev sandbox mount
   * (`ConceptsView.tsx`) so it never depends on/talks to any server,
   * regardless of whether one happens to be reachable. The real `/author`
   * mount (`AuthorView.tsx`) omits this and gets today's normal
   * live-probing behavior unchanged. */
  forceFixtures = false,
  client: AuthoringUnaryClient = authoringClient
): UsePutDungeonPreviewResult {
  const [serverState, setServerState] = useState<ServerState>(
    forceFixtures ? 'gate-off' : 'probing'
  );
  const [liveFloorPlan, setLiveFloorPlan] = useState<FloorPlan | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [probeNonce, setProbeNonce] = useState(0);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(
    null
  );
  const [capabilitiesNonce, setCapabilitiesNonce] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const putDungeon = client.putDungeon;
  const resolvedClient = useMemo(() => ({ putDungeon }), [putDungeon]);

  // Mount-time (and manual retry) probe — never runs at all when
  // `forceFixtures` is set (see this function's own param doc comment).
  useEffect(() => {
    if (forceFixtures) {
      setServerState('gate-off');
      return;
    }
    let cancelled = false;
    setServerState('probing');
    (async () => {
      try {
        await resolvedClient.putDungeon(
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
  }, [probeNonce, forceFixtures, resolvedClient]);

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
    probeAllCapabilities(resolvedClient).then((caps) => {
      if (!cancelled) setCapabilities(caps);
    });
    return () => {
      cancelled = true;
    };
  }, [serverState, capabilitiesNonce, resolvedClient]);

  // Live per-edit preview, debounced, only while the probe found the gate on.
  useEffect(() => {
    if (serverState !== 'live' || !doc) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      (async () => {
        setRequestError(null);
        const result = await compileLive(
          doc,
          yamlText,
          capabilities,
          resolvedClient
        );
        switch (result.kind) {
          case 'unparseable':
            return;
          case 'success':
            setLiveFloorPlan(result.floorPlan);
            setFieldErrors([]);
            return;
          case 'field-errors':
            setFieldErrors(result.fieldErrors);
            // Keep the last good floor plan on screen rather than blanking
            // the board on every keystroke of an in-progress edit.
            return;
          case 'unreachable':
            setServerState('unreachable');
            return;
          case 'request-error':
            setRequestError(result.message);
            return;
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [serverState, doc, yamlText, capabilities, resolvedClient]);

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

/**
 * useCreationFloorPlanPreview — the creation-mode ("New Dungeon") canvas
 * document's own live `PutDungeon(validate_only)` preview (v0.3 wire
 * consumption unit, 2026-08-05). Creation mode never sent its document to
 * the server at all before this unit — its floor came exclusively from
 * `creation/canvasFloor.ts`'s client-side `deriveCanvasFloorCells`, and
 * its regions panel (`creation/RegionPanel.tsx`) from client-derived
 * containment alone. This hook is what makes a real `FloorPlan.floor_cells`
 * / `FloorPlan.regions` response reachable for that document, so the
 * consumers of THIS hook's `floorPlan` (`creation/canvasFloor.ts`'s
 * `resolveCanvasFloor`, `RegionPanel.tsx`'s wire-vs-derived region tree
 * comparison) have something real to render from once the server ships
 * Wave 0/1 (rpg-project#169/#192/#180) — today it stays effectively
 * dormant, since a live server's `floor_cells`/`regions` are both empty
 * (decode-unknown fields, per the rpg-api-protos#214 conformance review's
 * finding A4) and every consumer already falls back to its client-derived
 * source on empty.
 *
 * Deliberately takes `serverState`/`capabilities` as PARAMETERS rather
 * than probing for them itself — see this file's own header comment for
 * why a second independent probe would double real network traffic for no
 * new information. A transport failure on THIS document's own live call
 * does NOT flip the shared `serverState` (unlike
 * `usePutDungeonPreview`'s own per-edit effect, which owns that state) —
 * the edit-mode instance's mount-time probe is the one canonical
 * reachability signal; this hook just quietly keeps its last-good
 * `floorPlan` (or `null` if it never had one) until the shared state
 * itself recovers or the next debounced tick succeeds.
 *
 * Never fabricates a local compiled `FloorPlan` the way
 * `usePutDungeonPreview`'s own `fallbackFloorPlan` does —
 * `compileFloorPlanLocally` only knows the room-chain shape (rooms/
 * connectors/entrance) and produces nothing useful for a canvas-mode
 * document (empty `rooms`, no `floorCells`/`regions` at all), so callers
 * would get the same "nothing from the wire" signal either way; returning
 * `null` outright is the more honest of the two equally-empty options.
 */
export function useCreationFloorPlanPreview(
  doc: DungeonDoc | null,
  yamlText: string,
  serverState: ServerState,
  capabilities: ServerCapabilities | null,
  client: AuthoringUnaryClient = authoringClient
): { floorPlan: FloorPlan | null } {
  const [liveFloorPlan, setLiveFloorPlan] = useState<FloorPlan | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const putDungeon = client.putDungeon;
  const resolvedClient = useMemo(() => ({ putDungeon }), [putDungeon]);

  useEffect(() => {
    if (serverState !== 'live' || !doc) {
      // Leaving live mode (or having no document yet) invalidates any
      // previously-fetched response — same "never leak a capability/
      // response observed against one server into a different state"
      // discipline `capabilities` itself follows above.
      setLiveFloorPlan(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      compileLive(doc, yamlText, capabilities, resolvedClient).then(
        (result) => {
          if (result.kind === 'success') setLiveFloorPlan(result.floorPlan);
          // 'unparseable' (mid-edit)/'field-errors'/'unreachable'/
          // 'request-error': keep the last-good floor plan on screen,
          // matching `usePutDungeonPreview`'s own field-errors discipline —
          // this hook has no field_errors surface of its own (creation
          // mode's own validation feedback is out of this unit's scope),
          // so every non-success outcome is treated the same way here:
          // don't blank a plan that was already rendering.
        }
      );
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [serverState, doc, yamlText, capabilities, resolvedClient]);

  return { floorPlan: liveFloorPlan };
}
