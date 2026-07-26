/**
 * Visibility reconciliation for the Fog of War concept (rpg-dnd5e-web#605).
 *
 * Stands in for the toolkit's reconciler and the API's per-viewer delivery.
 * After any mutation it compares what the viewer could see before with what
 * they can see now, and emits only the difference.
 *
 * Emitting only the difference is what makes hidden mutations free: a change
 * the viewer cannot observe produces no record, so their memory is never
 * touched. Nothing anywhere implements "preserve stale memory" — it is the
 * absence of a message.
 */

import type {
  FogEntity,
  HexKnowledgeChanged,
  HexRecord,
  Placement,
  PositionLike,
  WallLike,
} from '../events';
import { visibleFrom } from './los';
import {
  key,
  NEIGHBOURS,
  step,
  VIEWER_START,
  WALL_SOLID,
  type World,
} from './world';

export interface Authority {
  /** First event on a new subscription: everything currently visible. */
  subscribe: () => HexKnowledgeChanged;
  moveViewer: (to: PositionLike) => HexKnowledgeChanged;
  setDoor: (doorHex: PositionLike, kind: number) => HexKnowledgeChanged;
  /** Walks an entity one hex at a time, reconciling after each step. */
  moveEntity: (entityId: string, path: PositionLike[]) => HexKnowledgeChanged[];
  /** Mutates world truth, then reconciles. Emits nothing if the viewer could
   * not observe the change. */
  mutateHidden: (mutate: (world: World) => void) => HexKnowledgeChanged;
  viewerHex: () => PositionLike;
}

export function createAuthority(
  world: World,
  viewerStart: PositionLike = VIEWER_START
): Authority {
  let viewer = viewerStart;
  let visible = new Set<string>();
  /** The last record built for each hex — the viewer's observation, which is
   * what a REMEMBERED record must carry. Never current world truth. */
  const observed = new Map<string, HexRecord>();

  const placementsOn = (hexKey: string): Placement[] => {
    const out: Placement[] = [];
    for (const [entityId, placed] of world.placements) {
      if (key(placed.hex) === hexKey) {
        out.push({ entityId, facing: placed.facing });
      }
    }
    return out;
  };

  const edgesOf = (position: PositionLike): WallLike[] => {
    const edges: WallLike[] = [];
    for (const delta of NEIGHBOURS) {
      const neighbour = step(position, delta);
      if (!world.hexes.has(key(neighbour))) {
        edges.push({ from: position, to: neighbour, kind: WALL_SOLID });
      }
    }
    const door = world.doors.get(key(position));
    if (door !== undefined) {
      const passage = world.doorPassage.get(key(position));
      if (passage) {
        edges.push({
          from: position,
          to: passage,
          kind: door,
          id: `door-${key(position)}`,
        });
      }
    }
    return edges;
  };

  const buildRecord = (hexKey: string): HexRecord => {
    const hex = world.hexes.get(hexKey)!;
    return {
      position: hex.position,
      state: 'VISIBLE',
      terrain: hex.terrain,
      zoneId: hex.zoneId,
      edges: edgesOf(hex.position),
      contents: placementsOn(hexKey),
    };
  };

  const same = (a: HexRecord | undefined, b: HexRecord): boolean =>
    a !== undefined && JSON.stringify(a) === JSON.stringify(b);

  const disclose = (records: HexRecord[]): FogEntity[] => {
    const ids = new Set(
      records.flatMap((record) => record.contents.map((p) => p.entityId))
    );
    const out: FogEntity[] = [];
    for (const id of ids) {
      const entity = world.entities.get(id);
      if (!entity) continue;
      out.push({
        entityId: entity.entityId,
        name: entity.name,
        type: entity.type,
        ...(entity.monsterRefId === undefined
          ? {}
          : { monsterRefId: entity.monsterRefId }),
        ...(entity.classRefId === undefined
          ? {}
          : { classRefId: entity.classRefId }),
      });
    }
    return out;
  };

  const reconcile = (): HexKnowledgeChanged => {
    const now = visibleFrom(world, viewer);
    const hexes: HexRecord[] = [];

    for (const hexKey of now) {
      const record = buildRecord(hexKey);
      // Unchanged and already visible? Say nothing. This is what keeps a
      // hidden mutation silent.
      if (same(observed.get(hexKey), record)) continue;
      observed.set(hexKey, record);
      hexes.push(record);
    }

    for (const hexKey of visible) {
      if (now.has(hexKey)) continue;
      const lastSeen = observed.get(hexKey);
      if (!lastSeen) continue;
      // Freeze the observation, not current truth. Whatever was standing there
      // when sight was lost stays standing there in the viewer's memory.
      const frozen: HexRecord = { ...lastSeen, state: 'REMEMBERED' };
      observed.set(hexKey, frozen);
      hexes.push(frozen);
    }

    visible = now;
    return { hexes, entities: disclose(hexes) };
  };

  return {
    subscribe: reconcile,
    viewerHex: () => viewer,
    moveViewer: (to) => {
      viewer = to;
      return reconcile();
    },
    setDoor: (doorHex, kind) => {
      world.doors.set(key(doorHex), kind);
      return reconcile();
    },
    moveEntity: (entityId, path) =>
      path.map((hex) => {
        const placed = world.placements.get(entityId);
        if (placed) world.placements.set(entityId, { ...placed, hex });
        return reconcile();
      }),
    mutateHidden: (mutate) => {
      mutate(world);
      return reconcile();
    },
  };
}
