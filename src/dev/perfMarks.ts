import { isDevLike } from '../devMode';

/**
 * The benchmark harness's timing points (rpg-project ideas/benchmark-keep,
 * law Harness, B11). A mark fires only in a development-like build
 * (`isDevLike()`: development or bench) AND when the page URL carries
 * `?perfMarks` (presence, any value). Otherwise it is a no-op, so production
 * pays one predicate check per call site.
 *
 * Names are the harness's contract with `tools/browser/bench/` in game-dev;
 * change one only together with the driver that reads it.
 */
export type PerfMarkName =
  | 'studio:open:start'
  | 'studio:open:decoded'
  | 'studio:open:imported'
  | 'studio:open:first-paint'
  | 'studio:regions:rendered'
  | 'studio:stroke:commit'
  | 'studio:stroke:painted'
  | 'studio:preview:sent'
  | 'studio:preview:returned'
  | 'play:atlas:requested'
  | 'play:atlas:received'
  | 'play:scene:built'
  | 'play:first-frame';

export function perfMarksEnabled(): boolean {
  if (!isDevLike()) return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('perfMarks');
}

export function mark(name: PerfMarkName): void {
  if (!perfMarksEnabled()) return;
  if (typeof performance === 'undefined' || !performance.mark) return;
  performance.mark(name);
}

/**
 * Marks that wait for a render: the event that causes a paint arms the
 * mark (the import arms the regions list and the grid; a stroke arms its
 * painted mark), and the component whose commit answers it takes it. A
 * render nothing armed marks nothing, so a remount or an unrelated edit
 * never fakes an open or a stroke.
 */
const armedMarks = new Set<PerfMarkName>();

export function armMark(name: PerfMarkName): void {
  if (!perfMarksEnabled()) return;
  armedMarks.add(name);
}

/** True once per arming: the caller marks now or in a frame callback. */
export function takeArmedMark(name: PerfMarkName): boolean {
  return armedMarks.delete(name);
}

/** Mark `name` now if something armed it. */
export function markIfArmed(name: PerfMarkName): void {
  if (takeArmedMark(name)) mark(name);
}
