/**
 * Authored world truth for the Fog of War concept (rpg-dnd5e-web#605).
 *
 * This is the far side of the event boundary — it stands in for what the
 * toolkit will own. Nothing in the consumer half may import it, which
 * `boundary.test.ts` enforces.
 *
 * Layout is a two-room crypt on an axial grid, where `at(q, r)` maps to cube
 * coordinates satisfying x + y + z === 0:
 *
 *      Room A            door           Room B
 *   q = 0 1 2            q = 3          q = 4 5 6
 *   r = 0..2                r = 1          r = 0..2
 *
 * Only (3,1) connects them. That single opening is the point of the fixture:
 * with the door open the viewer sees a narrow shaft into Room B rather than
 * the whole room, so things can cross their sightline and leave it again.
 */

import type { PositionLike } from '../events';

export const WALL_SOLID = 1;
export const DOOR_CLOSED = 2;
export const DOOR_OPEN = 3;

/** Axial (q, r) to cube. */
export const at = (q: number, r: number): PositionLike => ({
  x: q,
  y: r,
  z: -q - r,
});

export const key = (p: PositionLike): string => `${p.x},${p.y},${p.z}`;

/** The six cube-coordinate neighbour deltas for this convention. */
export const NEIGHBOURS: PositionLike[] = [
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 0, y: -1, z: 1 },
  { x: 1, y: -1, z: 0 },
  { x: -1, y: 1, z: 0 },
];

export const step = (p: PositionLike, d: PositionLike): PositionLike => ({
  x: p.x + d.x,
  y: p.y + d.y,
  z: p.z + d.z,
});

export interface WorldEntity {
  entityId: string;
  name: string;
  type: 'player' | 'monster' | 'obstacle';
  monsterRefId?: string;
  classRefId?: string;
}

export interface WorldHex {
  position: PositionLike;
  terrain: number;
  zoneId: string;
}

export interface World {
  hexes: Map<string, WorldHex>;
  /** Door hex key -> current kind (DOOR_CLOSED | DOOR_OPEN). A closed door
   * blocks sight through its hex; the door itself remains visible. */
  doors: Map<string, number>;
  /** The hex a door opens onto, for the `Wall.to` passage neighbour. */
  doorPassage: Map<string, PositionLike>;
  entities: Map<string, WorldEntity>;
  /** entityId -> where it stands and which way it faces. */
  placements: Map<string, { hex: PositionLike; facing: number }>;
}

const rect = (
  qMin: number,
  qMax: number,
  rMin: number,
  rMax: number,
  zoneId: string
): WorldHex[] => {
  const out: WorldHex[] = [];
  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      out.push({ position: at(q, r), terrain: 0, zoneId });
    }
  }
  return out;
};

export function twoRoomCrypt(): World {
  const hexes = new Map<string, WorldHex>();
  for (const hex of [
    ...rect(0, 2, 0, 2, 'room-a'),
    // The doorway cell belongs to NEITHER chamber, matching the wire
    // contract (see dungeonMapGeometry's door tests). An empty zoneId keeps
    // regionInputsFromHexes from turning it into a one-hex room with walls
    // all the way around it.
    { position: at(3, 1), terrain: 0, zoneId: '' },
    ...rect(4, 6, 0, 2, 'room-b'),
  ]) {
    hexes.set(key(hex.position), hex);
  }

  return {
    hexes,
    doors: new Map([[key(at(3, 1)), DOOR_CLOSED]]),
    doorPassage: new Map([[key(at(3, 1)), at(4, 1)]]),
    entities: new Map([
      [
        'goblin-1',
        {
          entityId: 'goblin-1',
          name: 'Goblin',
          type: 'monster',
          monsterRefId: 'goblin',
        },
      ],
    ]),
    // The goblin starts in Room B, out of sight behind a closed door.
    placements: new Map([['goblin-1', { hex: at(5, 0), facing: 0 }]]),
  };
}

export const VIEWER_START = at(0, 1);
