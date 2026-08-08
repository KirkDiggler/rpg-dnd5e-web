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
 * **Two distinct rejection shapes, both real — this module keeps them,
 * doesn't collapse them:**
 *
 * 1. **Decode-unknown** — `"field X not found in type dungeonspec.Y"`.
 *    The server's Go struct has no field for this key at all yet. This is
 *    a moving target BY DESIGN — it's the "hasn't shipped yet" bucket, so
 *    which fields land here shrinks every time a platform wave ships.
 *    Read `probeAllCapabilities`'s own doc comment for the CURRENT
 *    observed split, not this paragraph — a hardcoded field list here
 *    would silently rot the moment the next wave lands, which is exactly
 *    the bug this module exists to prevent one layer up (the strip
 *    list/badges/gating snapshot problem described above).
 * 2. **Schema-known, capability-gated** —
 *    `"unsupported capability: <constraint>"`. The field DECODES (the Go
 *    struct has it) but is explicitly, deliberately rejected for this
 *    specific usage, with a message naming the real constraint.
 *
 * Either way the raw server message is threaded through to
 * `CapabilityResult.message` verbatim — never paraphrased — so a UI
 * tooltip built from it stays exactly as honest as the server's own
 * answer, not this module's guess at wording.
 *
 * **A third thing that looks like a rejection shape but isn't one: an
 * illegal mode COMBO.** Spec v0.3 (`ideas/dungeon-builder/spec/v0.3/spec.md`
 * §4.5.1-2) splits every document into exactly one of two floor-source
 * modes — room-chain (`rooms:` non-empty) or canvas (`canvas:` present,
 * `rooms: []`) — and rejects a document declaring both
 * (`"canvas mode rooms must be an explicit empty sequence (rooms: [])"`).
 * A field that's only ever legal in ONE mode (`canvas`, `topLevelPlace`
 * §4.6.1, `regions` — forced canvas-only by §4.10.3.8's rooms/regions
 * exclusion) can never be probed by appending it to the OTHER mode's base
 * document: the response is always this combo rejection, which reads
 * exactly like "field unsupported" but means something entirely
 * different and would never clear no matter how many platform waves ship.
 * `buildProbeDoc` below picks the base per field's own legal mode for
 * exactly this reason — see its field/base/spec-section table.
 *
 * **`wallLines:` is deliberately NOT probed, but is no longer always
 * dropped.** The KEY itself never survives (dungeonspec has no
 * `wallLines:` field and never will — it's this concept's own
 * client-side sugar), so there is nothing about the key to probe. But as
 * of the wallLines->edges projection unit (rpg-project#169), its
 * GEOMETRY is no longer unconditionally lost: `stripToV1Subset` now
 * checks `accepted('walls')` for wallLines too — when `walls:` itself is
 * accepted, every wallLine's footprint + crossed-edge truth
 * (`straightWallGeometry.ts`'s `projectWallLineToEdges`) is projected
 * into real edge-native `walls:` entries and merged into whatever
 * explicit `walls:` survives, counted in `compiling`, not `dropped`. Only
 * when `walls:` itself is NOT accepted does wallLines fall back to the
 * original unconditional drop (confirm by reading `stripToV1Subset`
 * itself, not this comment, if the exact behavior matters — it's
 * `accepted('walls')`-gated the same way as everything else in this
 * file, no hardcoded exception). See TARGET-YAML.md's "Straight walls:
 * stripToV1Subset" section for the full writeup. `walls:` is real,
 * accepted-by-a-real-server capability probed above, same as every other
 * field in `DIALECT_FIELDS` — wallLines rides on that probe rather than
 * needing one of its own, because its own key is never sent regardless
 * of the answer. It stays permanently client-only (the key, not the
 * geometry) until a real request-side authoring contract exists for it
 * (rpg-project#179).
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
 * The `DialectField`s that fall inside the RATIFIED v0.3 level cut
 * (`ideas/dungeon-builder/spec/v0.3/spec.md` §1, rpg-project, status
 * RATIFIED 2026-08-05) — derived from that table's groups (b)/(c)/(d),
 * not declared independently:
 *
 *   (b) already-compiling: `walls:`, `start:`, room-scoped floor-prop
 *       `facing:`             -> `walls`, `start`, `facingFloorProp`
 *   (c) Wave 0 (#192): `canvas:`, top-level `place:` (canvas mode)
 *                              -> `canvas`, `topLevelPlace`
 *   (d) Wave 1 (#180): `regions:`
 *                              -> `regions`
 *
 * `facingMonster`/`facingBoss`/`facingWallMount` are DELIBERATELY
 * excluded — not because they're "draft," but because spec §4.9.3 is a
 * REJECTION requirement: "a monster `place:` entry, a `boss:` entry, or a
 * `mount: wall` placement with `facing:` set MUST be rejected... not a
 * decode failure and not a silent drop." A fully-compliant v0.3 server
 * MUST answer `accepted: false` for these three forever — including them
 * here would make "v0.3 cut: fully supported" an impossible bar even a
 * perfect server could never clear. The remaining 8 of the probe's 17
 * fields (`holes`/`end`/`lighting`/`defaults`/`mount`/`height`/
 * `rotationDegrees`/`targeting`) are spec §2's explicit "ABOVE v0.3" list
 * — genuinely draft-tier, correctly excluded on those grounds instead.
 * 6 + 8 + 3 = 17, the full `DIALECT_FIELDS` set, with no field
 * unaccounted for either way.
 *
 * Deliberately a fresh set here rather than reusing `specCompat.ts`'s
 * `inferSpecCut` — that function classifies a DOCUMENT's own construct
 * USAGE (a `DungeonDoc`'s fields), a different domain/shape than this
 * one (which `DialectField`s a SERVER accepts). The two are consistent
 * with each other (cross-checked against the same spec sections) but
 * there's no single function shape that legitimately serves both without
 * forcing an artificial coupling between document analysis and
 * capability probing.
 */
export const V03_CUT_FIELDS: ReadonlySet<DialectField> = new Set([
  'walls',
  'start',
  'facingFloorProp',
  'canvas',
  'topLevelPlace',
  'regions',
]);

/** True only when EVERY `V03_CUT_FIELDS` member is accepted — the ratified
 * v0.3 cut is fully live on this server, regardless of the draft-tier (or
 * spec-mandated-rejection) remainder of `DIALECT_FIELDS`. Drives the
 * capabilities line's "v0.3 cut: fully supported" suffix
 * (`YamlPane.tsx`'s `CapabilitiesLine`) — derived from the live probe
 * result every time this is called, never cached/hardcoded, so it
 * un-claims itself the instant a server (an older deploy, a rollback)
 * stops accepting even one cut field. */
export function v03CutFullySupported(caps: ServerCapabilities): boolean {
  for (const field of V03_CUT_FIELDS) {
    if (!caps[field]?.accepted) return false;
  }
  return true;
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

/**
 * Canvas-mode counterpart to `probeBase`: the minimal known-good
 * canvas-mode document — `canvas:` present, `rooms: []` (spec v0.3
 * §4.5.1). Every canvas-family field (`CANVAS_FAMILY_FIELDS` below)
 * inherits this instead of `probeBase`'s room-chain document, because
 * v0.3 makes the two floor-source modes mutually exclusive (§4.5.2):
 * appending a canvas-family field to a `rooms:`-non-empty document isn't
 * probing that field at all, it's probing the illegal mode combo, and
 * the server's combo rejection
 * (`"canvas mode rooms must be an explicit empty sequence (rooms: [])"`)
 * reads exactly like "field unsupported" for every field layered on top,
 * forever — this was the actual bug (rpg-project#192 Wave 0 shipped
 * 2026-08-06; see this file's own header comment).
 *
 * `name:` is set because the server rejects an empty `name:` regardless
 * of mode (§4.1's `name` row). Document-level `height:` is intentionally
 * omitted: §4.1 states it's unvalidated and unused in canvas mode
 * (`canvas.height` is authoritative), and a missing value decodes to `0`
 * with no effect on canvas geometry. No `connectors:`/boss content either
 * — canvas mode skips the whole room-chain/boss validation cluster
 * outright (§4.5.3).
 *
 * Live-verified, 2026-08-06, against the Wave-0 server (`localhost:8092`,
 * `rpg-api:dev-wave0`): this exact base alone (the `canvas` probe, below)
 * returns `success: true` with a 200-cell `FloorPlan.floorCells`
 * (20×10) — see `probeAllCapabilities`'s own doc comment for the full
 * transcript this base was verified against.
 */
function canvasProbeBase(key: string): string {
  return `version: 1
key: ${key}
name: Capability Probe
canvas: { width: 20, height: 10 }
rooms: []
`;
}

/** Fields whose only legal document mode is canvas mode (§4.5.1) — see
 * `canvasProbeBase`'s doc comment for why probing them on the room-chain
 * base can never produce an honest answer. */
const CANVAS_FAMILY_FIELDS: ReadonlySet<DialectField> = new Set([
  'canvas',
  'topLevelPlace',
  'regions',
]);

/**
 * One extra snippet per `DialectField`, appended to the field's own
 * legal-mode base (or, for boss-facing, spliced into the boss entry —
 * see the switch below). Each exercises exactly the ONE field it's named
 * for.
 *
 * **Base selection, field by field — the spec section each is grounded
 * in:**
 *
 * | Field              | Base    | Spec section                                          |
 * |---------------------|---------|--------------------------------------------------------|
 * | `walls`              | chain   | §4.7 (mode-independent; canvas-floor variant untested)  |
 * | `start`               | chain   | §4.8 (resolves against either mode's floor; untested on canvas is fine — same acceptance path) |
 * | `end`                 | chain   | §2 (unfiled — decode-unknown regardless of mode)        |
 * | `holes`               | chain   | §2 (deferred — decode-unknown regardless of mode)       |
 * | `canvas`              | canvas  | §4.5 (the base itself IS the field under test)          |
 * | `lighting`             | chain   | §2 (rpg-project#190 — decode-unknown regardless of mode) |
 * | `defaults`             | chain   | §2 (unfiled — decode-unknown regardless of mode)        |
 * | `regions`              | canvas  | §4.10.3.8 (rooms/regions combo forbidden — canvas-only in practice) |
 * | `mount`                | chain   | §2 (rpg-project#188 — capability gate, mode-independent) |
 * | `height` (placement)   | chain   | §2 (rpg-project#188, z-axis — mode-independent)          |
 * | `rotationDegrees`      | chain   | §2 (experiment only — mode-independent)                 |
 * | `targeting`            | chain   | §2 (rpg-project#191 — mode-independent)                 |
 * | `topLevelPlace`        | canvas  | §4.6.1 ("MUST be accepted in canvas mode and MUST remain rejected in room-chain mode") |
 * | `facingFloorProp`      | chain   | §4.9.2 (accepted room-scoped OR canvas top-level — room-scoped variant is representative) |
 * | `facingMonster`        | chain   | §4.9.3 (field-path rejection, mode-independent)          |
 * | `facingBoss`           | chain   | §4.9.3 + §4.6.2 (`boss:` is room-scoped only — no canvas-mode equivalent exists to probe) |
 * | `facingWallMount`      | chain   | §4.9.3 (field-path rejection, mode-independent)          |
 *
 * Every coordinate/ref not otherwise noted is one already verified live
 * against a real server while building this probe suite.
 */
function buildProbeDoc(field: DialectField, key: string): string {
  const base = CANVAS_FAMILY_FIELDS.has(field)
    ? canvasProbeBase(key)
    : probeBase(key);
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
      // `base` (canvasProbeBase) already IS `canvas: {...}` + `rooms: []`
      // — that combination is the field under test, nothing to append.
      return base;
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
 * **Live-verified, 2026-08-06**, against the Wave-0 server
 * (`rpg-api:dev-wave0`, `localhost:8092`, rpg-project#192 merged to
 * rpg-api `dev` the same day) — the transcript this module's field/base
 * mapping (`buildProbeDoc`'s table) is built from, not a guess. **5 of 17
 * accepted**, up from the pre-Wave-0 3/17 (2026-08-04 transcript,
 * superseded below) — the `canvas`/`topLevelPlace` gain is Wave 0 itself
 * arriving; every prior accepted/rejected field's status is unchanged,
 * confirming this unit's fix is additive, not a regression:
 *
 * - `walls`, `start`, `facingFloorProp` — **accepted** (`success: true`),
 *   unchanged from 2026-08-04.
 * - `canvas` — **accepted** (`success: true`, 200-cell `FloorPlan` for a
 *   20×10 canvas) — probed on `canvasProbeBase` alone. NEW this unit;
 *   previously misread as rejected because the old probe appended
 *   `canvas:` to the room-chain base, which the server correctly rejects
 *   as an illegal mode combo, not as "canvas unsupported" (see this
 *   file's header comment).
 * - `topLevelPlace` — **accepted** (`success: true`) on `canvasProbeBase`.
 *   NEW this unit, same root cause as `canvas` above. Confirmed still
 *   rejected on the room-chain base per spec §4.6.1
 *   (`"place[0]: unsupported capability: top-level placement is not
 *   supported"`) — the mode-scoping is real, not a probe artifact.
 * - `regions` — still honestly rejected: decode-unknown
 *   (`"field regions not found in type dungeonspec.DungeonSpec"`), same
 *   message on both `canvasProbeBase` and the room-chain base, since
 *   Wave 1 (rpg-project#180) hasn't shipped server-side yet. Now probed
 *   on `canvasProbeBase` (§4.10.3.8 forces canvas-only) so that the
 *   moment Wave 1 ships, this flips to accepted instead of forever
 *   reading as the mode-combo rejection.
 * - `holes`, `end`, `lighting`, `defaults`, `height` (placement z-axis),
 *   `rotationDegrees`, `targeting` — decode-unknown
 *   (`"field X not found in type dungeonspec.Y"`), unchanged.
 * - `mount` — schema-known, rejected. Message now carries a field-path
 *   prefix the 2026-08-04 transcript didn't record:
 *   `"rooms[0].place[0].mount: unsupported capability: mounted
 *   placements are not supported"`.
 * - `facingMonster`, `facingBoss`, `facingWallMount` — schema-known,
 *   rejected, each with its own field-path prefix (e.g.
 *   `"rooms[2].boss.facing: unsupported capability: facing only
 *   supported on floor props"`). Wording note: the constraint text itself
 *   changed from "room-scoped floor props" (2026-08-04) to "floor props"
 *   — consistent with facing now also being legitimately accepted on a
 *   canvas-mode TOP-LEVEL (not room-scoped) floor prop per spec §4.9.2.
 *   Not re-derived here — threaded verbatim from the server either way,
 *   per this module's own rule.
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
