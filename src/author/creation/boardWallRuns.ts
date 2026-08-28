/**
 * boardWallRuns — the 2D canvas's picture of EXISTING walls and doors as
 * the SAME straight runs the 3D preview and game route render
 * (rpg-dnd5e-web#800). Kirk's walk: "in the previous dungeon builder we
 * drew the straight walls and it was clear how they would show in 3D;
 * with the follow-the-hexes it seems we need to do some guessing." The
 * 2D board drew each authored wall as its literal hex-edge zigzag while
 * 3D straightened the same file into runs — so the author authored
 * blind. This module makes the board draw what 3D will draw.
 *
 * # One geometry source, two projections — NEVER re-derived
 *
 * The run geometry comes from `atlasWallRuns.boundariesToWallRuns`, the
 * exact module `buildScene3D` composes for the 3D preview and the game
 * route (axis-true by authored-pair declaration, corner closure, door
 * gaps — see its own module doc for every ruling it encodes). This file
 * contains ZERO run math: it maps the authored document into the
 * atlas-shaped input that module already takes, calls it at the game's
 * own `HEX_SIZE`, and projects the world-space result into SVG user
 * space. The symmetric-bug rule (rpg-toolkit#1150, rpg-dnd5e-web#1141):
 * mirrored math drifts and round-trips can't see it; a shared module
 * cannot disagree with itself.
 *
 * # Why the input is built locally, not read off the server compile
 *
 * `usePutDungeonPreview` debounces 400ms and then round-trips
 * `PutDungeon{validate_only}` — fine for the 3D tab, too slow for a
 * board that must repaint the wall the author JUST clicked.
 * `docAtlasFacts` is a pure MAPPING (cells = the regions' union,
 * boundaries = `doc.walls`, doorways = the doors' edges — the same
 * plain facts `fixtureAtlasOf` mirrors and the server's compile
 * projects), so the board's runs are current on every click and
 * bit-identical to what the 3D preview derives for the same document
 * (pinned by `boardWallRuns.test.ts`'s reference-tomb golden).
 *
 * # The projection is a pure scale, proven not assumed
 *
 * `canvasGeometry.ts` places the board's pointy-top cells with
 * `hexCenter` — the SAME standard axial formulas `cubeToWorld` uses
 * (x = size·√3·(q + r/2); y/z = size·3/2·r), just in SVG user space
 * (y-down) at `BOARD_HEX_SIZE` instead of world space at `HEX_SIZE`.
 * So world → SVG is exactly: scale both components by
 * `boardHexSize / worldHexSize`, world z becomes SVG y. That identity
 * is pinned by a pixel-formula test (exact numbers for known inputs,
 * not a round-trip — the repo's symmetric-bug lesson, twice learned),
 * not trusted from this comment.
 *
 * # Pointy-top only, mirroring 3D by name
 *
 * `hexMath.ts` places pointy-top only (rpg-dnd5e-web#763) and
 * `buildScene3D` throws on flat-top rather than draw the rotated
 * picture. A flat-top document therefore keeps the board's literal
 * hex-edge drawing — that IS the honest picture while 3D cannot render
 * it at all; straightening it here would invent geometry no other view
 * has. `boardWallScene` returns null and the board falls back.
 */
import {
  cubeToWorld,
  HEX_SIZE,
  hexEdgeBetween,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { boundariesToWallRuns } from '@/components/session/atlasWallRuns';
import { positionToCube } from '@/components/session/positionBridge';
import { vertexKey } from '@/hooks/authoredWallRuns';
import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Point } from '../../concepts/session-tomb/atlas';
import type { DungeonDoc } from '../dungeonYaml';
import { compareAxial, type Axial, type Edge } from '../hexOffset';

// cubeToWorld is re-exported so the test can pin the projection identity
// against the exact function the shared module places with.
export { cubeToWorld, HEX_SIZE };

/**
 * World (x, z) → SVG user space (x, y): ONE exported projection, used
 * for every run endpoint and door gap the board draws, so the board and
 * the 3D scene can never disagree about where a shared point lands.
 * For pointy-top the board's `hexCenter` and 3D's `cubeToWorld` are the
 * same axial formulas at different sizes, so this is a pure scale with
 * world z mapped to SVG y (both "down"): no rotation, no offset — see
 * this module's header doc, and the pixel-formula test that pins it.
 */
export function worldToBoard(
  world: WorldPos,
  worldHexSize: number,
  boardHexSize: number
): Point {
  const scale = boardHexSize / worldHexSize;
  return { x: world.x * scale, y: world.z * scale };
}

/** One straight wall run in SVG user space, keyed by the shared
 * module's own stable run key — and carrying the document edges it was
 * derived from (rpg-dnd5e-web#804), so a rendered run can answer "which
 * doc edges am I" for hit-testing, selection, and the gesture's
 * endpoint handles. Presentation metadata threaded ADDITIVELY on the
 * board side only: the shared 3D module's geometry is untouched; the
 * mapping rides the run's own `key`, which is the ';'-join of one token
 * per constituent edge (`vertexKey(a)|vertexKey(b)` from
 * `hexEdgeBetween` — see `edgeFitDataByToken`'s doc comment in
 * atlasWallRuns.ts for why that token is bit-identical when recomputed
 * here from the same cell pair). */
export interface BoardWallRun {
  key: string;
  a: Point;
  b: Point;
  edges: Edge[];
  /** The run's authored height multiplier, from the shared engine —
   * 0 = standard. The 2D board stays schematic about it (a label, not
   * scaled geometry — the design's own "Not now" line). */
  height: number;
}

/** One door, drawn IN its run's gap (aligned to the straightened run,
 * not the raw hex edge), still carrying its document identity so the
 * board can style it (locked/closed/selected) and overlay errors on
 * the authored edge it toggles. */
export interface BoardDoorRun {
  doorId: string;
  edge: Edge;
  a: Point;
  b: Point;
}

export interface BoardWallScene {
  runs: BoardWallRun[];
  doors: BoardDoorRun[];
}

const pos = (a: Axial) => ({ x: a.q, y: a.r });

/**
 * The atlas-shaped plain facts `boundariesToWallRuns` consumes, mapped
 * straight from the document — mapping ONLY, zero geometry: cells are
 * the regions' union (the compiled atlas's own definition), boundaries
 * are the declared walls, doorways are the doors' edges. The same
 * shapes `fixtureAtlasOf` mirrors for the sandbox and the server's
 * compile projects for real, positions as wire axial (x = q, y = r).
 * Also returns the doorways' document identities, index-aligned with
 * the doorways array (and therefore with `boundariesToWallRuns`'s
 * `doorGaps`, which processes every doorway once, in order).
 */
export function docAtlasFacts(doc: DungeonDoc): {
  facts: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>;
  doorSources: { doorId: string; edge: Edge }[];
  /** Run-key token (one per non-door edge, exactly as the chaining
   * engine builds them into each run's `key`) → the document edge it
   * came from — how `boardWallScene` threads each run's source edges
   * through (#804). */
  wallSourcesByToken: Map<string, Edge>;
} {
  const doorSources = doc.doors.flatMap((d) =>
    d.edges.map((edge) => ({ doorId: d.id, edge }))
  );
  const wallSourcesByToken = new Map<string, Edge>();
  for (const { edge } of doc.walls) {
    const { a, b } = hexEdgeBetween(
      positionToCube({ x: edge[0].q, y: edge[0].r } as never),
      positionToCube({ x: edge[1].q, y: edge[1].r } as never),
      HEX_SIZE
    );
    wallSourcesByToken.set(`${vertexKey(a)}|${vertexKey(b)}`, edge);
  }
  const facts = create(GetAtlasResponseSchema, {
    cells: doc.regions
      .flatMap((r) => r.cells)
      .sort(compareAxial)
      .map(pos),
    boundaries: doc.walls.map(({ edge: [a, b], height }) => ({
      from: pos(a),
      to: pos(b),
      blocksMovement: true,
      blocksLineOfSight: true,
      // The authored multiplier, or 0 = not authored = standard — the
      // SAME wire contract the server's atlas carries, so the shared
      // engine sees one dialect from both producers (rpg-project#273).
      height: height ?? 0,
    })),
    doorways: doorSources.map(({ doorId, edge: [a, b] }) => ({
      connection: `${doc.key}/${doorId}`,
      from: pos(a),
      to: pos(b),
    })),
  });
  return { facts, doorSources, wallSourcesByToken };
}

/**
 * The straightened wall/door picture for the board, or null for a
 * flat-top document (the board keeps its literal edge drawing — see
 * this module's header doc). Runs are computed at the game's own
 * `HEX_SIZE` — the calibrated door-frame width and corner-overlap
 * margin inside the shared module are world-unit constants sized for
 * it — then projected, so gaps and overlaps land at exactly the
 * proportions 3D will show.
 */
export function boardWallScene(
  doc: DungeonDoc,
  boardHexSize: number
): BoardWallScene | null {
  if (doc.orientation !== 'pointy') return null;
  const { facts, doorSources, wallSourcesByToken } = docAtlasFacts(doc);
  const { wallRuns, doorGaps } = boundariesToWallRuns(facts, HEX_SIZE);
  const project = (w: WorldPos) => worldToBoard(w, HEX_SIZE, boardHexSize);
  const runs: BoardWallRun[] = wallRuns.map((r) => ({
    key: r.key,
    a: project(r.start),
    b: project(r.end),
    height: r.height,
    // Every token in a run's key is one constituent non-door edge; a
    // missing lookup is never expected (every boundary fed to the
    // engine came from doc.walls above) and is dropped rather than
    // invented.
    edges: r.key
      .split(';')
      .map((token) => wallSourcesByToken.get(token))
      .filter((e): e is Edge => e !== undefined),
  }));
  const doors: BoardDoorRun[] = [];
  doorGaps.forEach((gap, i) => {
    const source = doorSources[i];
    if (!source) return; // never expected: doorGaps is one per doorway, in order
    // The gap runs leafPosition → its mirror across the gap's center
    // (DoorGapPiece carries the center and ONE end; the other end is
    // the reflection, by the gap's own construction).
    const far: WorldPos = {
      x: 2 * gap.position.x - gap.leafPosition.x,
      z: 2 * gap.position.z - gap.leafPosition.z,
    };
    doors.push({
      doorId: source.doorId,
      edge: source.edge,
      a: project(gap.leafPosition),
      b: project(far),
    });
  });
  return { runs, doors };
}
