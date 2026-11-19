/**
 * WHAT EACH CREATURE SAW (rpg-project#1016), in words, from the record's
 * `sighted` beats (rpg-toolkit encounter sightedbeat.go): `gained` is who
 * came into the observer's view, `lost` who left it. The frame is fixed
 * ("now sees", "no longer sees"); the names are the watch's display names.
 * Nothing is said that the beat does not say.
 */
import { namedId } from './runSpeech';
import type { StepSight } from './runView';

const nameOf = (id: string, names?: ReadonlyMap<string, string>): string =>
  names?.get(id) ?? id;

/** One line per observer whose sight came or went this step: "Guard
 * (gate-1) now sees Bard", "… no longer sees Bard". `changed` and
 * `knowledge` alone are not a change of sight and make no line. */
export function sightLinesOf(
  sights: readonly StepSight[],
  names?: ReadonlyMap<string, string>
): string[] {
  const lines: string[] = [];
  for (const s of sights) {
    const who = namedId(s.observer, names);
    if (s.gained.length > 0)
      lines.push(
        `${who} now sees ${s.gained.map((id) => nameOf(id, names)).join(', ')}`
      );
    if (s.lost.length > 0)
      lines.push(
        `${who} no longer sees ${s.lost.map((id) => nameOf(id, names)).join(', ')}`
      );
  }
  return lines;
}

/** One observer's sight this step, in full, for a title or a section:
 * every part the beat carries. Empty when it says none. */
export function sightTextOf(
  s: StepSight,
  names?: ReadonlyMap<string, string>
): string {
  const list = (ids: readonly string[]) =>
    ids.map((id) => nameOf(id, names)).join(', ');
  const parts: string[] = [];
  if (s.gained.length > 0) parts.push(`now sees ${list(s.gained)}`);
  if (s.lost.length > 0) parts.push(`no longer sees ${list(s.lost)}`);
  if (s.changed.length > 0) parts.push(`saw ${list(s.changed)} change`);
  if (s.knowledge) parts.push('its view of doors or objects changed');
  return parts.join('; ');
}

/** More sight lines than this in one step and they fold to a count. */
export const SIGHT_LINES_SHOWN = 3;
