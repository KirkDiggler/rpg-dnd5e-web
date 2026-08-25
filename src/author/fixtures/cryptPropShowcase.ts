import type { DungeonDoc } from '../dungeonYaml';
import { fromOffset } from '../hexOffset';

export function cryptPropShowcaseDoc(): DungeonDoc {
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);
  const cells = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 12 }, (_, col) => p(col, row))
  ).flat();

  return {
    version: 2,
    key: 'crypt-prop-showcase',
    name: 'Crypt Prop Showcase',
    orientation: 'pointy',
    void: 'opaque',
    regions: [
      {
        id: 'gallery',
        name: 'Gallery',
        archetype: 'crypt',
        lighting: { intensity: 0.4 },
        cells,
      },
    ],
    start: p(1, 3),
    walls: [],
    doors: [],
    place: [
      {
        ref: 'dnd5e:props:skeleton-cage',
        at: p(3, 2),
        blocksMovement: true,
        blocksLos: true,
        facing: 'se',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:skeleton-table',
        at: p(6, 4),
        blocksMovement: true,
        blocksLos: false,
        facing: 'e',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:rug',
        at: p(9, 3),
        blocksMovement: false,
        blocksLos: false,
        facing: 'e',
        offset: [0, 0],
      },
    ],
  };
}
