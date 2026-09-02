import type { CornerRef } from '../creation/hexCorner';
import { tautPath } from '../creation/wallGesture';
import type { DungeonDoc } from '../dungeonYaml';
import { edgeKey, fromOffset, type Edge } from '../hexOffset';

export function cryptPropShowcaseDoc(): DungeonDoc {
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);
  const regionCells = (start: number, end: number) =>
    Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: end - start + 1 }, (_, index) =>
        p(start + index, row)
      )
    ).flat();
  const corner = (col: number, row: number, index: number): CornerRef => ({
    cell: p(col, row),
    corner: index,
  });
  const junction = corner(10, 5, 0);
  const longLeft = tautPath(corner(2, 5, 0), junction, 1, 'pointy');
  const longRight = tautPath(junction, corner(18, 5, 0), 1, 'pointy');
  const raisedBranch = tautPath(junction, corner(10, 2, 3), 1, 'pointy');
  const cornerTurn = tautPath(corner(18, 5, 0), corner(18, 9, 3), 1, 'pointy');
  const doorEdge = longLeft[Math.floor(longLeft.length / 2)]!;
  const doorKey = edgeKey(doorEdge);
  const uniqueEdges = new Map<string, Edge>();
  for (const edge of [
    ...longLeft,
    ...longRight,
    ...raisedBranch,
    ...cornerTurn,
  ]) {
    if (edgeKey(edge) !== doorKey) uniqueEdges.set(edgeKey(edge), edge);
  }
  const walls = [...uniqueEdges.values()].map((edge) => ({
    edge,
    ...(raisedBranch.some((candidate) => edgeKey(candidate) === edgeKey(edge))
      ? { height: 2 }
      : {}),
  }));

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
        cells: regionCells(0, 9),
      },
      {
        id: 'chapel',
        name: 'Chapel',
        archetype: 'crypt',
        lighting: { intensity: 0.3 },
        cells: regionCells(10, 19),
      },
    ],
    start: p(1, 3),
    walls,
    doors: [
      {
        id: 'crypt-sealed-gate',
        edges: [doorEdge],
        locked: [{ ability: 'dex', dc: 15 }],
      },
    ],
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
