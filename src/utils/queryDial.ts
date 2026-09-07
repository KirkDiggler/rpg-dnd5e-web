/**
 * Shared "read one query-string dial" helper — extracted out of
 * cameraDials.ts (its own original home) so a second dial module
 * (dice/diceDials.ts, #906) can parse `?dieScale=` the same way cameraDials
 * parses `?zoomMin=`/`?rotateSpeed=`/etc, without a second copy of this
 * function drifting from the first.
 */

/** Finite-number query param, or null when absent/garbage — an empty or
 * non-numeric value falls back to the caller's own default rather than
 * poisoning a dial with NaN. */
export function numberDial(
  params: URLSearchParams,
  key: string
): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
