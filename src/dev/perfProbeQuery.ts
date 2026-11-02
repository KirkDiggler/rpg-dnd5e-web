import { parsePerfProbeWindowMs } from '../components/playtest/playtestMapHelpers';
import { isDevLike } from '../devMode';

export interface PerfProbeQuery {
  windowMs: number | undefined;
  label: string | undefined;
}

/**
 * The one gate every `DevPerfProbe` mount reads (EncounterMap, the session
 * canvas, the studio 3D view). Active only in a development-like build
 * (`isDevLike()`: development or the benchmark harness's bench build) AND
 * with `?perfProbe` (presence, any value) in the URL; never in production
 * regardless of query string. Optional `?perfProbeMs=<n>` overrides the
 * sampling window (validated by `parsePerfProbeWindowMs`); optional
 * `?perfProbeLabel=<slug>` stamps a label onto the result.
 */
export function readPerfProbeQuery(
  search: string = typeof window === 'undefined' ? '' : window.location.search
): PerfProbeQuery | null {
  if (!isDevLike()) return null;
  const params = new URLSearchParams(search);
  if (!params.has('perfProbe')) return null;
  return {
    windowMs: parsePerfProbeWindowMs(params.get('perfProbeMs')),
    label: params.get('perfProbeLabel') ?? undefined,
  };
}
