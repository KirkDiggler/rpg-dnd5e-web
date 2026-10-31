/**
 * The one predicate the benchmark harness's gates read: is this build
 * development-like? True for the `development` vite mode and for the `bench`
 * mode (`npm run build:bench`: production bundling and minification with the
 * harness's gates open), false for `production`, `test` and anything else.
 *
 * Only these five gates read it (rpg-project ideas/benchmark-keep plan.md
 * G12, amended: the bench build opens every gate the harness needs): the Dev
 * player fallback in `api/auth.ts`, the `?playerId` override in `App.tsx`,
 * the perf probe mounts, the `performance.mark` points in `dev/perfMarks.ts`,
 * and the Dev player's composition world in
 * `compositions/rpcCompositionSource.ts`. Every other development-only affordance keeps its own
 * `MODE === 'development'` check, so a bench bundle carries no dev tooling.
 * Do not route another gate through here without amending that law.
 */
export function isDevLike(mode: string = import.meta.env.MODE): boolean {
  return mode === 'development' || mode === 'bench';
}
