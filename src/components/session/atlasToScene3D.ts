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
 * Atlas props keep the wire's reference, converted cell, and authored
 * `facing`/`offset` here (rpg-project#261) — verbatim words/fractions, no
 * angle math. The renderer resolves the reference through the asset
 * manifest and derives yaw itself (`facingYaw.ts`); this adapter never
 * derives collision, line-of-sight, or render-angle behavior from asset
 * metadata.
 *
 * # Walls live in atlasWallRuns.ts, not here
 *
 * The floor tiles this file builds are per-hex (`SyntyHexFloor` renders
 * one tile per cell either way). Walls are not: a wall is the line its
 * author drew, and the wire carries it as an `AtlasSegment`.
 * `buildScene3D` composes that separate module's output
 * (`segmentsToWallRuns`) with this file's own floor tiles into one
 * `Scene3D`. `boundaries` and `doorways` stay the mechanical truth and
 * are not read here; `segments` is what gets drawn.
 *
 * # Sealed cells are floor
 *
 * A cell a wall seals keeps its region and stays in `cells`, so it tiles
 * as floor like any other — it is floor nobody stands on, and refusing a
 * step onto it is the engine's job, not the renderer's. The same is true
 * of the footing cells a presented wall puts in the recipient's atlas
 * (design C18): they arrive in `cells` and tile.
 */

import {
  coordToKey,
  cubeToWorld,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { cellBoundingBox } from '../../author/hexGeometry';
import {
  layoutFromWire,
  type HexLayout,
} from '../../concepts/session-tomb/atlas';
import {
  buildDungeonLightingFacts,
  type DungeonLightingFacts,
  type DungeonLightingRegionInput,
  type DungeonLightingSourceInput,
} from '../../rendering/dungeonLighting';
import {
  segmentsToWallRuns,
  type AuthoredWallRun,
  type DoorGapPiece,
} from './atlasWallRuns';
import { positionToCube, worldPositionOf } from './positionBridge';

export { positionToCube, worldPositionOf };

export interface SceneProp3D {
  ref: string;
  /** The cell it stands on — mechanics stay cell-scoped (design's
   * "presentation never decides mechanics" law): this is the position
   * movement/LOS reason about, unaffected by `offset`. */
  position: CubeCoord;
  /** The authored facing word, verbatim off the wire (`''` = none, the
   * asset's own default orientation) — rpg-project#261. Yaw derivation
   * is the renderer's job (`facingYaw.ts`'s `facingToYaw`), not this
   * adapter's; the wire carries the word, never an angle. */
  facing: string;
  /** The authored visual displacement, verbatim off the wire: `x`/`y`
   * the within-cell nudge, `z` the height above the floor
   * (rpg-project#272 — same cell-size unit, its own wider [0,3] range,
   * not the planar ±0.5 clamp). The zero value and "not authored"
   * render identically, by design. VISUAL ONLY; never read by anything
   * that computes rules. */
  offset: { x: number; y: number; z: number };
}

/**
 * A prop's actual render position: its cell centre plus its authored
 * `offset`.
 *
 * # The planar offset is BOUNDING-BOX FRACTIONS
 *
 * `x` is measured in cell WIDTHS and `y` in cell HEIGHTS — design §1.11's
 * one offset unit, shared with a wall position and a door position, so
 * the whole file speaks one language about where inside a cell something
 * sits. It used to be circumradii, which meant `[0.5, 0]` put a prop
 * halfway to a VERTEX — inside the hex, nowhere in particular. In
 * bounding-box fractions the same `[0.5, 0]` puts it exactly on the side
 * midpoint: `0.5 × √3·hexSize` is the inradius. The content that would
 * have needed converting is being recreated in the same wave.
 *
 * `z` is unchanged: it is the height above the floor, not a planar
 * nudge, and keeps its own cell-size unit and its own [0,3] range
 * (rpg-project#272).
 *
 * ONE place, so `DungeonPreview3D`'s prop path and the game route's
 * (`SessionCanvas`) can never disagree — the same symmetric-bug
 * discipline `hexOffset.ts` names.
 */
export function propWorldPosition(
  prop: Pick<SceneProp3D, 'position' | 'offset'>,
  hexSize: number
): WorldPos & { y: number } {
  const center = cubeToWorld(prop.position, hexSize);
  const { width, height } = cellBoundingBox('pointy', hexSize);
  return {
    x: center.x + prop.offset.x * width,
    y: prop.offset.z * hexSize,
    z: center.z + prop.offset.y * height,
  };
}

export interface Scene3D {
  floorTiles: Map<string, AbsoluteFloorTile>;
  props: SceneProp3D[];
  archetypes: readonly string[];
  lighting: DungeonLightingFacts;
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
  atlas: Pick<
    GetAtlasResponse,
    'cells' | 'props' | 'segments' | 'doorways' | 'regions'
  >,
  hexSize: number,
  layout: HexLayout
): Scene3D {
  if (layout !== 'pointy') {
    throw new Error(
      `buildScene3D: hexMath.ts places pointy-top hexes only; got "${layout}" (rpg-dnd5e-web#763)`
    );
  }
  const archetypes = Object.freeze(
    atlas.regions.map((region) => region.archetype)
  );
  const floorTiles = new Map<string, AbsoluteFloorTile>();
  for (const cell of atlas.cells) {
    const cube = positionToCube(cell);
    floorTiles.set(coordToKey(cube), { ...cube, roomId: '' });
  }

  const props: SceneProp3D[] = [];
  const lightingSources: DungeonLightingSourceInput[] = [];
  for (const [propIndex, prop] of atlas.props.entries()) {
    if (!prop.at) continue;
    // `?? ''` / `?? 0`: an older server or a stale client-side proto
    // schema (the exact live-walk failure this guards, rpg-project#261
    // PR #795 field report) hands back an AtlasProp with facing/
    // offsetX/offsetY entirely ABSENT, not merely empty/zero — a plain
    // `prop.facing`/`prop.offsetX` read is then `undefined`, which
    // silently turns into NaN world coordinates in `propWorldPosition`
    // and Three.js renders a NaN-positioned mesh as NOTHING, not even
    // the placeholder. Coercing here, at construction, means every
    // OTHER `SceneProp3D` consumer can assume it is always well-formed
    // — "said nothing" and "said zero/center" render identically by
    // design (the design doc's own words), and a schema skew degrades
    // to that same "unfaced, centered" default instead of vanishing.
    const sceneProp = {
      ref: prop.ref,
      position: positionToCube(prop.at),
      facing: prop.facing ?? '',
      offset: {
        x: prop.offsetX ?? 0,
        y: prop.offsetY ?? 0,
        z: prop.offsetZ ?? 0,
      },
    };
    props.push(sceneProp);
    const cellKey = coordToKey(sceneProp.position);
    const groundedPosition = propWorldPosition(sceneProp, hexSize);
    lightingSources.push({
      key: `${prop.ref}|${cellKey}|${propIndex}`,
      ref: prop.ref,
      cellKey,
      groundedPosition: [
        groundedPosition.x,
        groundedPosition.y,
        groundedPosition.z,
      ],
    });
  }

  const lightingRegions: DungeonLightingRegionInput[] = atlas.regions.map(
    (region) => ({
      id: region.id,
      archetype: region.archetype,
      intensity: region.lighting?.intensity ?? Number.NaN,
      cellKeys: (region.cells ?? []).map((cell) =>
        coordToKey(positionToCube(cell))
      ),
    })
  );
  const lighting = buildDungeonLightingFacts(
    [...floorTiles.keys()],
    lightingRegions,
    lightingSources
  );
  const { wallRuns, doorGaps } = segmentsToWallRuns(atlas, hexSize);

  return { floorTiles, props, archetypes, lighting, wallRuns, doorGaps };
}
