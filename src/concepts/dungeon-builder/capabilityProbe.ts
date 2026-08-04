/**
 * capabilityProbe — per-field capability probing against the real
 * `AuthoringService.PutDungeon` RPC (unit: "capability-probed
 * graduation," rpg-dnd5e-web, 2026-08-04).
 *
 * The strip list (`dungeonYaml.ts`'s `stripToV1Subset`), the compile
 * badges (`YamlPane.tsx`'s `CompileBadgeStrip`), and Save & Play's
 * enable/disable gating all used to read a hardcoded, static snapshot of
 * "what dungeonspec compiles" (a comment, not a fact checked against
 * anything running). That snapshot went stale the moment the server
 * moved: Kirk's authoring branch started compiling authored `walls:` and
 * bare `start:` for real (verified live, this unit, 2026-08-04 — see
 * `probeAllCapabilities`'s own doc comment for the transcript), while the
 * client kept stripping both unconditionally and kept the creation-mode
 * Save & Play button hard-disabled with a blanket "proposed schema"
 * tooltip that was no longer honest about at least those two fields.
 *
 * This module replaces the snapshot with TRUTH: on live-mode connect (see
 * `usePutDungeonPreview.ts`), send one minimal `validate_only` doc per
 * target-dialect field, each exercising exactly ONE field against an
 * otherwise-known-good base document, and record what THIS server said
 * about THIS field, today. `stripToV1Subset` then takes the resulting
 * `ServerCapabilities` map as an optional parameter — a field the server
 * accepts is no longer stripped; a field it doesn't is stripped and
 * counted exactly as before. No capabilities (fixtures mode, or a probe
 * that hasn't completed/failed) falls back to the prior static,
 * conservative behavior — never a false "accepted."
 *
 * **Why per-field, not one big probe.** dungeonspec's real decode is
 * whole-document and strict: a single unrecognized field fails the ENTIRE
 * request ("field X not found in type dungeonspec.DungeonSpec" — every
 * unknown key on one document reports as a single batched decode error,
 * not per-field isolation). Sending every target-dialect field at once
 * would only ever tell you "at least one of these isn't accepted," never
 * which. Isolating one field per request is the only way to get an
 * honest per-field map.
 *
 * **Two distinct rejection shapes, both real, verified live (2026-08-04)
 * — this module keeps them, doesn't collapse them:**
 *
 * 1. **Decode-unknown** — `"field X not found in type dungeonspec.Y"`.
 *    The server's Go struct has no field for this key at all yet. Applies
 *    today to `holes`, `end`, `canvas`, `lighting`, `defaults`,
 *    `regions`, `height`, `rotate_degrees`, `targeting`.
 * 2. **Schema-known, capability-gated** —
 *    `"unsupported capability: <constraint>"`. The field DECODES (the Go
 *    struct has it) but is explicitly, deliberately rejected for this
 *    specific usage, with a message naming the real constraint. Applies
 *    today to `mount` (any placement — "mounted placements are not
 *    supported"), `facing` on a monster/boss/`mount:wall` entry ("facing
 *    only supported on room-scoped floor props" — but facing on a plain
 *    room-scoped floor prop is ACCEPTED, see below), and top-level
 *    `place:` ("top-level placement is not supported").
 *
 * Either way the raw server message is threaded through to
 * `CapabilityResult.message` verbatim — never paraphrased — so a UI
 * tooltip built from it stays exactly as honest as the server's own
 * answer, not this module's guess at wording.
 *
 * **`wallLines:` is deliberately NOT probed.** It's this concept's own
 * client-side sugar (`straightWallGeometry.ts` compiles a corner-anchored
 * line + door cells down to a footprint) — `stripToV1Subset` drops it
 * unconditionally, on its own line, separate from `walls:`, and never
 * projects it INTO a `walls:` entry before stripping (confirmed by
 * reading `stripToV1Subset` itself, not assumed). The real dungeonspec
 * server has never been sent this construct in any form, so there is
 * nothing to probe — it stays permanently client-only until a real
 * request-side authoring contract exists for it (rpg-project#179).
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import type { PutDungeonResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { PutDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

/** One entry per target-dialect construct `stripToV1Subset` knows how to
 * drop. `facing` is split into 4 entry-type variants because the real
 * server's own validator distinguishes them (see this file's doc comment,
 * "schema-known, capability-gated") — a single `facing` boolean would
 * have to either lie for 3 of the 4 shapes or refuse to say anything
 * useful for any of them. */
export type DialectField =
  | 'walls'
  | 'holes'
  | 'start'
  | 'end'
  | 'canvas'
  | 'lighting'
  | 'defaults'
  | 'regions'
  | 'mount'
  | 'height'
  | 'rotationDegrees'
  | 'targeting'
  | 'topLevelPlace'
  | 'facingFloorProp'
  | 'facingMonster'
  | 'facingBoss'
  | 'facingWallMount';

/** Every `DialectField` — order is the probe/display order. */
export const DIALECT_FIELDS: readonly DialectField[] = [
  'walls',
  'start',
  'end',
  'holes',
  'canvas',
  'lighting',
  'defaults',
  'regions',
  'mount',
  'height',
  'rotationDegrees',
  'targeting',
  'topLevelPlace',
  'facingFloorProp',
  'facingMonster',
  'facingBoss',
  'facingWallMount',
];

/** Short, human labels for a compact capabilities readout — not the same
 * as the honest tooltip message (`CapabilityResult.message`), which is
 * the real server text. */
export const DIALECT_FIELD_LABELS: Record<DialectField, string> = {
  walls: 'walls',
  holes: 'holes',
  start: 'start',
  end: 'end',
  canvas: 'canvas',
  lighting: 'lighting',
  defaults: 'defaults',
  regions: 'regions',
  mount: 'wall-mount',
  height: 'height',
  rotationDegrees: 'fine-rotation',
  targeting: 'targeting',
  topLevelPlace: 'top-level place',
  facingFloorProp: 'facing (floor prop)',
  facingMonster: 'facing (monster)',
  facingBoss: 'facing (boss)',
  facingWallMount: 'facing (wall-mount)',
};

export interface CapabilityResult {
  accepted: boolean;
  /** The real `field_errors` message(s) from the server, joined verbatim
   * — undefined only when `accepted`. A UI tooltip should show this text
   * directly rather than inventing its own explanation; it's already the
   * most specific, most current answer available. */
  message?: string;
}

export type ServerCapabilities = Record<DialectField, CapabilityResult>;

/** True whenever at least one dialect-field probe came back accepted —
 * the cheapest "has anything actually graduated" check, used to decide
 * whether the capabilities line is worth rendering at all. */
export function anyCapabilityAccepted(
  caps: ServerCapabilities | null
): boolean {
  if (!caps) return false;
  return DIALECT_FIELDS.some((f) => caps[f]?.accepted);
}

/** `{accepted, total}` — drives the "accepts N/M dialect fields" readout. */
export function capabilitySummary(caps: ServerCapabilities): {
  accepted: number;
  total: number;
} {
  const accepted = DIALECT_FIELDS.filter((f) => caps[f]?.accepted).length;
  return { accepted, total: DIALECT_FIELDS.length };
}

/**
 * Minimal, known-good base every probe document builds on: a 3-room chain
 * (entrance/chamber/boss) with a declared boss. Two rooms alone are NOT
 * enough — a real, load-bearing finding from building this probe suite
 * (verified live, 2026-08-04, not documented anywhere before this unit):
 * `dungeonspec.Validate` now rejects a chain with zero boss-archetype
 * rooms outright (`"dungeon must have exactly one boss room, found 0"`),
 * where earlier writing in this concept (CONTRACT.md's "Walk it" section)
 * only described a boss-archetype ROOM needing a boss, not the CHAIN
 * needing a boss room at all. Every probe below inherits this base so a
 * probe failure always means the ONE field under test was rejected, never
 * an unrelated baseline gap.
 *
 * `height: 8` puts the reserved door row at row 4 (`height / 2`) — every
 * probe places its field-under-test content on rows 0–3, matching the
 * live probing session's own verified-safe coordinates.
 */
function probeBase(key: string): string {
  return `version: 1
key: ${key}
name: Capability Probe
height: 8
rooms:
  - id: entry
    archetype: entrance
    width: 6
  - id: hall
    archetype: chamber
    width: 6
  - id: vault
    archetype: boss
    width: 10
    boss: { ref: "dnd5e:monsters:skeleton-captain", at: [3, 3] }
connectors:
  - { from: entry, to: hall }
  - { from: hall, to: vault }
`;
}

/** One extra snippet per `DialectField`, appended to `probeBase` (or, for
 * boss-facing, spliced into the boss entry — see the switch below). Each
 * exercises exactly the ONE field it's named for; every coordinate/ref is
 * one already verified live against Kirk's authoring branch while
 * building this probe suite (2026-08-04). */
function buildProbeDoc(field: DialectField, key: string): string {
  const base = probeBase(key);
  switch (field) {
    case 'walls':
      return (
        base +
        `walls:
  - { from: [1, 1], to: [2, 1], kind: solid }
  - { from: [1, 2], to: [2, 2], kind: door }
`
      );
    case 'holes':
      return (
        base +
        `holes:
  - [1, 1]
`
      );
    case 'start':
      return base + `start: [1, 1]\n`;
    case 'end':
      return base + `end: [1, 2]\n`;
    case 'canvas':
      return base + `canvas: { width: 20, height: 10 }\n`;
    case 'lighting':
      return (
        base +
        `lighting:
  ambient: 0.5
`
      );
    case 'defaults':
      return (
        base +
        `defaults:
  'dnd5e:monsters:skeleton-captain': { targeting: lowest-health }
`
      );
    case 'regions':
      return (
        base +
        `regions:
  - { id: entry-inner, archetype: chamber, cells: [[1, 1], [1, 2]] }
`
      );
    case 'mount':
      return withEntryPlace(
        base,
        `{ ref: "dnd5e:props:wall-banner", at: [2, 0], mount: wall }`
      );
    case 'height':
      return withEntryPlace(
        base,
        `{ ref: "dnd5e:props:candles", at: [2, 1], height: 1.2 }`
      );
    case 'rotationDegrees':
      return withEntryPlace(
        base,
        `{ ref: "dnd5e:props:wall-banner", at: [2, 0], mount: wall, facing: SE, rotate_degrees: 12 }`
      );
    case 'targeting':
      return withHallPlace(
        base,
        `{ ref: "dnd5e:monsters:skeleton-captain", at: [3, 2], targeting: lowest-health }`
      );
    case 'topLevelPlace':
      return (
        base +
        `place:
  - { ref: "dnd5e:props:pillar", at: [10, 2] }
`
      );
    case 'facingFloorProp':
      return withEntryPlace(
        base,
        `{ ref: "dnd5e:props:statue-reaper", at: [1, 1], facing: SE }`
      );
    case 'facingMonster':
      return withHallPlace(
        base,
        `{ ref: "dnd5e:monsters:skeleton-captain", at: [3, 2], facing: NE }`
      );
    case 'facingBoss':
      return base.replace(
        'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [3, 3] }',
        'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [3, 3], facing: W }'
      );
    case 'facingWallMount':
      return withEntryPlace(
        base,
        `{ ref: "dnd5e:props:wall-banner", at: [2, 0], mount: wall, facing: SE }`
      );
  }
}

/** Inserts a `place:` list under the `entry` room — every probe doc that
 * needs a room-scoped floor-prop placement uses this rather than hand-
 * splicing YAML text repeatedly. */
function withEntryPlace(base: string, entry: string): string {
  return base.replace(
    '  - id: entry\n    archetype: entrance\n    width: 6\n',
    `  - id: entry\n    archetype: entrance\n    width: 6\n    place:\n      - ${entry}\n`
  );
}

/** Same as `withEntryPlace`, for the `hall` room — used by probes that
 * need a MONSTER placement (monster refs are only meaningful outside the
 * entrance room in this base, though nothing about the base actually
 * requires that; kept for readability, matching the verified probe
 * documents this module's doc comment describes). */
function withHallPlace(base: string, entry: string): string {
  return base.replace(
    '  - id: hall\n    archetype: chamber\n    width: 6\n',
    `  - id: hall\n    archetype: chamber\n    width: 6\n    place:\n      - ${entry}\n`
  );
}

function classify(response: PutDungeonResponse): CapabilityResult {
  if (response.success) return { accepted: true };
  const message = response.fieldErrors.map((e) => e.message).join('; ');
  return {
    accepted: false,
    message: message || 'rejected — no detail returned',
  };
}

/**
 * Probes every `DialectField` against the real `PutDungeon` RPC,
 * `validate_only: true`, one request per field, run concurrently. Never
 * throws — a transport failure on an individual probe (the whole-suite
 * caller already knows the server is reachable, since this only runs
 * once `usePutDungeonPreview`'s own mount-time probe found `serverState
 * === 'live'`) is recorded as `accepted: false` with the error's own
 * message, same shape as a real rejection, so a UI reading
 * `ServerCapabilities` never has to special-case "probe request itself
 * failed" separately from "server said no."
 *
 * **Live-verified, 2026-08-04**, against `rpg-api-dungeon-builder-763` /
 * its envoy sidecar (`localhost:8091`) — the transcript this module's own
 * field-by-field logic is built from, not a guess:
 *
 * - `walls` — **accepted** (`success: true`).
 * - `start` — **accepted** (`success: true`).
 * - `facingFloorProp` — **accepted** (`success: true`) — a room-scoped,
 *   non-monster, non-`mount:wall` `place:` entry's `facing:` compiles.
 * - `holes`, `end`, `canvas`, `lighting`, `defaults`, `regions`,
 *   `height`, `rotationDegrees`, `targeting` — decode-unknown
 *   (`"field X not found in type dungeonspec.Y"`).
 * - `mount` — schema-known, rejected (`"unsupported capability: mounted
 *   placements are not supported"`).
 * - `facingMonster`, `facingBoss`, `facingWallMount` — schema-known,
 *   rejected (`"unsupported capability: facing only supported on
 *   room-scoped floor props"`).
 * - `topLevelPlace` — schema-known, rejected (`"unsupported capability:
 *   top-level placement is not supported"`).
 */
export async function probeAllCapabilities(): Promise<ServerCapabilities> {
  const entries = await Promise.all(
    DIALECT_FIELDS.map(async (field) => {
      const key = `capprobe-${field.toLowerCase()}`;
      try {
        const response = await authoringClient.putDungeon(
          create(PutDungeonRequestSchema, {
            key,
            yaml: buildProbeDoc(field, key),
            validateOnly: true,
          })
        );
        return [field, classify(response)] as const;
      } catch (err) {
        return [
          field,
          {
            accepted: false,
            message:
              err instanceof Error ? err.message : 'probe request failed',
          },
        ] as const;
      }
    })
  );
  return Object.fromEntries(entries) as ServerCapabilities;
}
