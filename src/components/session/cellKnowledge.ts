/**
 * cellKnowledge — what this seat knows about each cell, read off what the
 * server sent and nothing else (fog of war, rpg-project#586, design R1–R5).
 *
 * # Three states, and only two of them are ever drawn
 *
 * - **seen** — the cell is in `GetViewResponse.visible_cells`: this seat's
 *   own character sees it now. Drawn lit.
 * - **remembered** — the cell is in the atlas but not in `visible_cells`:
 *   learned once, not seen now. Drawn in the remembered treatment
 *   (`sceneKnowledge.REMEMBERED_TINT`).
 * - **absent** — the cell is not in the atlas. It has no entry here at all,
 *   so nothing downstream can draw it, tint it or grade an edge into it.
 *
 * `visible_cells` is a subset of the atlas by the wire's contract. A visible
 * cell the atlas does not list is therefore NOT drawn: the atlas is the
 * authority for what exists for this seat, the view only says which known
 * cells are lit. Unknown space is never invented from a view.
 *
 * An EMPTY `visible_cells` is not "sees nothing": it draws every atlas cell
 * seen (see `cellKnowledge`), because the wire cannot tell it from a server
 * that does not send the field.
 *
 * # The soft edge
 *
 * The boundary between seen and remembered is a short gradient over at most
 * two cells (design Law "Soft edges, no wedges"). A remembered cell one step
 * from a seen cell gets `EDGE_WEIGHTS[0]` of the lit treatment, two steps
 * `EDGE_WEIGHTS[1]`, beyond that none. Steps are walked through ATLAS cells
 * only, so a gradient never reaches into, or across, an absent cell.
 *
 * # What this module refuses
 *
 * It computes no visibility. There is no line of sight, no ray, no cone and
 * no polygon here, and nothing downstream may add one: which cells are seen
 * is the server's answer, derived from the one sight test the engine runs.
 */

import {
  coordToKey,
  getHexNeighbors,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** A drawn cell's state. Absent cells have no state: they are not in the map. */
export type CellState = 'seen' | 'remembered';

/** How much of the lit treatment a remembered cell keeps, by its step count
 * from the nearest seen cell (index 0 = adjacent). Two entries: the gradient
 * is at most two cells wide. */
export const EDGE_WEIGHTS: readonly [number, number] = [2 / 3, 1 / 3];

export interface CellKnowledge {
  /** Every atlas cell, keyed `coordToKey(positionToCube(cell))` — the same key
   * the scene's floor tiles use. */
  readonly state: ReadonlyMap<string, CellState>;
  /** Remembered cells inside the soft edge, by the same key, with their
   * `EDGE_WEIGHTS` value. Seen cells and cells beyond two steps are absent. */
  readonly edge: ReadonlyMap<string, number>;
}

const keyOf = (cell: Pick<Position, 'x' | 'y'>): string =>
  coordToKey(positionToCube(cell));

const cubeOfKey = (key: string): CubeCoord => {
  const [x, y, z] = key.split(',').map(Number);
  return { x: x!, y: y!, z: z! };
};

/**
 * The per-cell state for one seat: `atlasCells` are the cells this seat
 * knows (the atlas), `visibleCells` the ones it sees now (the view).
 */
export function cellKnowledge(
  atlasCells: readonly Pick<Position, 'x' | 'y'>[],
  visibleCells: readonly Pick<Position, 'x' | 'y'>[]
): CellKnowledge {
  // AN EMPTY `visible_cells` DRAWS EVERY ATLAS CELL SEEN — today's look.
  // proto3 cannot tell an absent repeated field from an empty one, so a
  // server that predates the field and a seat that sees nothing would arrive
  // identically. An all-grey screen is therefore never the fallback. The api
  // contract (fog of war T4) closes the gap from the other side: a seat that
  // truly sees nothing is still sent its own cell, so empty keeps meaning
  // "the server does not know".
  const unknown = visibleCells.length === 0;
  const visible = new Set(visibleCells.map(keyOf));
  const state = new Map<string, CellState>();
  for (const cell of atlasCells) {
    const key = keyOf(cell);
    state.set(key, unknown || visible.has(key) ? 'seen' : 'remembered');
  }

  // Breadth-first from every seen cell, through atlas cells only, at most
  // EDGE_WEIGHTS.length steps. The first visit is the shortest distance.
  const edge = new Map<string, number>();
  let frontier = [...state].flatMap(([key, s]) => (s === 'seen' ? [key] : []));
  for (let step = 0; step < EDGE_WEIGHTS.length; step++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const neighbour of getHexNeighbors(cubeOfKey(key))) {
        const nk = coordToKey(neighbour);
        if (state.get(nk) !== 'remembered' || edge.has(nk)) continue;
        edge.set(nk, EDGE_WEIGHTS[step]!);
        next.push(nk);
      }
    }
    frontier = next;
  }
  return { state, edge };
}

/**
 * How much of the lit treatment a drawn cell takes: 1 seen, the edge weight
 * inside the soft edge, 0 remembered beyond it. `undefined` for a cell the
 * knowledge does not list (absent — never drawn).
 */
export function litWeight(
  knowledge: CellKnowledge,
  key: string
): number | undefined {
  const s = knowledge.state.get(key);
  if (s === undefined) return undefined;
  if (s === 'seen') return 1;
  return knowledge.edge.get(key) ?? 0;
}

/**
 * The brightest state among the cells a fixed thing borders (design Law: walls
 * and doors take the brightest state of the cells they border). Seen beats
 * remembered; cells the knowledge does not list count for nothing. A thing the
 * atlas presented whose bordering cells are all unlisted is remembered: it was
 * sent, and nothing says it is seen now.
 */
export function brightestBorderState(
  knowledge: CellKnowledge,
  cellKeys: Iterable<string>
): CellState {
  for (const key of cellKeys) {
    if (knowledge.state.get(key) === 'seen') return 'seen';
  }
  return 'remembered';
}
