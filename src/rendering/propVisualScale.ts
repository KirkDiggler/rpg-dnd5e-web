/** Render valid supplied visual scale exactly. Editor slider limits are an
 * authoring affordance, not a second runtime clamp on canonical presentation.
 * Legacy callers with invalid/missing numbers retain a neutral fallback. */
export function propVisualScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}
