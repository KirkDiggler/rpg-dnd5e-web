/**
 * `?orbitPivot=auto` (default, #906 round 3) — the pure state machine
 * behind it. Kirk, first live session, 2026-09-03: "after we move [pivot
 * on me] is good, but if I pan ahead I would expect it to rotate the
 * center of my screen."
 *
 * Rule: the pivot is the mini UNLESS the player has manually panned (WASD
 * or right-drag) since the mini last moved. A manual pan switches the
 * pivot to the view center; the mini moving again, or pressing `F`,
 * switches it back to the mini. `orbitPivot=me`/`view` remain explicit,
 * unconditional overrides that never consult this state at all — see
 * `resolveOrbitPivot` below.
 *
 * One boolean captures the whole rule: has a manual pan happened since the
 * mini's last real move? `true` → pivot on view; `false` → pivot on the
 * mini.
 */

export interface OrbitPivotAutoState {
  readonly pannedSinceMove: boolean;
}

export const INITIAL_ORBIT_PIVOT_AUTO_STATE: OrbitPivotAutoState =
  Object.freeze({ pannedSinceMove: false });

/**
 * - `pan`: a manual WASD or right-drag pan happened.
 * - `miniMoved`: the local player's own mini's world position actually
 *   changed (not a re-render — see useCameraControls.ts's own
 *   `lastFocus`-compared-by-value gate, which is what fires this).
 * - `focusKey`: the player pressed `F`.
 */
export type OrbitPivotAutoEvent = 'pan' | 'miniMoved' | 'focusKey';

/** One transition. Returns the SAME state instance when the event is a
 * no-op (already in that state), so callers can skip work on an unchanged
 * ref. */
export function reduceOrbitPivotAutoState(
  state: OrbitPivotAutoState,
  event: OrbitPivotAutoEvent
): OrbitPivotAutoState {
  switch (event) {
    case 'pan':
      return state.pannedSinceMove ? state : { pannedSinceMove: true };
    case 'miniMoved':
    case 'focusKey':
      return state.pannedSinceMove ? { pannedSinceMove: false } : state;
  }
}

export type OrbitPivotDial = 'auto' | 'view' | 'me';
export type ResolvedOrbitPivot = 'me' | 'view';

/** `me`/`view` are unconditional — they never consult `state`, by design
 * (an explicit dial value is a promise the player can rely on regardless of
 * how they've been moving the camera). Only `auto` reads the state
 * machine. */
export function resolveOrbitPivot(
  mode: OrbitPivotDial,
  state: OrbitPivotAutoState
): ResolvedOrbitPivot {
  if (mode === 'me') return 'me';
  if (mode === 'view') return 'view';
  return state.pannedSinceMove ? 'view' : 'me';
}
