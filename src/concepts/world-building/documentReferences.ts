/**
 * WHAT NAMES A SITE NOUN, AND RENAMING IT EVERYWHERE (rpg-project#578).
 *
 * The cast's law (rpg-project#575) applied to concealments and exits: a
 * rename rewrites every reference in the draft in the same edit, and a
 * remove is refused while anything still names the noun, naming what does.
 * A dangling name is a file the toolkit refuses (`intel[i].reveals
 * .concealment`, `scenarios.<id>.<field>`), so the studio never writes one.
 *
 * What can name them: an intel record's `reveals.concealment`, and any
 * scenario binding's value. A door's Hidden by is the concealment's own
 * `props`, so it travels with the concealment; no predicate form names a
 * concealment or an exit, so endings never do.
 */
import type { SiteScope } from './siteScope';

/** Each thing in the draft that names this concealment, in words. */
export function concealmentReferrers(scope: SiteScope, id: string): string[] {
  return [
    ...(scope.intel ?? [])
      .filter(
        (record) =>
          'concealment' in record.reveals && record.reveals.concealment === id
      )
      .map((record) => `intel ${record.id}`),
    ...scenarioReferrers(scope, id),
  ];
}

/** Each scenario binding whose value is this id: "scenario hold-out exit". */
export function scenarioReferrers(scope: SiteScope, id: string): string[] {
  return Object.entries(scope.scenarios ?? {}).flatMap(([scenario, fields]) =>
    Object.entries(fields)
      .filter(([, value]) => value === id)
      .map(([field]) => `scenario ${scenario} ${field}`)
  );
}

/** The refusal for removing a noun something still names. */
export function stillNamedRefusal(
  noun: string,
  referrers: readonly string[]
): string {
  return `${noun} is still named by ${referrers.join(', ')}. Change or remove those first.`;
}

/** Every scenario binding naming `from` names `to` instead. */
export function renameScenarioReferences(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  if (!scope.scenarios) return scope;
  return {
    ...scope,
    scenarios: Object.fromEntries(
      Object.entries(scope.scenarios).map(([scenario, fields]) => [
        scenario,
        Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [
            field,
            value === from ? to : value,
          ])
        ),
      ])
    ),
  };
}

/** Every intel record revealing concealment `from` reveals `to` instead. */
export function renameRevealReferences(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  if (!scope.intel) return scope;
  return {
    ...scope,
    intel: scope.intel.map((record) =>
      'concealment' in record.reveals && record.reveals.concealment === from
        ? { ...record, reveals: { concealment: to } }
        : record
    ),
  };
}
