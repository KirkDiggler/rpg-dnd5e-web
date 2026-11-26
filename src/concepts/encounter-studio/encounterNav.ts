/**
 * THE ENCOUNTER SIDE IS PEOPLE AND PLACES (rpg-project#970). The operator
 * ruled the grouping on 2026-11-16 ("grouping looks good"): four groups,
 * each a short row of sections, the side opening on People → Cast. Tables
 * and Scenarios have no section.
 *
 * The section KEYS are the ones every jump already names (refusals,
 * read-back connections, thread links); only the screen's words changed.
 * `dispositions` is shown inside Sides with the factions: how the sides
 * stand is read with who they are.
 */
export type EncounterSectionKey =
  | 'cast'
  | 'factions'
  | 'dispositions'
  | 'party'
  | 'interactions'
  | 'concealments'
  | 'endings'
  | 'intel'
  | 'facts'
  | 'behaviours'
  | 'bundles'
  | 'items';

export type EncounterGroupLabel =
  | 'People'
  | 'Places'
  | 'What is known'
  | 'Pieces';

export interface EncounterGroup {
  label: EncounterGroupLabel;
  sections: { key: EncounterSectionKey; label: string }[];
}

export const ENCOUNTER_GROUPS: readonly EncounterGroup[] = [
  {
    label: 'People',
    sections: [
      { key: 'cast', label: 'Cast' },
      { key: 'factions', label: 'Sides' },
      { key: 'party', label: 'Party' },
      { key: 'interactions', label: 'Conversations' },
    ],
  },
  {
    label: 'Places',
    sections: [
      { key: 'concealments', label: 'Secrets' },
      { key: 'endings', label: 'Ways out' },
    ],
  },
  {
    label: 'What is known',
    sections: [
      { key: 'intel', label: 'Records' },
      { key: 'facts', label: 'Threads' },
    ],
  },
  {
    label: 'Pieces',
    sections: [
      { key: 'behaviours', label: 'Behaviours' },
      { key: 'bundles', label: 'Bundles' },
      { key: 'items', label: 'Items' },
    ],
  },
];

/** A key shown inside another key's section. */
const SHOWN_IN: Partial<Record<EncounterSectionKey, EncounterSectionKey>> = {
  dispositions: 'factions',
};

export const DEFAULT_ENCOUNTER_SECTION: EncounterSectionKey = 'cast';

/** Where a section key is shown: its group, the section that shows it, and
 * that section's on-screen word. */
export function sectionPlaceOf(key: EncounterSectionKey): {
  group: EncounterGroupLabel;
  section: EncounterSectionKey;
  label: string;
} {
  const shown = SHOWN_IN[key] ?? key;
  for (const group of ENCOUNTER_GROUPS)
    for (const section of group.sections)
      if (section.key === shown)
        return { group: group.label, section: shown, label: section.label };
  throw new Error(`section ${key} is in no group`);
}
