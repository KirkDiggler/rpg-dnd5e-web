/**
 * fixtureAtlasOf — a `GetAtlasResponse` shaped from a document, for the
 * two places that must work without a server: the Concepts Lab sandbox
 * and the preview tests. It is NOT a compiler and proves nothing about
 * the real atlas — the real one comes from `PutDungeon` (the server's
 * projection, the game's own message). It mirrors the wire's plain
 * facts only: cells = ALL FLOOR (the regions' union plus `scenery`,
 * since on the wire "a cell in `cells` and in no region is scenery" —
 * design §5.1, rpg-project#360); boundaries = the declared walls (the
 * void envelope is implied, never listed); doorways = door edges;
 * props = non-monster placements; regions as authored.
 */
import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  GridKind,
  HexLayout,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  doorCrossing,
  isMonsterRef,
  sealedKeys,
  wallCrossingKeys,
  wallLattice,
  type DungeonDoc,
} from '../dungeonYaml';
import { latticeAxial, wallCrossings } from '../hexGeometry';
import { compareAxial, edgeKey, parseAxialKey, type Axial } from '../hexOffset';

const pos = (a: Axial) => ({ x: a.q, y: a.r });

export function fixtureAtlasOf(doc: DungeonDoc): GetAtlasResponse {
  const cells = [...doc.regions.flatMap((r) => r.cells), ...doc.scenery]
    .sort(compareAxial)
    .map(pos);
  const doorKeys = new Set(
    doc.doors.flatMap((d) => {
      const crossing = doorCrossing(doc, d);
      return crossing ? [edgeKey(crossing)] : [];
    })
  );
  // A boundary's height is the height of the wall that blocks it. Two
  // walls crossing the same step is not a shape the picker can author,
  // so the first one to claim it keeps it.
  const heightByCrossing = new Map<string, number>();
  for (const wall of doc.walls) {
    if (wall.height === undefined) continue;
    const { a, b } = wallLattice(doc.orientation, wall);
    for (const edge of wallCrossings(doc.orientation, a, b)) {
      const key = edgeKey(edge);
      if (!heightByCrossing.has(key)) heightByCrossing.set(key, wall.height);
    }
  }
  return create(GetAtlasResponseSchema, {
    grid: GridKind.HEX,
    layout:
      doc.orientation === 'flat' ? HexLayout.FLAT_TOP : HexLayout.POINTY_TOP,
    cells,
    props: doc.place
      .filter((p) => !isMonsterRef(p.ref))
      .map((p) => ({
        ref: p.ref,
        at: pos(p.at),
        blocksMovement: !!p.blocksMovement,
        blocksLineOfSight: !!p.blocksLos,
        facing: p.facing ?? '',
        offsetX: p.offset?.[0] ?? 0,
        offsetY: p.offset?.[1] ?? 0,
        offsetZ: p.offset?.[2] ?? 0,
      })),
    // MECHANICS ARE STILL PAIRS on the wire (design §5.2: "boundaries
    // and doorways are unchanged and remain the mechanical truth").
    // What changed is that they are DERIVED from the wall's line here
    // rather than listed in the file, and a door's own crossing is
    // handed back to the door.
    boundaries: [...wallCrossingKeys(doc)]
      .filter((key) => !doorKeys.has(key))
      .map((key) => {
        const [a, b] = key.split('|').map(parseAxialKey);
        return {
          from: pos(a),
          to: pos(b),
          blocksMovement: true,
          blocksLineOfSight: true,
          height: heightByCrossing.get(key) ?? 0,
        };
      }),
    // PRESENTATION: what the client draws instead of fitting a chain.
    // One segment per authored wall, its ends in the atlas's own
    // fractional axial frame.
    segments: doc.walls.map((wall) => {
      const { a, b } = wallLattice(doc.orientation, wall);
      return {
        from: latticeAxial(doc.orientation, a),
        to: latticeAxial(doc.orientation, b),
        height: wall.height ?? 0,
      };
    }),
    // Every cell in this atlas nobody can stand on. Region membership no
    // longer implies standable, so the client is told rather than left
    // to derive it.
    sealed: [...sealedKeys(doc)].map((key) => pos(parseAxialKey(key))),
    doorways: doc.doors.flatMap((d) => {
      const crossing = doorCrossing(doc, d);
      return crossing
        ? [
            {
              connection: `${doc.key}/${d.id}`,
              from: pos(crossing[0]),
              to: pos(crossing[1]),
            },
          ]
        : [];
    }),
    regions: doc.regions.map((r) => ({
      id: r.id,
      name: r.name,
      cells: [...r.cells].sort(compareAxial).map(pos),
      archetype: r.archetype,
      lighting: { intensity: r.lighting.intensity },
    })),
  });
}
