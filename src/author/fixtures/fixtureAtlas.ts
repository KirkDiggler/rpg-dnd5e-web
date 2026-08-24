/**
 * fixtureAtlasOf — a `GetAtlasResponse` shaped from a document, for the
 * two places that must work without a server: the Concepts Lab sandbox
 * and the preview tests. It is NOT a compiler and proves nothing about
 * the real atlas — the real one comes from `PutDungeon` (the server's
 * projection, the game's own message). It mirrors the wire's plain
 * facts only: cells = the regions' union; boundaries = the declared
 * walls (the void envelope is implied, never listed); doorways = door
 * edges; props = non-monster placements; regions as authored.
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
import { isMonsterRef, type DungeonDoc } from '../dungeonYaml';
import { compareAxial, type Axial } from '../hexOffset';

const pos = (a: Axial) => ({ x: a.q, y: a.r });

export function fixtureAtlasOf(doc: DungeonDoc): GetAtlasResponse {
  const cells = doc.regions
    .flatMap((r) => r.cells)
    .sort(compareAxial)
    .map(pos);
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
      })),
    boundaries: doc.walls.map(([a, b]) => ({
      from: pos(a),
      to: pos(b),
      blocksMovement: true,
      blocksLineOfSight: true,
    })),
    doorways: doc.doors.flatMap((d) =>
      d.edges.map(([a, b]) => ({
        connection: `${doc.key}/${d.id}`,
        from: pos(a),
        to: pos(b),
      }))
    ),
    regions: doc.regions.map((r) => ({
      id: r.id,
      name: r.name,
      cells: [...r.cells].sort(compareAxial).map(pos),
      archetype: r.archetype,
      lighting: { intensity: r.lighting.intensity },
    })),
  });
}
