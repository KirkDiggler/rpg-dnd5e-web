import { fixtureAtlasOf } from '@/author/fixtures/fixtureAtlas';
import { referenceTombDoc } from '@/author/fixtures/referenceTomb';
import { fromOffset } from '@/author/hexOffset';
import { HEX_SIZE, type CubeCoord } from '@/components/hex-grid/hexMath';
import { buildAtlasPathIndex } from '@/components/session/atlasPath';
import {
  buildScene3D,
  resolveSceneLayout,
} from '@/components/session/atlasToScene3D';
import type { SightedMember } from '@/components/session/sightingEntities';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

const doc = referenceTombDoc();
const atlas = fixtureAtlasOf(doc);
const layout = resolveSceneLayout(atlas);

if (!layout.ok) {
  throw new Error(`Session combat fixture is not drawable: ${layout.message}`);
}

const at = (column: number, row: number): CubeCoord => {
  const axial = fromOffset('pointy', [column, row]);
  return { x: axial.q, y: -axial.q - axial.r, z: axial.r };
};

/**
 * The concept draws the existing 224-cell reference tomb through the same
 * construction path and SessionCanvas used by the real session route. Only
 * the encounter members are fixture data: the atlas, wall runs, door gaps,
 * props, floor renderer, camera controls, and entity renderers are production
 * components.
 */
export const SESSION_COMBAT_MAP_FIXTURE = Object.freeze({
  atlas,
  scene: buildScene3D(atlas, HEX_SIZE, layout.layout),
  pathIndex: buildAtlasPathIndex(atlas),
  playerPosition: at(9, 4),
  members: Object.freeze<SightedMember[]>([
    {
      subject: 'mira',
      name: 'Mira',
      kind: MemberKind.PLAYER,
      monsterRefId: undefined,
      position: at(8, 5),
      remembered: false,
      standing: Standing.UP,
    },
    {
      subject: 'skeleton-guard',
      name: 'Skeleton Guard',
      kind: MemberKind.MONSTER,
      monsterRefId: 'skeleton',
      position: at(10, 4),
      remembered: false,
      standing: Standing.UP,
    },
    {
      subject: 'skeleton-archer',
      name: 'Skeleton Archer',
      kind: MemberKind.MONSTER,
      monsterRefId: 'skeleton-archer',
      position: at(13, 3),
      remembered: false,
      standing: Standing.UP,
    },
  ]),
});
