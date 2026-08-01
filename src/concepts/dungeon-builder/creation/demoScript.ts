/**
 * demoScript — "play the pitch": Kirk's own words (2026-08-01), scripted
 * over the REAL creation board via the SAME `CreationActions` a user's
 * own clicks call — not a separate slideshow/fake renderer. Every step
 * mutates the same state a manual click-drag session would, so pausing
 * mid-script and taking over by hand continues from wherever it stopped
 * with zero special-casing.
 *
 * "20x30 room -> 2d top down board -> draw the walls in place -> start
 * here, end there -> add door here, monster there, reaper statue there
 * facing this way -> load up and play."
 */
import {
  hEdgeKey,
  type CreationGrid,
  type CreationState,
} from './creationTypes';
import type { CreationActions } from './useCreationState';

export interface DemoStep {
  caption: string;
  holdMs: number;
  /** Receives live state too — not just actions — because a couple of
   * steps (rotating the just-placed statue's facing) need to know the ID
   * `addPlacement` generated for the PREVIOUS step, which isn't
   * predictable from this static script alone. */
  run: (actions: CreationActions, state: CreationState) => void;
}

const DIVIDER_ROW = 14;
const DIVIDER_COLS = [5, 6, 7, 8, 9, 10, 11, 12];
const DOOR_COL = 8;

export function buildDemoScript(grid: CreationGrid): DemoStep[] {
  const steps: DemoStep[] = [];

  steps.push({
    caption: `Start with a room: ${grid.width}×${grid.height} — the homage size.`,
    holdMs: 1100,
    run: (actions) => actions.resetGrid(grid),
  });

  // "Draw the walls in place" — one segment at a time, so it visibly
  // draws rather than snapping in all at once.
  DIVIDER_COLS.forEach((col, i) => {
    steps.push({
      caption: 'Draw the walls in place — carving the room in two.',
      holdMs: 90,
      run: (actions) =>
        actions.toggleWall(hEdgeKey(col, DIVIDER_ROW), 'solid', true),
    });
    if (i === DIVIDER_COLS.length - 1) steps[steps.length - 1].holdMs = 500;
  });

  steps.push({
    caption: 'A door between the two halves.',
    holdMs: 900,
    run: (actions) =>
      actions.toggleWall(hEdgeKey(DOOR_COL, DIVIDER_ROW), 'door', true),
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
    run: (actions) =>
      actions.addPlacement(
        'monster',
        'dnd5e:monsters:skeleton-captain',
        [5, 18]
      ),
  });

  steps.push({
    caption: 'The reaper statue, right by the door —',
    holdMs: 700,
    run: (actions) =>
      actions.addPlacement('prop', 'dnd5e:props:statue-reaper', [10, 15]),
  });
  steps.push({
    caption: 'facing this way —',
    holdMs: 550,
    run: (actions, state) => {
      const last = state.placements[state.placements.length - 1];
      if (last) actions.rotateFacing(last.id, 1);
    },
  });
  steps.push({
    caption: 'no, this way.',
    holdMs: 900,
    run: (actions, state) => {
      const last = state.placements[state.placements.length - 1];
      if (last) actions.rotateFacing(last.id, 1);
    },
  });

  steps.push({
    caption: 'Load up and play.',
    holdMs: 1400,
    run: () => {},
  });

  return steps;
}

export { DIVIDER_COLS, DIVIDER_ROW, DOOR_COL };
