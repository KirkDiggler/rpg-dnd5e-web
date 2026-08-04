/**
 * demoScript — "play the pitch": Kirk's own words (2026-08-01), scripted
 * over the REAL creation board via the SAME mutators a user's own clicks
 * call (dungeonYaml.ts's `placeItem`/`setStart`/`setWallEdge`/etc., since
 * the CST unification — see CONTRACT.md's "unifying New Dungeon onto the
 * shared CST" section) — not a separate slideshow/fake renderer. Every
 * step mutates the same document a manual click-drag session would, so
 * pausing mid-script and taking over by hand continues from wherever it
 * stopped with zero special-casing.
 *
 * "20x30 room -> 2d top down board -> draw the walls in place -> start
 * here, end there -> add door here, monster there, reaper statue there
 * facing this way -> load up and play."
 *
 * **HEX-TRUE (2026-08-03)**: the divider wall used to be hand-transcribed
 * as one `[col,DIVIDER_ROW]`-`[col,DIVIDER_ROW+1]` segment per column in
 * `DIVIDER_COLS` — a pattern that drew a straight, fully-connected line
 * under the old square-grid geometry. Under real hex geometry it does
 * NOT connect (verified numerically while building this unit: consecutive
 * segments in that pattern land ~20px apart, a genuine gap, not a
 * continuous run) — a square-grid assumption baked into hand-picked
 * coordinates, exactly the kind of thing this round's brief called out.
 * The fix is to stop hand-picking coordinates at all: `traceEdgeRun`
 * (`creationGeometry.ts`) samples a straight world-space line through the
 * SAME `nearestEdge` a live drag calls, so the wall run this script draws
 * is provably whatever the interactive tool would draw for the same
 * gesture, not a second, independently-maintained approximation of it.
 */
import type { WallKind } from '../dungeonYaml';
import {
  creationCellCenter,
  traceEdgeRun,
  wallGeometry,
} from './creationGeometry';
import type { CreationGrid } from './creationTypes';

export interface DemoActions {
  resetGrid: (width: number, height: number) => void;
  toggleWallEdge: (
    from: [number, number],
    to: [number, number],
    kind: WallKind,
    on: boolean
  ) => void;
  setStart: (at: [number, number]) => void;
  setEnd: (at: [number, number]) => void;
  place: (ref: string, at: [number, number]) => void;
  /** Rotates whichever placement was added MOST RECENTLY — resolved
   * fresh against the live document each call (the top-level `place:`
   * list's last entry — TARGET-YAML.md's "top-level placement" section),
   * not a remembered id, since a from-scratch canvas's placements are
   * plain array entries, not the old `CreationState.placements`'
   * locally-generated `p1`/`p2`/... ids. */
  rotateLastFacing: (delta: 1 | -1) => void;
}

export interface DemoStep {
  caption: string;
  holdMs: number;
  run: (actions: DemoActions) => void;
}

const DIVIDER_ROW = 14;
const SPAN_COL_START = 5;
const SPAN_COL_END = 12;
// Kept for the caption/reference sense of "roughly in the middle" — no
// longer used to hand-derive a wall coordinate (see `traceEdgeRun` below).
const DOOR_COL = 8;

export function buildDemoScript(grid: CreationGrid): DemoStep[] {
  const steps: DemoStep[] = [];

  steps.push({
    caption: `Start with a room: ${grid.width}×${grid.height} — the homage size.`,
    holdMs: 1100,
    run: (actions) => actions.resetGrid(grid.width, grid.height),
  });

  // The REAL connected hex wall run a straight drag from (SPAN_COL_START,
  // DIVIDER_ROW) to (SPAN_COL_END, DIVIDER_ROW) would draw — traced
  // through the same `nearestEdge` a live drag calls (see this file's own
  // header comment for why hand-picking coordinates broke under hex).
  // `boundaryY` anchors the trace to the actual world-space boundary
  // between row DIVIDER_ROW and DIVIDER_ROW+1 near the span's middle —
  // `wallGeometry` is pure geometry (it doesn't check `doc.walls`), so
  // this works whether or not that specific edge ends up drawn.
  const boundaryY = wallGeometry(
    [DOOR_COL, DIVIDER_ROW],
    [DOOR_COL, DIVIDER_ROW + 1]
  ).mid.y;
  const spanStart = creationCellCenter(SPAN_COL_START, DIVIDER_ROW);
  const spanEnd = creationCellCenter(SPAN_COL_END, DIVIDER_ROW);
  const dividerRun = traceEdgeRun(
    { x: spanStart.x, y: boundaryY },
    { x: spanEnd.x, y: boundaryY },
    grid
  );

  // "Draw the walls in place" — one segment at a time, so it visibly
  // draws rather than snapping in all at once.
  dividerRun.forEach((edge, i) => {
    steps.push({
      caption: 'Draw the walls in place — carving the room in two.',
      holdMs: i === dividerRun.length - 1 ? 500 : 90,
      run: (actions) =>
        actions.toggleWallEdge(edge.cellA, edge.cellB, 'solid', true),
    });
  });

  // A door roughly in the middle of the traced run — same "pick the
  // midpoint" discipline `regionGeometry.ts`'s `pickAttachmentEdge` uses
  // for a region-attachment door, rather than assuming a specific column
  // is on the run (the traced sequence's exact cells depend on real hex
  // geometry, not a hand-picked coordinate).
  const doorEdge = dividerRun[Math.floor(dividerRun.length / 2)];
  if (doorEdge) {
    steps.push({
      caption: 'A door between the two halves.',
      holdMs: 900,
      run: (actions) =>
        actions.toggleWallEdge(doorEdge.cellA, doorEdge.cellB, 'door', true),
    });
  }

  steps.push({
    caption: 'Start here —',
    holdMs: 700,
    run: (actions) => actions.setStart([8, 8]),
  });
  steps.push({
    caption: 'end there.',
    holdMs: 900,
    run: (actions) => actions.setEnd([8, 20]),
  });

  steps.push({
    caption: 'A monster, guarding the far room.',
    holdMs: 900,
    run: (actions) => actions.place('dnd5e:monsters:skeleton-captain', [5, 18]),
  });

  steps.push({
    caption: 'The reaper statue, right by the door —',
    holdMs: 700,
    run: (actions) => actions.place('dnd5e:props:statue-reaper', [10, 15]),
  });
  steps.push({
    caption: 'facing this way —',
    holdMs: 550,
    run: (actions) => actions.rotateLastFacing(1),
  });
  steps.push({
    caption: 'no, this way.',
    holdMs: 900,
    run: (actions) => actions.rotateLastFacing(1),
  });

  steps.push({
    caption: 'Load up and play.',
    holdMs: 1400,
    run: () => {},
  });

  return steps;
}

export { DIVIDER_ROW, DOOR_COL, SPAN_COL_END, SPAN_COL_START };
