/**
 * atlasWallRuns — turns the session wire's DECLARED interior boundaries
 * and doorways into straight wall RUNS, by chaining the AUTHORED edges
 * themselves (rpg-dnd5e-web#787) — not by reconstructing "chamber"
 * geometry the wire never declares, and NOT by inventing a wall at the
 * floor's own outer edge.
 *
 * # Why this is no longer chamber-based
 *
 * The previous version of this module (PR #762/#764) recovered "chamber"
 * membership via connected-components over the floor mask, then derived
 * each seam as a straight line between two chambers' bounding-box
 * columns and the outer envelope as one rectangle around the whole
 * floor's bounding box. Kirk's live walk (#787) found the lie: "the
 * walls I can place are not straight. The walls are assumed on a
 * region — but we decided that regions do not necessarily have walls
 * automatically." Three concrete failures fell out of the chamber
 * reconstruction: an L-shaped or horizontal seam came out slanted (the
 * bounding-box-column math only modeled a vertical seam spanning a full
 * row range); a wall chain that didn't fully split the floor into two
 * components was silently dropped (`chamberFrom.id === chamberTo.id` ->
 * skip); and a non-rectangular floor's envelope followed its bounding
 * RECTANGLE, not its real outline.
 *
 * # No more envelope at all (Kirk's ruling, same day, after seeing the
 * outline-traced version live): "draw nothing, floor ends into
 * darkness. that seems more honest about the void." The first fix for
 * #787 (still traced from the real floor mask instead of a bounding
 * rectangle) was itself superseded before merge — the floor's own
 * outer edge draws NOTHING now, authored or implied. The void already
 * blocks movement/sight mechanically (an opaque void blocks the whole
 * hex, Kirk's separate standing ruling) with no visual masonry needed
 * to sell it; a floor that just ends into darkness IS the honest
 * picture. An author who wants a visible outer wall draws one like any
 * other wall — `atlas.boundaries` — no special-cased "envelope" concept
 * survives this file at all.
 *
 * # The fix: chain the real authored edges, don't infer regions or an
 * outer wall
 *
 * `atlas.boundaries` + `atlas.doorways` already carry everything this
 * module draws. It builds one flat list of hex-adjacency edges — every
 * declared boundary, every doorway (as a break point, see below) — and
 * hands the whole thing to `authoredWallRuns.computeAuthoredWallRuns`,
 * the chaining engine an earlier slice (rpg-dnd5e-web#723-family)
 * already built and proved for exactly this problem: walk a graph of
 * real hex edges into straight runs via a Douglas-Peucker-style
 * distance tolerance (a real zigzag "eats" only a bounded amount before
 * a chord across it stops matching every visited vertex; a genuine
 * corner's deviation grows unboundedly the moment the walk is forced
 * past it), breaking at branches, dead ends, and door-adjacent
 * vertices. It already handles isolated single-edge chains (a partial
 * interior wall that doesn't split anything renders as its own one-edge
 * run, nothing to drop) — the closed-loop handling it also has (its own
 * Phase 2) simply never triggers here anymore, since there is no
 * implied outer loop being fed in.
 *
 * # Doors: aligned to the run they interrupt, AND forced to meet it
 * exactly, AND their flanking runs forced to agree on facing
 *
 * Every `atlas.doorways` entry gets its own gap + frame independently —
 * no Map keyed by "chamber pair" to lose a second door on the same seam
 * to (rpg-dnd5e-web#782), because there is no such Map anymore: every
 * doorway is processed once, unconditionally.
 *
 * Two live-walk findings on this same PR, in sequence:
 *
 * 1. "walls look straight now but the door follows the hex edge." The
 *    chaining engine trims a door-adjacent run by exactly
 *    `DOOR_FRAME_CALIBRATED_WIDTH/2` back from the door's own hex
 *    CORNER — a known, exact distance, used below to recognize, from
 *    the OUTSIDE, which run a door interrupts on each side, with no
 *    change to the chaining engine itself.
 * 2. "while I think our walls should be double sided... the gap is
 *    what I am most concerned with" + a screenshot showing bare floor
 *    on BOTH sides of the door frame, and the two flanking runs facing
 *    opposite ways. Root cause: the engine's own trim (measured from
 *    the door's raw hex CORNER) and this module's gap placement
 *    (projected from the door's raw hex-edge MIDPOINT) are two
 *    INDEPENDENT computations that only approximately agree — the
 *    exact defect class Kirk found once before, pre-#787 ("the walls
 *    do not touch"), in different clothes. The fix removes the second
 *    computation's independence entirely: once the gap's own boundary
 *    points are known, this module FORCES each flanking run's endpoint
 *    to sit at that exact point (trim or extend, whichever the
 *    engine's own trim over- or under-shot by) — the runs meet the
 *    frame by construction, not by two formulas landing close. The
 *    same pass unions every run that shares an endpoint (real chain
 *    adjacency) OR is linked by a door (the two runs a door's own gap
 *    now provably connects, even though their endpoints sit on
 *    opposite sides of the frame) into one component, then makes every
 *    run in it agree on which SIDE is outward — deterministic
 *    (whichever run is encountered first in array order becomes the
 *    reference), negating any disagreeing run's own `facing` (never
 *    replacing it with another run's value: each run's `facing` stays
 *    perpendicular to THAT run's own geometry, which is what
 *    `WallRunMesh` compares it against) rather than leaving each
 *    fragment's independently-computed facing free to disagree.
 * 3. "the wall from the top seems like it is at an angle" — a screenshot
 *    (top-down) showing a column seam visibly tilted a few degrees off
 *    vertical while the floor's own hex columns run dead straight.
 *    Root cause: the engine's own run is the CHORD between the chain's
 *    first and last vertex only. A hex-column seam's real vertices
 *    zigzag +-half a hex by ROW PARITY (even/odd row lands the vertex a
 *    half-hex-width to one side or the other of the seam's true,
 *    parity-averaged line) — the chord happens to connect whichever two
 *    parities the chain's own first/last vertex landed on, inheriting a
 *    few degrees of tilt from that essentially arbitrary pair instead
 *    of the seam's real direction. Fixed by re-deriving each run's line
 *    via a total-least-squares fit, then re-extending to the chain's
 *    own extreme vertices projected onto the fitted line. Fit over the
 *    WHOLE door-split chain's combined input set, not each post-split
 *    run alone (see the fit-grouping comment at its own call site for
 *    why a short, door-truncated fragment's own parity mix can still be
 *    unbalanced on its own). This replaces each run's start/end BEFORE
 *    door planning (finding 1) and force-closure (finding 2) run, so
 *    both inherit the corrected line for free. The fit's own INPUT
 *    changed once more on #799 below — see that section for the current
 *    mechanism and why finding 3's first version (fitting the chain's
 *    raw hex-CORNER vertex cloud) still wasn't enough.
 *
 * # Seam fit, corrected again: recognize an authored axis, don't just
 * fit closer to it (rpg-dnd5e-web#799)
 *
 * Finding 3's original fit (parsing the chain's own hex-CORNER vertex
 * cloud out of each run's `key`, via the since-removed
 * `parseChainVertices`) reduced the reference tomb's worst residual
 * from up to ~80 degrees down to ~1.6 degrees (|dirX| ~= 0.0273,
 * calibrated into a 0.03 test tolerance) — comfortably invisible on the
 * tomb's own long seams, so the fix shipped. Kirk, walking his OWN
 * authored dungeon the same evening: "walls are also not straight." The
 * same residual, on his dungeon's shorter, more parity-skewed chains,
 * was big enough to read as crooked. Root cause of the residual itself:
 * a hex CORNER vertex's zigzag offset cancels in the fit only if the
 * chain's own near/far cell selection happens to alternate evenly by
 * row parity — real authored data usually doesn't (verified on the
 * tomb: one seam's 14 edges split 11-odd/3-even by their own "near"
 * cell's row parity), so the fit's TLS line still carried a real,
 * data-dependent residual instead of landing exactly on-axis for an
 * ordinary column/row wall. The 0.03 tolerance was a calibration
 * against that residual, not a fix for it, and Kirk's finding retired
 * it: "must render exactly axis-true."
 *
 * The fix has two tiers, tried in order, both keyed off the same
 * per-edge data (`edgeFitDataByToken`, see its own doc comment for how
 * a run's `key` is split back into the real cube cell pairs that
 * produced it, without reverse-engineering cell identity out of
 * hex-corner vertex positions the way the old `parseChainVertices`
 * had to).
 *
 * Tier 1 — authored-axis RECOGNITION, not fitting at all
 * (`authoredAxisLine`): if EVERY edge in a chain crosses the exact same
 * pair of authored columns (`authoredCol`, the SAME `q + floor(r/2)`
 * offset convention `FloorBuilder.ts`'s `getHexesInRect` already lays
 * a rectangular hex area out in), that chain isn't approximately
 * vertical — it IS one authored vertical wall, semantically, by the
 * author's own hex-grid declaration: the zigzag CHAIN_TOLERANCE
 * already collapsed into one run is the hex grid's own representation
 * of that wall, not its true shape. Rendering it exactly vertical
 * honors the authored data; the residual tilt was always the artifact,
 * never the intent. Symmetric for a chain whose every edge crosses the
 * same pair of ROWS (a declared horizontal wall — raw row numbers need
 * no offset; world z is already a pure function of row alone, unlike
 * world x for a column). Once recognized, the direction is exact by
 * definition — `{0,1}` or `{1,0}`, no fitting needed — and the only
 * remaining unknown is WHERE the wall stands, which is simply the 1-D
 * least-squares completion of that already-declared direction: the
 * mean x (or z) of the chain's own boundary-pair midpoints. This is
 * why a chain's own INTERNAL edge-type balance (see tier 2) stops
 * mattering once tier 1 fires — the direction was never being
 * estimated from that data to begin with. Verified directly: the
 * tomb's own seam1 (14 edges, an uncancelable 7-E-type/4-NE-type/
 * 3-SE-type mix by hex-adjacency direction — see tier 2) crosses
 * exactly one column pair, `5|6`, for every single edge, so it renders
 * EXACTLY vertical now (|dirX| < 1e-6, the original, un-calibrated
 * ask). A genuinely diagonal authored chain never crosses one shared
 * column OR row pair across 2+ edges (verified directly, not just
 * inferred: the "diagonal chain is not snapped" fixture's own edges,
 * fed straight to `authoredAxisLine`, return undefined) — the
 * diagonal-honesty law survives untouched, because the trigger simply
 * cannot fire on it; there's no "snap toward the wrong axis" failure
 * mode to guard against here at all.
 *
 * Tier 2 — the continuous fit, unchanged in kind but improved in
 * input, for any chain tier 1 doesn't recognize (a genuine diagonal,
 * or a fit-group of fewer than 2 edges): total-least-squares over the
 * chain's own boundary-PAIRS' cell-center MIDPOINTS
 * (`edgeFitDataByToken`'s own `mid`) instead of finding 3's original
 * hex-CORNER vertex cloud. This is a real, verified improvement over
 * finding 3, not a complete fix on its own — a pair's cell-center
 * midpoint is `hexEdgeBetween`'s own edge `mid` (the two adjacent cell
 * centers' average IS the shared edge's own midpoint, a standard
 * hex-tiling identity), so it still carries a real, individually
 * nonzero x deviation on any single diagonal-type edge; it does NOT
 * collapse a whole column seam onto one exact world-x by construction
 * the way an earlier draft of this doc claimed, and tier 1 exists
 * precisely because tier 2 alone can't reach exactly zero on a real,
 * finite, edge-type-imbalanced chain. What DOES hold, verified
 * directly (a synthetic large symmetric column boundary's fitted
 * |dirX| shrinks ~4x every time its length doubles — 0.0022 at 20
 * rows, 0.00002 at 200 — consistent with a genuine statistical
 * residual, not a fixed bias): the fit's residual is a property of how
 * EVENLY balanced a chain's own left-leaning vs. right-leaning step
 * edges happen to be (see `HEX_DIRECTIONS`), and midpoint data cancels
 * that imbalance measurably better than finding 3's raw corner-vertex
 * data did on the SAME real chains (verified on the tomb's seam1, in
 * isolation from tier 1: 0.0273 -> 0.0189). A genuinely diagonal
 * authored chain's pair midpoints still lie along its own true
 * diagonal here too (no axis is preferred — see the "diagonal chain is
 * not snapped" test).
 *
 * A door whose edge touches no wall run's trimmed endpoint on EITHER
 * side (a standalone doorway with no wall around it — legal: a doorway
 * is a door with no state) falls back to its own raw `hexEdgeBetween`
 * geometry, since nothing straighter exists to align or close against.
 *
 * # Corners: closed by construction too (rpg-dnd5e-web#793)
 *
 * Kirk, walking an authored dungeon on `dev` right after #788 merged:
 * "the corners do not close consistently" — a screenshot of one walled
 * room whose top wall gapped open against one side wall and overlapped
 * past the other. Root cause: two runs of one chain that share a real
 * authored corner vertex each get their OWN independent least-squares
 * fit (finding 3's fit grouping is deliberately door-link-only, so a
 * genuine corner's two legs are never merged into one fit) — nothing
 * constrained the two fitted lines to still pass through the same
 * point after fitting, so the shared vertex opens into a gap or an
 * overlap depending on which side of each line it happened to fall.
 * Fixed the same way every other seam in this module closes: not by
 * tuning, by construction. Every run endpoint is clustered with every
 * OTHER run endpoint whose RAW (pre-fit) position coincides — two
 * clustered endpoints share an ordinary authored corner; three or more
 * share a T-junction (`computeAuthoredWallRuns` explicitly supports a
 * branch vertex with 3+ runs meeting it, see its own doc comment). A
 * first version of this fix closed corners PAIRWISE instead of by
 * cluster (Copilot review, PR #794): at a T-junction that rewrites the
 * same endpoint once per pair it appears in — A/B moves A, then A/C
 * moves A again, then B/C moves B and C — order-dependent, and the
 * three fitted centerlines never end up sharing one joint. Clustering
 * first, then closing the WHOLE cluster in one shot, removes the
 * order-dependence entirely: a two-member cluster's shared joint is
 * the exact intersection of its two fitted lines (`lineIntersection`,
 * reused from `wallRuns.ts` rather than reimplemented); a three-or-
 * more-member cluster's shared joint is the single point minimizing
 * total squared perpendicular distance to every member's fitted line
 * (`leastSquaresLineJoint` below — a deliberate, justified choice: it
 * is the natural generalization of "the one point every line agrees
 * on" when no single point is exactly on all of them, and it reduces
 * to the same answer `lineIntersection` gives for exactly two
 * non-parallel lines, since their exact crossing already has zero
 * total squared distance). Either path falls back to the shared RAW
 * vertex, unchanged, when the participating lines are too close to
 * parallel (or otherwise degenerate) to solve reliably (not reachable
 * for a real corner or T-junction, but a defensive floor rather than a
 * division by ~0 — Copilot review, PR #794: an earlier version of this
 * fallback `continue`d without assigning anything, so the documented
 * fallback was dead code; it now explicitly assigns every member to
 * the shared raw vertex, margin included, same as the solved case).
 * Each run is then extended a further
 * `DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN` (also reused from
 * `wallRuns.ts` — a named constant derived from real wall-piece
 * thickness, not a tuning knob hidden in this module) past that
 * shared joint, along its OWN direction, so the OUTSIDE face of the
 * corner has real wall-piece thickness overlapping the joint instead
 * of a thickness-sized notch peeking through it — the same
 * "overlap-miter" convention `WallRunMesh`'s own doc comment already
 * documents for the OLD wire's chamber-based corners, reused here
 * rather than invented fresh.
 *
 * Precedence where a corner and a door could ever compete for the same
 * run endpoint: they never do, by construction, not by ordering — a
 * door-adjacent endpoint is `computeAuthoredWallRuns`'s own
 * `DOOR_TRIM`-inward trim from the door's corner, unique to that one
 * run (finding 1's own doc comment), so it never coincides with
 * ANOTHER run's raw endpoint the way a genuine corner's shared vertex
 * does; corner-closure below only ever touches endpoints door
 * force-closure never looks at, and vice versa. This pass still runs
 * BEFORE door force-closure regardless, so if that invariant is ever
 * wrong for some future wire shape, the door's own gap boundary is the
 * one that wins (overwrites last).
 *
 * Double-sided walls themselves (Kirk: "I think our walls should be
 * double sided") are explicitly OUT of scope here — filed as a
 * follow-up; this fix only makes the single face every run already has
 * agree with its neighbors', not add a second face.
 */

import {
  coordToKey,
  cubeToWorld,
  hexEdgeBetween,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import {
  computeAuthoredWallRuns,
  vertexKey,
  type AuthoredWallEdgeInput,
  type AuthoredWallRun,
} from '@/hooks/authoredWallRuns';
import {
  DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN,
  lineIntersection,
} from '@/hooks/wallRuns';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** Where a door's frame+leaf go — the gap this run's own chained wall
 * segments leave, rendered separately by the caller (matches the old
 * route's own convention: `WallRunMesh` tiles the segments, it never
 * places doors). */
export interface DoorGapPiece {
  key: string;
  connection: string;
  /** Frame placement — the gap's own center. */
  position: WorldPos;
  /** Leaf placement — one end of the gap (the leaf's local pivot sits at
   * one end, like every other door piece in this codebase — see
   * SyntyHexWall.tsx's own `edge.a`/`edge.mid` convention this mirrors). */
  leafPosition: WorldPos;
  rotationY: number;
}

export interface WallRunScene {
  /** Every straight wall run — envelope and interior seams alike, no
   * longer a separate shape for each (see this module's own header doc
   * for why unifying them is correct, not merely convenient): both are
   * chained by the same engine off the same real-edge graph. Rendered by
   * `WallRunMesh`'s own `authoredRuns` prop, the same tiled-Synty-piece
   * path an unrelated (OLD wire) authored-dungeon route already proved
   * out. */
  wallRuns: AuthoredWallRun[];
  doorGaps: DoorGapPiece[];
}

function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unitDirection(a: WorldPos, b: WorldPos): WorldPos {
  const len = distance(a, b);
  if (len === 0) return { x: 0, z: 0 };
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

/**
 * The single point minimizing the sum of squared perpendicular
 * distances to every line in `lines` -- used below to close a
 * T-junction (rpg-dnd5e-web#793, Copilot review PR #794) where three
 * or more runs' fitted lines all pass NEAR one shared raw vertex but,
 * after independent least-squares fitting, no longer pass through any
 * single common point exactly. Standard least-squares line
 * intersection: for each line, its unit NORMAL `n` (perpendicular to
 * `dir`) and the scalar `c = n . point` describe every point ON that
 * line as `{p : n . p = c}`; the minimizer of `sum((n_k . p - c_k)^2)`
 * solves the 2x2 normal-equations system
 * `sum(n_k n_k^T) * p = sum(c_k * n_k)` (Cramer's rule below). For
 * exactly two non-parallel lines this is IDENTICAL to
 * `lineIntersection` (their exact crossing has zero total squared
 * distance, the global minimum), which is why corner-closure below
 * only calls this for three-or-more-member clusters and keeps using
 * the already-proven `lineIntersection` for the common two-run corner
 * case. Returns undefined when the system is singular (every
 * participating line the same direction) -- not reachable for a real
 * corner or T-junction, but a defensive floor rather than a division
 * by ~0. Note the least-squares joint generally does NOT sit exactly
 * ON any one of the individual lines when 3+ of them aren't exactly
 * concurrent (real hex-grid corners at a T-junction usually aren't) --
 * each run's own final segment therefore gets a tiny genuine bend over
 * just its last `DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN` of length,
 * negligible visually (well inside the same margin already designed
 * to absorb corner-joint slop) and NOT a defect: forcing every run's
 * whole line to re-fit through one shared point would fight the
 * per-run least-squares fit finding 3 already relies on.
 */
function leastSquaresLineJoint(
  lines: ReadonlyArray<{ point: WorldPos; dir: WorldPos }>
): WorldPos | undefined {
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  let bx = 0;
  let bz = 0;
  for (const { point, dir } of lines) {
    const nx = -dir.z;
    const nz = dir.x;
    sxx += nx * nx;
    sxz += nx * nz;
    szz += nz * nz;
    const c = nx * point.x + nz * point.z;
    bx += c * nx;
    bz += c * nz;
  }
  const det = sxx * szz - sxz * sxz;
  if (Math.abs(det) < 1e-9) return undefined;
  return {
    x: (szz * bx - sxz * bz) / det,
    z: (sxx * bz - sxz * bx) / det,
  };
}

/**
 * The single point two or more run endpoints sharing one raw vertex
 * should close to: the exact line intersection for two members, the
 * least-squares joint for three or more (a T-junction), falling back
 * to `rawPoint` itself -- UNCONDITIONALLY, this always returns a
 * point, never leaves a caller to decide whether "nothing changed" is
 * an acceptable answer -- when the participating lines are too close
 * to parallel to solve reliably. Exported (like
 * `lineIntersection`/`DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN`, which
 * this builds on) so the fallback path -- unreachable through any
 * real authored corner's own geometry, by design, since a genuine
 * corner's two legs are never near-parallel -- can still be pinned
 * directly with a synthetic near-parallel pair rather than left
 * untested (rpg-dnd5e-web#793, Copilot review PR #794: an earlier
 * version of this fallback `continue`d without assigning anything,
 * silently leaving the documented behavior unimplemented).
 */
export function cornerJoint(
  rawPoint: WorldPos,
  lines: ReadonlyArray<{ point: WorldPos; dir: WorldPos }>
): WorldPos {
  if (lines.length === 2) {
    return (
      lineIntersection(
        lines[0]!.point,
        lines[0]!.dir,
        lines[1]!.point,
        lines[1]!.dir
      ) ?? rawPoint
    );
  }
  return leastSquaresLineJoint(lines) ?? rawPoint;
}

/** A stable, order-independent key for an unordered pair of hex
 * coordinates -- used to detect a doorway occupying the same cell pair
 * as a declared boundary (see the doorway/boundary overlap guard
 * above). */
function pairKey(a: CubeCoord, b: CubeCoord): string {
  const ka = coordToKey(a);
  const kb = coordToKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Half the calibrated door-frame width -- the EXACT distance
 * `computeAuthoredWallRuns`'s own `emitRun` trims a run's endpoint back
 * from a door-adjacent hex corner (authoredWallRuns.ts's own doc
 * comment: "a run whose end sits ON a door-touching vertex stops
 * DOOR_FRAME_CALIBRATED_WIDTH/2 short of it"). Used below to recognize,
 * from the OUTSIDE, which run's endpoint was trimmed against a given
 * door corner -- no change to that engine needed.
 */
const DOOR_TRIM = DOOR_FRAME_CALIBRATED_WIDTH / 2;

interface RunEndpointRef {
  runIndex: number;
  end: 'start' | 'end';
}

/** A mutable working copy of one AuthoredWallRun -- this module force-
 * corrects a door-adjacent run's endpoint and, separately, may flip its
 * facing to agree with the rest of its connected component (see this
 * file's own header doc, finding 2). Plain fields, not a class: cheap
 * to construct one per run, once, per call. */
interface MutableRun {
  start: WorldPos;
  end: WorldPos;
  key: string;
  facing: WorldPos;
}

/** Whichever run has an endpoint at EXACTLY `DOOR_TRIM` from `corner`
 * (one of a doorway's own two hex-edge corners) -- the run that
 * corner's own engine-side trim pulled back, i.e. the run this door
 * interrupts on that side. undefined if no run was trimmed against this
 * corner (a standalone doorway with no wall on that side). */
function runIndexTrimmedAgainst(
  corner: WorldPos,
  runs: readonly MutableRun[]
): RunEndpointRef | undefined {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (Math.abs(distance(run.start, corner) - DOOR_TRIM) < 1e-6) {
      return { runIndex: i, end: 'start' };
    }
    if (Math.abs(distance(run.end, corner) - DOOR_TRIM) < 1e-6) {
      return { runIndex: i, end: 'end' };
    }
  }
  return undefined;
}

/** The point on the infinite line through `linePoint` along unit `dir`
 * closest to `point` -- projects a door's own raw edge midpoint onto the
 * straightened run line it should sit in, rather than using the raw
 * midpoint (which sits on the zigzag the run only approximates)
 * verbatim. */
function projectOntoLine(
  point: WorldPos,
  linePoint: WorldPos,
  dir: WorldPos
): WorldPos {
  const t = (point.x - linePoint.x) * dir.x + (point.z - linePoint.z) * dir.z;
  return { x: linePoint.x + dir.x * t, z: linePoint.z + dir.z * t };
}

/**
 * One token PER NON-DOOR EDGE, mapped to that edge's own authored
 * boundary PAIR's cell-center midpoint -- the seam-fit input this
 * module uses instead of the chain's raw hex-CORNER vertex cloud
 * (rpg-dnd5e-web#799, see this file's own header doc, seam-fit
 * section, for why). The token is EXACTLY the string
 * `computeAuthoredWallRuns`'s own `emitRun` builds for that same edge
 * inside a run's `key` (`chainEdges.map(g => g.input.id ??
 * (aKey+"|"+bKey)).sort().join(';')`, and this module never sets
 * `AuthoredWallEdgeInput.id` on any edge it builds) -- computed here
 * independently from THIS module's own `edges` (real cube `from`/`to`
 * cell identity, still in hand) via the exact same `hexEdgeBetween` +
 * `vertexKey` (reused/exported from authoredWallRuns.ts rather than
 * reimplemented) the engine itself uses, so the two computations are
 * bit-identical for a shared edge and every token in a run's `key`
 * reliably finds its entry here. This is genuinely THREADING the
 * original boundary pairs through to the fit, not reverse-engineering
 * cell identity out of a hex-corner vertex -- a corner is shared by up
 * to 3 cells, so a vertex alone can't tell which pair produced it, the
 * gap `parseChainVertices` (this function's now-removed predecessor)
 * had no way to close.
 */
export interface EdgeFitData {
  mid: WorldPos;
  from: CubeCoord;
  to: CubeCoord;
}

function edgeFitDataByToken(
  edges: readonly AuthoredWallEdgeInput[],
  hexSize: number
): Map<string, EdgeFitData> {
  const byToken = new Map<string, EdgeFitData>();
  for (const edge of edges) {
    if (edge.isDoor) continue; // door edges never enter any run's chainEdges/key
    const { a, b } = hexEdgeBetween(edge.from, edge.to, hexSize);
    const token = `${vertexKey(a)}|${vertexKey(b)}`;
    const fromWorld = cubeToWorld(edge.from, hexSize);
    const toWorld = cubeToWorld(edge.to, hexSize);
    byToken.set(token, {
      mid: {
        x: (fromWorld.x + toWorld.x) / 2,
        z: (fromWorld.z + toWorld.z) / 2,
      },
      from: edge.from,
      to: edge.to,
    });
  }
  return byToken;
}

/**
 * The hex grid's own "offset column" index -- the SAME `q + floor(r/2)`
 * convention `FloorBuilder.ts`'s `getHexesInRect` already uses to lay a
 * rectangular hex area out in straight visual columns (reused here,
 * not invented fresh). A single authored column's own cell centers
 * still zigzag between two world-x values by row parity (an
 * unavoidable property of ANY integer hex column -- verified directly,
 * see this module's header doc, seam-fit section) -- `authoredCol`
 * identifies WHICH column a cell belongs to, not its world position.
 */
function authoredCol(cube: CubeCoord): number {
  return cube.x + Math.floor(cube.z / 2);
}

/** An unordered pair of numbers as a stable Set/Map key -- used below
 * to ask "do every one of this chain's edges cross the SAME two
 * authored columns (or rows)," regardless of which side of each
 * individual edge happens to be "from" vs "to". */
function unorderedPairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Recognizes an authored-axis-declared wall and returns its EXACT
 * (not fitted) line, or undefined if this chain doesn't declare one
 * (rpg-dnd5e-web#799 — see this module's header doc, seam-fit
 * section, for the full "why" and the semantics: this is recognizing
 * what the author already declared, not snapping toward a preferred
 * axis). If every edge in the chain crosses the exact same pair of
 * authored columns, the chain IS one authored vertical wall by
 * definition — its direction is exactly `{x:0, z:1}`, no fitting
 * needed, and the only remaining unknown is WHERE it stands, which is
 * the 1-D least-squares answer given that fixed direction: the mean x
 * of the chain's own boundary-pair midpoints. Symmetric for a chain
 * whose every edge crosses the same pair of ROWS (a declared
 * horizontal wall; a raw row number needs no `authoredCol`-style
 * offset — world z is already a pure function of row alone). A chain
 * satisfying BOTH simultaneously (only possible in a degenerate
 * single-edge-equivalent case) or NEITHER (a genuine diagonal, or any
 * chain whose edges don't all cross one consistent pair) falls through
 * to the continuous fit unchanged — a genuinely diagonal authored
 * chain never has one shared column OR row pair across 2+ edges
 * (verified: the "diagonal chain is not snapped" fixture triggers
 * neither), so this can't misfire on it.
 */
export function authoredAxisLine(
  edgeData: readonly EdgeFitData[],
  rawAnchor: WorldPos
): { dir: WorldPos; centroid: WorldPos } | undefined {
  if (edgeData.length < 2) return undefined;
  const colPairs = new Set(
    edgeData.map((e) =>
      unorderedPairKey(authoredCol(e.from), authoredCol(e.to))
    )
  );
  const rowPairs = new Set(
    edgeData.map((e) => unorderedPairKey(e.from.z, e.to.z))
  );
  const colConstant = colPairs.size === 1;
  const rowConstant = rowPairs.size === 1;
  if (colConstant && !rowConstant) {
    let sumX = 0;
    for (const e of edgeData) sumX += e.mid.x;
    return {
      dir: { x: 0, z: 1 },
      centroid: { x: sumX / edgeData.length, z: rawAnchor.z },
    };
  }
  if (rowConstant && !colConstant) {
    let sumZ = 0;
    for (const e of edgeData) sumZ += e.mid.z;
    return {
      dir: { x: 1, z: 0 },
      centroid: { x: rawAnchor.x, z: sumZ / edgeData.length },
    };
  }
  return undefined;
}

/**
 * Fits the TRUE direction of a straight chain via total-least-squares
 * (the principal axis of the point cloud, not a simple x-on-z or
 * z-on-x regression, which fails for a near-vertical or near-horizontal
 * seam) — Kirk's live-walk finding: "the wall from the top seems like
 * it is at an angle" (#788), then "walls are also not straight" again
 * on his own dungeon's shorter chains (#799) once the fit's remaining
 * ~0.03 residual, invisible on the tomb's long seams, read as crooked
 * there. The engine's own run is only the CHORD between the chain's
 * first and last vertex; a hex-column seam's real hex-CORNER vertices
 * zigzag +-half a hex by row parity, so that chord inherits a few
 * degrees of tilt from whichever two parities the endpoints happened to
 * land on. `points` is now each constituent boundary PAIR's own
 * cell-center MIDPOINT (rpg-dnd5e-web#799 — see `edgeMidpointsByToken`
 * and this module's own header doc, seam-fit section), not the chain's
 * raw hex-corner vertex cloud (#788's original input): a pair midpoint
 * sits exactly on the seam's true midline by construction regardless of
 * which side of the pair is "near"/"far", so a column seam now fits
 * EXACTLY vertical and a row seam EXACTLY horizontal, without depending
 * on the real data's own near/far split happening to be parity-balanced
 * (#788's residual came from exactly that dependency); a genuinely
 * diagonal authored chain still fits its own true diagonal (no axis is
 * preferred — pair midpoints along a real diagonal still lie on that
 * diagonal). Returns undefined for a degenerate cloud (fewer than 2
 * distinct points, or all coincident) — callers fall back to the
 * engine's own raw chord.
 */
function fitLineDirection(
  vertices: readonly WorldPos[]
): { dir: WorldPos; centroid: WorldPos } | undefined {
  if (vertices.length < 2) return undefined;

  let meanX = 0;
  let meanZ = 0;
  for (const p of vertices) {
    meanX += p.x;
    meanZ += p.z;
  }
  meanX /= vertices.length;
  meanZ /= vertices.length;

  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const p of vertices) {
    const dx = p.x - meanX;
    const dz = p.z - meanZ;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  if (sxx === 0 && szz === 0) return undefined;

  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  return {
    dir: { x: Math.cos(theta), z: Math.sin(theta) },
    centroid: { x: meanX, z: meanZ },
  };
}

/**
 * Re-extends ONE run onto a fitted line: its own two ALREADY-KNOWN
 * extreme points (the engine's own `rawStart`/`rawEnd` -- a chain's
 * first and last vertex ARE its extremes by construction of the
 * chaining walk itself, so no extra vertex scan is needed here),
 * projected onto that line. Deliberately projects the engine's own
 * FULL-PRECISION endpoints rather than any of the fit's own INPUT
 * points (only accurate to the 5 decimals `vertexKey` formats to,
 * plenty for fitting a DIRECTION by averaging over many points, nowhere
 * near enough for a single run's own final position -- an early version
 * of this function used the fit's rounded input points for the extent
 * too, and a single-edge chain's fitted position landed ~2.5e-6 off the
 * true hex corner, well past this module's own 1e-6 exact-match tests).
 * Falls
 * back to the raw chord unchanged when no fitted `line` is available
 * (a degenerate cloud). Preserves the raw chord's own start/end
 * correspondence trivially, by construction (start always projects
 * from rawStart, end from rawEnd) -- door-side lookups keyed by
 * `RunEndpointRef.end` stay valid against the result.
 */
function extentAlongLine(
  rawStart: WorldPos,
  rawEnd: WorldPos,
  line: { dir: WorldPos; centroid: WorldPos } | undefined
): { start: WorldPos; end: WorldPos } {
  if (!line) return { start: rawStart, end: rawEnd };
  return {
    start: projectOntoLine(rawStart, line.centroid, line.dir),
    end: projectOntoLine(rawEnd, line.centroid, line.dir),
  };
}

/** Small array-backed union-find over run indices -- groups runs into
 * connected chains (shares an endpoint, or linked across a door's own
 * gap) so facing can be propagated per component below. */
class RunUnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    let cur = x;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

interface DoorPlan {
  doorway: AtlasDoorway;
  from: CubeCoord;
  to: CubeCoord;
  gapCenter: WorldPos;
  gapStart: WorldPos;
  gapEnd: WorldPos;
  rotationY: number;
  aRef?: RunEndpointRef;
  bRef?: RunEndpointRef;
}

/**
 * boundariesToWallRuns is the module's one entry point: every declared
 * boundary and every doorway (as a chain break point) become one
 * straight-run scene, plus one DoorGapPiece per doorway. The floor's own
 * outer edge draws nothing — Kirk's ruling, same day as #787: "draw
 * nothing, floor ends into darkness. that seems more honest about the
 * void." An author who wants a visible outer wall draws one via
 * `atlas.boundaries`, same as any interior wall.
 */
export function boundariesToWallRuns(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): WallRunScene {
  // An empty floor has no doorway/boundary geometry worth deriving —
  // report an obviously-empty scene rather than let downstream geometry
  // silently degenerate (Copilot review, PR #764, the same guard this
  // module has always needed).
  if (atlas.cells.length === 0) {
    return { wallRuns: [], doorGaps: [] };
  }

  const cubes = atlas.cells.map(positionToCube);

  // A doorway "punches through" a boundary on the same cell pair -- a
  // shape this codebase already treats as valid (Copilot review, PR
  // #788). If both edges were fed to the chaining engine, the boundary
  // would still tile as a normal wall (the engine only uses door edges
  // as BREAK points; it doesn't remove an overlapping non-door edge),
  // covering the door opening with wall geometry. Precomputing every
  // doorway's own pair key lets the boundary loop below skip any
  // boundary edge a doorway already occupies, while the doorway edge
  // itself still goes in as `isDoor: true` so chaining trims/breaks
  // correctly around it.
  const doorwayPairs = new Set<string>();
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    doorwayPairs.add(pairKey(positionToCube(d.from), positionToCube(d.to)));
  }

  const edges: AuthoredWallEdgeInput[] = [];

  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) continue;
    const from = positionToCube(b.from);
    const to = positionToCube(b.to);
    if (doorwayPairs.has(pairKey(from, to))) continue;
    edges.push({ from, to, isDoor: false });
  }

  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    edges.push({
      from: positionToCube(d.from),
      to: positionToCube(d.to),
      isDoor: true,
    });
  }

  const rawRuns = computeAuthoredWallRuns(edges, hexSize, cubes);

  // Find which run (if any) flanks each door on each side, against the
  // ENGINE'S OWN raw run positions -- the only place the DOOR_TRIM-
  // from-corner invariant `runIndexTrimmedAgainst` relies on actually
  // holds (the least-squares fit below moves every run's own endpoints
  // off that exact distance).
  interface DoorInfo {
    doorway: AtlasDoorway;
    from: CubeCoord;
    to: CubeCoord;
    a: WorldPos;
    b: WorldPos;
    mid: WorldPos;
    rawDir: WorldPos;
    rawRotationY: number;
    aRef?: RunEndpointRef;
    bRef?: RunEndpointRef;
  }
  const doorInfos: DoorInfo[] = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    const from = positionToCube(d.from);
    const to = positionToCube(d.to);
    const {
      a,
      b,
      mid,
      rotationY: rawRotationY,
    } = hexEdgeBetween(from, to, hexSize);
    doorInfos.push({
      doorway: d,
      from,
      to,
      a,
      b,
      mid,
      rawDir: unitDirection(a, b),
      rawRotationY,
      aRef: runIndexTrimmedAgainst(a, rawRuns),
      bRef: runIndexTrimmedAgainst(b, rawRuns),
    });
  }

  // Group runs into FITTING chains by door-link ONLY (not general
  // endpoint-adjacency): a door-adjacent hard break is an ARTIFACT of
  // this module's own door handling, not an authored corner, so the two
  // runs it splits are still one straight authored wall for fitting
  // purposes and should share ONE fitted line over their combined
  // vertex set (Kirk's live-walk finding: fitting a short, door-
  // truncated fragment ALONE can still carry a real residual tilt if
  // that one fragment's own parity mix isn't balanced -- the fit only
  // fully cancels the zigzag over the seam's real full extent). A
  // genuine corner (no door) is a REAL authored direction change with
  // no trim at all -- computeAuthoredWallRuns's own emitRun only trims
  // door-adjacent vertices -- so its two legs' raw endpoints coincide
  // at the exact corner vertex; grouping by general endpoint-adjacency
  // would indistinguishably merge that real corner's two legs into one
  // averaged (wrong) direction, which is exactly the zigzag-vs-corner
  // distinction CHAIN_TOLERANCE already drew once and this must not
  // re-blur. Facing propagation (below) deliberately uses a BROADER
  // grouping that also includes ordinary endpoint-adjacency -- that's
  // fine (even desirable) for facing, wrong for line-fitting.
  const fitChainUf = new RunUnionFind(rawRuns.length);
  for (const info of doorInfos) {
    if (info.aRef && info.bRef)
      fitChainUf.union(info.aRef.runIndex, info.bRef.runIndex);
  }

  // Fit input (rpg-dnd5e-web#799): each constituent edge's own
  // boundary-PAIR data, recovered by splitting each run's own `key`
  // back into its constituent edge tokens and looking each up in
  // `edgeFitByToken` -- see `edgeFitDataByToken`'s own doc comment for
  // why boundary-pair midpoints (not the old hex-corner vertex cloud)
  // are the right fit input, and this module's header doc, seam-fit
  // section, for the full mechanism below. A missing lookup (not
  // expected: every non-door edge this module built was fed to
  // `computeAuthoredWallRuns`, so every token in its own output's `key`
  // has a matching entry here) is skipped rather than thrown --
  // `fitLineDirection`'s own degenerate-cloud fallback (fewer than 2
  // points) keeps this safe either way.
  const edgeFitByToken = edgeFitDataByToken(edges, hexSize);
  const chainEdgeDataByRoot = new Map<number, EdgeFitData[]>();
  for (let i = 0; i < rawRuns.length; i++) {
    const root = fitChainUf.find(i);
    const list = chainEdgeDataByRoot.get(root) ?? [];
    for (const token of rawRuns[i]!.key.split(';')) {
      const data = edgeFitByToken.get(token);
      if (data) list.push(data);
    }
    chainEdgeDataByRoot.set(root, list);
  }

  // Line anchor: the FULL-PRECISION mean of the chain's own real run
  // endpoints (never a rounded or fit-input point) -- any point
  // genuinely ON the chosen line works as an anchor for
  // `projectOntoLine`, and this one costs no precision. Also the
  // fallback centroid for whichever axis an authored-axis-constrained
  // line (below) does NOT determine (its z for a vertical wall, x for
  // a horizontal one) -- irrelevant to that line's own direction, which
  // has zero component along it, but harmless and cheap to have on
  // hand regardless.
  const anchorSumByRoot = new Map<number, WorldPos>();
  const anchorCountByRoot = new Map<number, number>();
  for (let i = 0; i < rawRuns.length; i++) {
    const root = fitChainUf.find(i);
    const sum = anchorSumByRoot.get(root) ?? { x: 0, z: 0 };
    sum.x += rawRuns[i]!.start.x + rawRuns[i]!.end.x;
    sum.z += rawRuns[i]!.start.z + rawRuns[i]!.end.z;
    anchorSumByRoot.set(root, sum);
    anchorCountByRoot.set(root, (anchorCountByRoot.get(root) ?? 0) + 2);
  }

  // One line per fit-group: an authored-axis-constrained line
  // (`authoredAxisLine`) when the group's own edges declare one, else
  // the continuous total-least-squares fit over the same edges'
  // boundary-pair midpoints -- rpg-dnd5e-web#799's two-tier mechanism,
  // see this module's own header doc, seam-fit section.
  const lineByRoot = new Map<number, { dir: WorldPos; centroid: WorldPos }>();
  for (const [root, edgeData] of chainEdgeDataByRoot) {
    const rawAnchor = {
      x: anchorSumByRoot.get(root)!.x / anchorCountByRoot.get(root)!,
      z: anchorSumByRoot.get(root)!.z / anchorCountByRoot.get(root)!,
    };
    const axisLine = authoredAxisLine(edgeData, rawAnchor);
    if (axisLine) {
      lineByRoot.set(root, axisLine);
      continue;
    }
    const fit = fitLineDirection(edgeData.map((e) => e.mid));
    if (fit) lineByRoot.set(root, { dir: fit.dir, centroid: rawAnchor });
  }

  const runs: MutableRun[] = rawRuns.map((r, i) => {
    const root = fitChainUf.find(i);
    const fitted = extentAlongLine(r.start, r.end, lineByRoot.get(root));
    return {
      start: fitted.start,
      end: fitted.end,
      key: r.key,
      facing: r.facing,
    };
  });

  // Corner closure (rpg-dnd5e-web#793, and its T-junction fix from
  // Copilot review on PR #794 -- see this module's own header doc,
  // corners section, for the full "why"). Cluster every run endpoint
  // (both ends of every run) by shared RAW (pre-fit) vertex position
  // FIRST, then close each cluster of 2+ members in ONE shot -- the
  // previous pairwise version rewrote the same endpoint once per pair
  // it appeared in, which is order-dependent and never converges to
  // one shared joint at a T-junction (3+ runs meeting one vertex,
  // explicitly supported by computeAuthoredWallRuns). Each member's
  // own fitted corner position and direction (toward the corner, from
  // its run's OTHER/far endpoint) is captured HERE, before any
  // cluster's joint is applied -- so a run whose far endpoint is
  // itself part of a DIFFERENT cluster never has its direction
  // computed from an already-moved neighbor.
  const CORNER_EPS = 1e-6;
  const cornerEnds: Array<'start' | 'end'> = ['start', 'end'];
  interface CornerEndpointSnapshot {
    runIndex: number;
    end: 'start' | 'end';
    corner: WorldPos;
    dir: WorldPos;
  }
  const clusters: Array<{
    rawPoint: WorldPos;
    members: CornerEndpointSnapshot[];
  }> = [];
  for (let i = 0; i < rawRuns.length; i++) {
    for (const end of cornerEnds) {
      const rawPoint = rawRuns[i]![end];
      let cluster = clusters.find(
        (c) => distance(c.rawPoint, rawPoint) < CORNER_EPS
      );
      if (!cluster) {
        cluster = { rawPoint, members: [] };
        clusters.push(cluster);
      }
      const run = runs[i]!;
      const corner = run[end];
      const far = end === 'start' ? run.end : run.start;
      cluster.members.push({
        runIndex: i,
        end,
        corner,
        dir: unitDirection(far, corner), // toward the corner
      });
    }
  }

  for (const cluster of clusters) {
    if (cluster.members.length < 2) continue; // no corner/junction at this endpoint

    // `cornerJoint` always returns a point -- the already-proven exact
    // line intersection for a two-run corner, the least-squares joint
    // for a three-or-more-run T-junction, or the shared RAW vertex
    // itself when the lines are too close to parallel to solve
    // reliably. Every member of the cluster gets assigned relative to
    // THAT joint, unconditionally -- including the fallback case, so
    // a near-parallel pair still closes as documented instead of
    // silently keeping its independently-fitted (disagreeing)
    // position.
    const joint = cornerJoint(
      cluster.rawPoint,
      cluster.members.map((m) => ({ point: m.corner, dir: m.dir }))
    );

    for (const m of cluster.members) {
      runs[m.runIndex]![m.end] = {
        x: joint.x + m.dir.x * DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN,
        z: joint.z + m.dir.z * DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN,
      };
    }
  }

  // Pass 1: finalize every door's gap geometry against the FITTED
  // `runs` (the run INDEX each `DoorInfo` found is valid against both
  // `rawRuns` and `runs` -- same length, same order, no runs added or
  // removed).
  const plans: DoorPlan[] = [];
  for (const info of doorInfos) {
    const { doorway: d, from, to, mid, rawDir, rawRotationY } = info;
    const ref = info.aRef ?? info.bRef;

    let gapCenter = mid;
    let dir = rawDir;
    let rotationY = rawRotationY;
    if (ref) {
      const refRun = runs[ref.runIndex]!;
      const refNear = ref.end === 'start' ? refRun.start : refRun.end;
      const refFar = ref.end === 'start' ? refRun.end : refRun.start;
      const lineDir = unitDirection(refFar, refNear);
      // Orient the run's line direction to agree with the door's own
      // raw edge direction (a run's start/end order is arbitrary --
      // authoredWallRuns.ts's own doc: "the run's own start/end may
      // match either direction the chain happened to walk from").
      const agrees = lineDir.x * rawDir.x + lineDir.z * rawDir.z >= 0;
      dir = agrees ? lineDir : { x: -lineDir.x, z: -lineDir.z };
      gapCenter = projectOntoLine(mid, refNear, dir);
      rotationY = Math.atan2(-dir.z, dir.x);
    }

    const halfGap = DOOR_FRAME_CALIBRATED_WIDTH / 2;
    // gapStart sits on the `a`-corner side (dir was oriented to agree
    // with a->b), gapEnd on the `b`-corner side -- see the force-close
    // pass below, which relies on this correspondence.
    const gapStart: WorldPos = {
      x: gapCenter.x - dir.x * halfGap,
      z: gapCenter.z - dir.z * halfGap,
    };
    const gapEnd: WorldPos = {
      x: gapCenter.x + dir.x * halfGap,
      z: gapCenter.z + dir.z * halfGap,
    };

    plans.push({
      doorway: d,
      from,
      to,
      gapCenter,
      gapStart,
      gapEnd,
      rotationY,
      aRef: info.aRef,
      bRef: info.bRef,
    });
  }

  // Pass 2: force every flanking run to meet its door's own gap
  // boundary EXACTLY -- Kirk's live-walk finding ("the gap is what I
  // am most concerned with", a screenshot showing bare floor on both
  // sides of the frame): the engine's own corner-based trim and this
  // module's midpoint-based gap placement are two independent
  // computations that only approximately agree. Overwriting the
  // flanking run's endpoint with the gap's own boundary point removes
  // the second computation's independence entirely -- they meet by
  // construction, the same defect class ("the walls do not touch",
  // pre-#787) closed the same way it was closed the first time.
  for (const plan of plans) {
    if (plan.aRef) {
      const run = runs[plan.aRef.runIndex]!;
      if (plan.aRef.end === 'start') run.start = plan.gapStart;
      else run.end = plan.gapStart;
    }
    if (plan.bRef) {
      const run = runs[plan.bRef.runIndex]!;
      if (plan.bRef.end === 'start') run.start = plan.gapEnd;
      else run.end = plan.gapEnd;
    }
  }

  // Pass 3: propagate ONE facing per connected chain. Two runs are in
  // the same chain if they share a real endpoint (ordinary fragmentation
  // adjacency) or are the two runs one door's own gap now provably
  // connects (their endpoints sit on opposite sides of the frame, so
  // they never coincide, but the physical wall is continuous through
  // it) -- Kirk's live-walk finding: "one side is facing one way and
  // the other is the other."
  const uf = new RunUnionFind(runs.length);
  const ENDPOINT_EPS = 1e-6;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const ri = runs[i]!;
      const rj = runs[j]!;
      const shares =
        distance(ri.start, rj.start) < ENDPOINT_EPS ||
        distance(ri.start, rj.end) < ENDPOINT_EPS ||
        distance(ri.end, rj.start) < ENDPOINT_EPS ||
        distance(ri.end, rj.end) < ENDPOINT_EPS;
      if (shares) uf.union(i, j);
    }
  }
  for (const plan of plans) {
    if (plan.aRef && plan.bRef)
      uf.union(plan.aRef.runIndex, plan.bRef.runIndex);
  }
  // Flip (negate) a disagreeing run's OWN facing to agree with its
  // component's reference -- NOT replaced with the reference value
  // itself. `facing` is always perpendicular to the RUN IT CAME FROM
  // (computeAuthoredWallRuns derives it from that run's own direction);
  // WallRunMesh compares it against a naive orientation it derives from
  // that SAME run's own start/end to decide whether to flip a tile's
  // texture. Overwriting a run's facing with a DIFFERENT run's value
  // (one perpendicular to a different direction, however close) would
  // desync that comparison instead of fixing it. Negating a run's own
  // facing preserves "perpendicular to this run's own line" exactly
  // while correcting only which of the two perpendiculars it names.
  const referenceFacingByRoot = new Map<number, WorldPos>();
  for (let i = 0; i < runs.length; i++) {
    const root = uf.find(i);
    const reference = referenceFacingByRoot.get(root);
    if (!reference) {
      referenceFacingByRoot.set(root, runs[i]!.facing);
      continue; // this run IS the component's reference; keep its own value
    }
    const facing = runs[i]!.facing;
    const agrees = facing.x * reference.x + facing.z * reference.z >= 0;
    if (!agrees) {
      runs[i]!.facing = { x: -facing.x, z: -facing.z };
    }
  }

  const doorGaps: DoorGapPiece[] = plans.map((plan) => ({
    key:
      plan.doorway.connection ||
      `door:${coordToKey(plan.from)}|${coordToKey(plan.to)}`,
    connection: plan.doorway.connection,
    position: plan.gapCenter,
    leafPosition: plan.gapStart,
    rotationY: plan.rotationY,
  }));

  return { wallRuns: runs, doorGaps };
}

export type { CubeCoord };
