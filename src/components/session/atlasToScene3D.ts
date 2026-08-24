/**
 * atlasToScene3D — turns a `GetAtlasResponse` (dnd5e.api.session.v1alpha1)
 * into what the 3D game route's leaf renderers need, and nothing else.
 *
 * This is the 3D twin of `src/concepts/session-tomb/atlas.ts`, which does
 * the same job for the flat SVG concept page. The two are deliberately
 * separate files rather than one shared module: atlas.ts's `Point`/
 * `hexCenter` live in SVG user space (arbitrary `size`, y-down), while this
 * file targets `hexMath.ts`'s Three.js world space (`HEX_SIZE = 1.0`
 * world units, y-up, z-down-screen) via `cubeToWorld`/`hexEdgeBetween`.
 * Sharing one geometry module across both would mean one of them
 * secretly adopting the other's convention.
 *
 * # The axial -> cube bridge
 *
 * The wire's `Position` is axial (q, r) (session v0.20.0, ADR-0040 — see
 * atlas.ts's own doc comment on `HexLayout` for the full history of why
 * that needed saying twice). `hexMath.ts`'s `CubeCoord` is cube (x, y, z)
 * with x + y + z = 0, and — since rpg-toolkit#1150's axial-basis fix —
 * `cubeToWorld`'s cube.x IS the wire's q and cube.z IS the wire's r: no
 * swap, no rotation, just the derived third coordinate. `positionToCube`
 * (in `positionBridge.ts`, re-exported here unchanged for every existing
 * caller) is that bridge, kept in exactly one place so no caller re-derives
 * it (and risks re-deriving it wrong — rpg-toolkit#1150's own postmortem is
 * that a swapped-both-ways conversion passes every round-trip test and is
 * only caught by actually drawing the shape).
 *
 * # Props stay opaque
 *
 * Atlas props keep only the wire's reference and converted cell here. The
 * renderer resolves that reference through the asset manifest; this adapter
 * never derives collision or line-of-sight behavior from asset metadata.
 *
 * # Walls live in atlasWallRuns.ts, not here
 *
 * The floor tiles this file builds are per-hex (`SyntyHexFloor` renders
 * one tile per cell either way). Walls are not: Kirk's ruling on PR #762's
 * live review was that the game's walls should stay STRAIGHT modular runs
 * (the presentation `WallRunMesh`/`wallRuns.ts` already established for
 * the old route), not a piece per declared boundary edge. `buildScene3D`
 * composes that separate module's output (`boundariesToWallRuns`) with
 * this file's own floor tiles into one `Scene3D` — see atlasWallRuns.ts's
 * own module doc comment for the wall geometry itself, including why the
 * atlas's declared boundaries and cell mask remain the sole AUTHORITY
 * even though the PRESENTATION is now straight runs.
 */

import { coordToKey, type CubeCoord } from '@/components/hex-grid/hexMath';
import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  layoutFromWire,
  type HexLayout,
} from '../../concepts/session-tomb/atlas';
import { boundariesToWallRuns, type DoorGapPiece } from './atlasWallRuns';
import { positionToCube, worldPositionOf } from './positionBridge';

export { positionToCube, worldPositionOf };

export interface SceneProp3D {
  ref: string;
  position: CubeCoord;
}

export interface Scene3D {
  floorTiles: Map<string, AbsoluteFloorTile>;
  props: SceneProp3D[];
  wallRuns: AuthoredWallRun[];
  doorGaps: DoorGapPiece[];
}

export type SceneLayoutOutcome =
  | { ok: true; layout: HexLayout }
  | { ok: false; message: string };

/**
 * Reads the wire's own answer for which way the hexes point and gates on
 * it — never guesses (`layoutFromWire`'s own contract: capabilities are
 * supplied, never defaulted). `hexMath.ts`'s 3D placement math is
 * pointy-top only today, so a flat-top or square atlas is reported as a
 * visible, named limitation rather than drawn wrong or silently dropped.
 * ONE gate, shared by the game route (`SessionEncounterView`) and the
 * builder's preview (`DungeonPreview3D`) so the two can never disagree
 * about what is drawable.
 */
export function resolveSceneLayout(
  atlas: Pick<GetAtlasResponse, 'layout' | 'grid'>
): SceneLayoutOutcome {
  let resolved: HexLayout | null;
  try {
    resolved = layoutFromWire(atlas.layout, atlas.grid);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (resolved === 'pointy') {
    return { ok: true, layout: 'pointy' };
  }
  if (resolved === 'flat') {
    return {
      ok: false,
      message:
        'This map is flat-top hex — the 3D renderer only draws ' +
        'pointy-top today (hexMath.ts is pointy-top only; tracked as ' +
        'rpg-dnd5e-web#763), not silently guessed.',
    };
  }
  return {
    ok: false,
    message:
      'This map is a square grid — the 3D renderer only draws hex maps today.',
  };
}

/**
 * buildScene3D lays out the whole atlas once, in hexMath's world-space
 * cube coordinates: per-cell floor tiles and opaque prop references, plus
 * the straight wall runs derived from the declared boundaries and floor mask
 * by `atlasWallRuns.boundariesToWallRuns`.
 *
 * `layout` is the RESOLVED render word (`resolveSceneLayout`), passed
 * explicitly rather than read off the atlas here so a caller cannot
 * build a scene without having gated on it. `hexMath.ts` places pointy-top
 * only (rpg-dnd5e-web#763); asking for `flat` throws by name rather than
 * drawing the rotated picture ADR-0040 warns about.
 */
export function buildScene3D(
  atlas: Pick<GetAtlasResponse, 'cells' | 'props' | 'boundaries' | 'doorways'>,
  hexSize: number,
  layout: HexLayout
): Scene3D {
  if (layout !== 'pointy') {
    throw new Error(
      `buildScene3D: hexMath.ts places pointy-top hexes only; got "${layout}" (rpg-dnd5e-web#763)`
    );
  }
  const floorTiles = new Map<string, AbsoluteFloorTile>();
  for (const cell of atlas.cells) {
    const cube = positionToCube(cell);
    floorTiles.set(coordToKey(cube), { ...cube, roomId: '' });
  }

  const props: SceneProp3D[] = [];
  for (const prop of atlas.props) {
    if (!prop.at) continue;
    props.push({ ref: prop.ref, position: positionToCube(prop.at) });
  }

  const { wallRuns, doorGaps } = boundariesToWallRuns(atlas, hexSize);

  return { floorTiles, props, wallRuns, doorGaps };
}
