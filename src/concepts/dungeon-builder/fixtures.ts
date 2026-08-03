/**
 * fixtures.ts — the desired consumer data for the dungeon-builder concept
 * (`docs/how-to/concepts-route.md`'s fixture-first convention). Typed
 * against the real generated `FloorPlan` proto message
 * (`AuthoringService.PutDungeon`, rpg-api-protos v0.1.115) wherever the
 * wire carries the data — every `*_FLOORPLAN` fixture below is built with
 * `create(FloorPlanSchema, ...)`, so the board component cannot tell a
 * fixture from a real `PutDungeon` response.
 *
 * All three FloorPlan fixtures are REAL recorded server responses, not
 * derived/guessed — verified against:
 *   - rpg-api PR #750/#752 grpcurl transcripts (smoke-test, s2-loop-test)
 *   - a real `PutDungeon(validate_only)` call against showcase.yaml itself,
 *     captured at /home/kirk/game-dev/concepts/dungeon-builder/fixtures/
 *     showcase-floorplan.json — this closes the standalone concept's own
 *     "unverified past 2 rooms" and "entrance cell is a guess" findings;
 *     see CONTRACT.md.
 */
import { create } from '@bufbuild/protobuf';
import {
  type FloorPlan,
  FloorPlanSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

/** The Shrine Hall — 3 rooms, rich placements, load-bearing comments.
 * Verbatim copy of /home/kirk/game-dev/dungeon-content/showcase.yaml —
 * kept in sync by dungeonYaml.test.ts's round-trip test, which reads the
 * real file directly and fails if this copy drifts. */
export const SHOWCASE_YAML = `version: 1
key: showcase
name: The Shrine Hall
theme: crypt
height: 8
rooms:
  - id: antechamber
    archetype: entrance
    width: 6
    place:
      - { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:brazier", at: [1, 6], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:bone-pile", at: [4, 6], blocks_movement: false, blocks_los: false }
  - id: shrine
    archetype: chamber
    width: 14
    place:
      # door guardians — vault door (right, row 4)
      - { ref: "dnd5e:props:statue-reaper", at: [13, 3] }
      - { ref: "dnd5e:props:statue-knight-hooded", at: [13, 5] }
      # colonnade: 8 pillars framing the center lane (rows 3-5 clear)
      - { ref: "dnd5e:props:pillar", at: [2, 2] }
      - { ref: "dnd5e:props:pillar", at: [4, 2] }
      - { ref: "dnd5e:props:pillar", at: [6, 2] }
      - { ref: "dnd5e:props:pillar", at: [8, 2] }
      - { ref: "dnd5e:props:pillar", at: [2, 6] }
      - { ref: "dnd5e:props:pillar", at: [4, 6] }
      - { ref: "dnd5e:props:pillar", at: [6, 6] }
      - { ref: "dnd5e:props:pillar", at: [8, 6] }
      # braziers at the walls — pool rhythm without cluttering the lane
      - { ref: "dnd5e:props:brazier", at: [2, 0], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:brazier", at: [11, 0], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:brazier", at: [2, 7], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:brazier", at: [11, 7], blocks_movement: true, blocks_los: false }
      # banners high on the walls between braziers
      - { ref: "dnd5e:props:wall-banner", at: [5, 0], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:wall-banner", at: [9, 0], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:wall-banner", at: [5, 7], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:wall-banner", at: [9, 7], blocks_movement: false, blocks_los: false }
      # the shrine focal at the lane's end, before the vault door
      - { ref: "dnd5e:props:altar", at: [11, 3], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:glowing-orb", at: [11, 5], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:candles", at: [12, 1], blocks_movement: false, blocks_los: false }
      # crypt texture kept to the corners
      - { ref: "dnd5e:props:tomb-open", at: [1, 1], blocks_movement: true, blocks_los: false }
      - { ref: "dnd5e:props:chains", at: [13, 1], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:bone-pile", at: [1, 7], blocks_movement: false, blocks_los: false }
      - { ref: "dnd5e:props:skeleton-remains", at: [12, 7], blocks_movement: false, blocks_los: false }
  - id: vault
    archetype: boss
    width: 8
    boss: { ref: "dnd5e:monsters:skeleton-captain", at: [5, 5] }
    place:
      - { ref: "dnd5e:props:statue-reaper", at: [1, 1] }
      - { ref: "dnd5e:props:tomb-open", at: [1, 6], blocks_movement: true, blocks_los: false }
connectors:
  - { from: antechamber, to: shrine }
  - { from: shrine, to: vault }
`;

/** REAL `PutDungeon(validate_only: true)` response for showcase.yaml
 * exactly as submitted above — captured at
 * /home/kirk/game-dev/concepts/dungeon-builder/fixtures/showcase-floorplan.json.
 * This is the fixtures-mode board's default FloorPlan. */
export const SHOWCASE_FLOORPLAN: FloorPlan = create(FloorPlanSchema, {
  rooms: [
    { id: 'antechamber', archetype: 'entrance', width: 6, startColumn: 0 },
    { id: 'shrine', archetype: 'chamber', width: 14, startColumn: 7 },
    { id: 'vault', archetype: 'boss', width: 8, startColumn: 22 },
  ],
  connectors: [
    {
      doorId: 'showcase-door-antechamber-shrine',
      fromRoomId: 'antechamber',
      toRoomId: 'shrine',
      column: 6,
      locked: false,
    },
    {
      doorId: 'showcase-door-shrine-vault',
      fromRoomId: 'shrine',
      toRoomId: 'vault',
      column: 21,
      locked: false,
    },
  ],
  height: 8,
  doorRow: 4,
  entrance: { column: 0, row: 4 },
});

/** rpg-api PR #750's grpcurl smoke-test YAML — a synthetic 2-room
 * entrance(w6) -> boss(w8) dungeon. Real submitted content, verbatim. */
export const SMOKE_TEST_YAML = `version: 1
key: smoke-test
name: Smoke Test
height: 8
rooms:
  - id: entrance
    archetype: entrance
    width: 6
  - id: boss
    archetype: boss
    width: 8
    boss: { ref: "dnd5e:monsters:skeleton-captain", at: [4, 2] }
connectors:
  - { from: entrance, to: boss }
`;

/** REAL response to the YAML above, from PR #750's transcript. Note the
 * proto3 JSON quirk this concept's report calls out: the entrance room's
 * own `startColumn` and the top-level `entrance.column` are both elided
 * because they're 0, the wire default — not missing fields. */
export const SMOKE_TEST_FLOORPLAN: FloorPlan = create(FloorPlanSchema, {
  rooms: [
    { id: 'entrance', archetype: 'entrance', width: 6, startColumn: 0 },
    { id: 'boss', archetype: 'boss', width: 8, startColumn: 7 },
  ],
  connectors: [
    {
      doorId: 'smoke-test-door-entrance-boss',
      fromRoomId: 'entrance',
      toRoomId: 'boss',
      column: 6,
      locked: false,
    },
  ],
  height: 8,
  doorRow: 4,
  entrance: { column: 0, row: 4 },
});

/** rpg-api PR #752's grpcurl transcript — identical shape to smoke-test,
 * different key, proves the `dungeon_key` plumbing independently. */
export const S2_LOOP_YAML = `version: 1
key: s2-loop-test
name: S2 Loop Test
height: 8
rooms:
  - id: entrance
    archetype: entrance
    width: 6
  - id: boss
    archetype: boss
    width: 8
    boss: { ref: "dnd5e:monsters:skeleton-captain", at: [4, 2] }
connectors:
  - { from: entrance, to: boss }
`;

export const S2_LOOP_FLOORPLAN: FloorPlan = create(FloorPlanSchema, {
  rooms: [
    { id: 'entrance', archetype: 'entrance', width: 6, startColumn: 0 },
    { id: 'boss', archetype: 'boss', width: 8, startColumn: 7 },
  ],
  connectors: [
    {
      doorId: 's2-loop-test-door-entrance-boss',
      fromRoomId: 'entrance',
      toRoomId: 'boss',
      column: 6,
      locked: false,
    },
  ],
  height: 8,
  doorRow: 4,
  entrance: { column: 0, row: 4 },
});

/**
 * Evidence that a general (non-boss) monster placement via `place:` is
 * real, not just described in design.md — resolves the standalone
 * concept's own "unverified" finding. Captured from a real
 * `GetEncounter` after `PutDungeon`+`StartEncounter` against a
 * "monster-place-check" dungeon whose entrance room placed
 * `dnd5e:monsters:skeleton` via `place:` (not `boss:`). Full transcript:
 * /home/kirk/game-dev/concepts/dungeon-builder/fixtures/monster-place-check.json.
 * The relevant excerpt — a monster entity distinct from any character or
 * the boss, seated in the entrance zone:
 *
 *   { "id": "monster-entrance-0", "type": "ENTITY_TYPE_MONSTER",
 *     "monster": { "monsterRef": { "module": "dnd5e", "type": "monsters", "id": "skeleton" } } }
 *   // hex at (x:3,y:-4,z:1), zoneId "entrance", contents: [{entityId: "monster-entrance-0"}]
 *
 * This is why the palette below offers a general monster placement, not
 * just the boss pin.
 */
