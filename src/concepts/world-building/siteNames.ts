/**
 * THE NAMES THE FILE DEFINES, FOR A FORM TO OFFER (rpg-project#975). A
 * row's grant picks a record, a region or a topic by name; the form offers
 * what this site defines, never a free guess at an id:
 *
 * - records: the site's `intel` ids;
 * - regions: the site's regions, by id with their names;
 * - topics: every topic the file mentions — granted by a line's row or a
 *   conversation's outcome, or asked for by a `recognized:` requirement.
 *   A topic is declared by mention, so the form also takes a new one typed.
 *
 * Provided once at the document's root (`WorldBuildingConcept`), as the
 * bundles are; a form outside it offers nothing and keeps what is written.
 */
import { createContext } from 'react';
import { grantedTopics } from './interactionOutcomes';
import type { SiteScope } from './siteScope';

export interface SiteNames {
  readonly records: readonly string[];
  readonly regions: readonly { readonly id: string; readonly name: string }[];
  readonly topics: readonly string[];
}

export const NO_SITE_NAMES: SiteNames = Object.freeze({
  records: [],
  regions: [],
  topics: [],
});

export const SiteNamesContext = createContext<SiteNames>(NO_SITE_NAMES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every topic a list of lines grants or asks for. */
function lineTopics(options: unknown, into: Set<string>): void {
  if (!Array.isArray(options)) return;
  const asked = (requirement: unknown): void => {
    if (Array.isArray(requirement)) return requirement.forEach(asked);
    if (!isRecord(requirement)) return;
    if (typeof requirement.recognized === 'string')
      into.add(requirement.recognized);
    if (requirement.not !== undefined) asked(requirement.not);
  };
  for (const option of options) {
    if (!isRecord(option)) continue;
    asked(option.requires);
    for (const verdict of ['success', 'failure'] as const) {
      const rows = option[verdict];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const topic =
          isRecord(row) && isRecord(row.recognize)
            ? row.recognize.topic
            : undefined;
        if (typeof topic === 'string' && topic !== '') into.add(topic);
      }
    }
  }
}

export function siteNamesOf(
  scope: Readonly<SiteScope>,
  room: {
    readonly regions?: readonly { id: string; name?: string }[];
    readonly monsterBindings?: Readonly<Record<string, unknown>>;
  }
): SiteNames {
  const topics = new Set<string>(grantedTopics(scope));
  for (const binding of Object.values(room.monsterBindings ?? {}))
    if (isRecord(binding)) lineTopics(binding.options, topics);
  for (const faction of scope.factions ?? [])
    lineTopics((faction as { options?: unknown }).options, topics);
  return {
    records: (scope.intel ?? []).map((record) => record.id),
    regions: (room.regions ?? []).map((region) => ({
      id: region.id,
      name: region.name || region.id,
    })),
    topics: [...topics].sort(),
  };
}
