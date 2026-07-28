/**
 * Fog of War knowledge -> HexGrid props (rpg-dnd5e-web#605).
 *
 * Design: rpg-project/ideas/fog-of-war/design.md §"Concept architecture".
 *
 * This is the renderer boundary. It is the only place the concept's plain
 * `WallLike` records are widened into real generated `Wall` protos, and the
 * only place the VISIBLE/REMEMBERED partition is flattened into the key-set
 * shape `HexGrid` already consumes (merged in rpg-dnd5e-web#602).
 *
 * It reads nothing but `FogKnowledge`. Unseen is omission: a hex with no
 * record contributes no floor tile, no wall, and no entity — there is no
 * "hidden" branch to get wrong.
 */

import type { HexGridEntity } from '@/components/hex-grid/HexGrid';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { wallKey } from '@/hooks/dungeonMapGeometry';
import {
  connectorDoorInputsFromWalls,
  legacyRenderWalls,
  regionInputsFromHexes,
} from '@/hooks/wallRunAdapters';
import {
  computeWallRuns,
  type ConnectorRun,
  type EnvelopeRun,
} from '@/hooks/wallRuns';
import { create } from '@bufbuild/protobuf';
import {
  HexRecordSchema,
  PositionSchema,
  WallSchema,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { hexKey, type PositionLike, type WallLike } from './events';
import type { FogKnowledge } from './reducer';

/** Exactly the `HexGridProps` subset this concept drives. */
export interface FogHexGridInputs {
  floorTiles: Map<string, AbsoluteFloorTile>;
  rememberedFloorHexKeys: ReadonlySet<string>;
  walls: Wall[];
  rememberedWallHexKeys: ReadonlySet<string>;
  entities: HexGridEntity[];
  /** Straight modular wall runs (rpg-project#133), computed through the same
   * adapters EncounterMap uses so the concept renders on the production wall
   * path rather than the legacy per-cell zigzag. */
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
  legacySyntyWalls: Wall[];
}

const toProtoWall = (edge: WallLike): Wall =>
  create(WallSchema, {
    from: create(PositionSchema, edge.from),
    to: create(PositionSchema, edge.to),
    kind: edge.kind,
    ...(edge.id === undefined ? {} : { id: edge.id }),
  });

const toCoord = (p: PositionLike) => ({ x: p.x, y: p.y, z: p.z });

export function toHexGridProps(knowledge: FogKnowledge): FogHexGridInputs {
  const floorTiles = new Map<string, AbsoluteFloorTile>();
  const rememberedFloorHexKeys = new Set<string>();
  const rememberedWallHexKeys = new Set<string>();
  const entities: HexGridEntity[] = [];

  // Deduplicate edges: a wall between two known hexes is carried by both
  // records, because each record is self-contained. Keying by `wallKey`
  // collapses the pair without either record having to know about the other.
  const walls = new Map<string, Wall>();

  for (const [key, record] of knowledge.hexes) {
    const remembered = record.state === 'REMEMBERED';

    // `zoneId` is the wire's grouping concept; `roomId` is the renderer's.
    // The concept maps one to the other rather than inventing a room list.
    floorTiles.set(key, { ...toCoord(record.position), roomId: record.zoneId });
    if (remembered) rememberedFloorHexKeys.add(key);

    for (const edge of record.edges) {
      const proto = toProtoWall(edge);
      walls.set(wallKey(proto), proto);
      // HexGrid remembers walls by hex key, not by wall id — a wall reads as
      // memory when the hex carrying it is memory.
      //
      // Key by the EDGE's own `from`, which is what the renderer looks up
      // (sceneKnowledge.rememberedSegment, ShadedHexWall). It equals the
      // record's position for every edge the authority emits, but keying by
      // the record would silently mislabel any edge authored against a
      // neighbour — remembered walls would read as visible and stay clickable.
      if (remembered) rememberedWallHexKeys.add(hexKey(edge.from));
    }

    for (const placement of record.contents) {
      const entity = knowledge.entities.get(placement.entityId);
      // Fail closed. The reducer already drops undisclosed placements; this
      // guard means the adapter cannot reintroduce one either.
      if (!entity) continue;

      entities.push({
        entityId: entity.entityId,
        name: entity.name,
        position: toCoord(record.position),
        type: entity.type,
        knowledgeState: remembered ? 'remembered' : 'visible',
        ...(entity.classRefId === undefined
          ? {}
          : { classRefId: entity.classRefId }),
        ...(entity.monsterRefId === undefined
          ? {}
          : { monsterRefId: entity.monsterRefId }),
        ...(entity.obstacleType === undefined
          ? {}
          : { obstacleType: entity.obstacleType }),
        ...(entity.propRefId === undefined
          ? {}
          : { propRefId: entity.propRefId }),
      });
    }
  }

  // Same four steps EncounterMap performs, on knowledge instead of the wire.
  // Regions come from zoneId; the doorway cell carries '' and is deliberately
  // in no region, so it becomes a connector rather than a one-hex room.
  const wallList = [...walls.values()];
  const protoHexes = [...knowledge.hexes.values()].map((record) =>
    create(HexRecordSchema, {
      position: create(PositionSchema, record.position),
      terrain: record.terrain,
      zoneId: record.zoneId,
    })
  );
  const regions = regionInputsFromHexes(protoHexes);
  const connectorDoors = connectorDoorInputsFromWalls(wallList);
  const runs = computeWallRuns({ regions, doors: connectorDoors });

  return {
    floorTiles,
    rememberedFloorHexKeys,
    walls: wallList,
    rememberedWallHexKeys,
    entities,
    envelopeRuns: runs.envelopeRuns,
    connectorRuns: runs.connectorRuns,
    legacySyntyWalls: legacyRenderWalls(
      wallList,
      regions,
      runs.connectorRuns,
      connectorDoors
    ),
  };
}

export { hexKey };
