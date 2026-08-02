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
 */
import type { WallKind } from '../dungeonYaml';

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
   * fresh against the live document each call (the synthetic room's
   * last `place:` entry), not a remembered id, since a from-scratch
   * canvas's placements are plain array entries, not the old
   * `CreationState.placements`' locally-generated `p1`/`p2`/... ids. */
  rotateLastFacing: (delta: 1 | -1) => void;
}

export interface DemoStep {
  caption: string;
  holdMs: number;
  run: (actions: DemoActions) => void;
}

const DIVIDER_ROW = 14;
const DIVIDER_COLS = [5, 6, 7, 8, 9, 10, 11, 12];
const DOOR_COL = 8;

export function buildDemoScript(grid: {
  width: number;
  height: number;
}): DemoStep[] {
  const steps: DemoStep[] = [];

  steps.push({
    caption: `Start with a room: ${grid.width}×${grid.height} — the homage size.`,
    holdMs: 1100,
    run: (actions) => actions.resetGrid(grid.width, grid.height),
  });

  // "Draw the walls in place" — one segment at a time, so it visibly
  // draws rather than snapping in all at once.
  DIVIDER_COLS.forEach((col, i) => {
    steps.push({
      caption: 'Draw the walls in place — carving the room in two.',
      holdMs: 90,
      run: (actions) =>
        actions.toggleWallEdge(
          [col, DIVIDER_ROW],
          [col, DIVIDER_ROW + 1],
          'solid',
          true
        ),
    });
    if (i === DIVIDER_COLS.length - 1) steps[steps.length - 1].holdMs = 500;
  });

  steps.push({
    caption: 'A door between the two halves.',
    holdMs: 900,
    run: (actions) =>
      actions.toggleWallEdge(
        [DOOR_COL, DIVIDER_ROW],
        [DOOR_COL, DIVIDER_ROW + 1],
        'door',
        true
      ),
  });

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

export { DIVIDER_COLS, DIVIDER_ROW, DOOR_COL };
