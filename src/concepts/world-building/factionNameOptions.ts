import { MONSTERS, PARTY } from '@/author/factionVocabulary';
import type { SiteScope } from './siteScope';

/** The ids a `between` may name: the reserved `party` and `monsters` always
 * (they are words, not declarations), plus every declared faction, plus any
 * name this document already carries so a hand-written file is shown as
 * written rather than silently rewritten. */
export function factionNameOptions(
  scope: SiteScope,
  ...values: Array<string | undefined>
): string[] {
  const options = [PARTY, MONSTERS, ...(scope.factions ?? []).map((f) => f.id)];
  for (const value of values) {
    if (value && !options.includes(value)) options.push(value);
  }
  return options;
}
