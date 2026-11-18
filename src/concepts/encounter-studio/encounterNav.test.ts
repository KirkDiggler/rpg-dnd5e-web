/**
 * THE ENCOUNTER SIDE IS PEOPLE AND PLACES (rpg-project#970, ruled
 * 2026-11-16: "grouping looks good"): four groups, each a short row of
 * sections; the file's keys do not change, and every section key a jump
 * names lands in one of them.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENCOUNTER_SECTION,
  ENCOUNTER_GROUPS,
  sectionPlaceOf,
} from './encounterNav';

describe('the Encounter side’s groups and sections', () => {
  it('names the four ruled groups and their sections, in order', () => {
    expect(
      ENCOUNTER_GROUPS.map((group) => [
        group.label,
        group.sections.map((section) => section.label),
      ])
    ).toEqual([
      ['People', ['Cast', 'Sides', 'Party', 'Conversations']],
      ['Places', ['Secrets', 'Ways out']],
      ['What is known', ['Records', 'Threads']],
      ['Pieces', ['Behaviours', 'Bundles']],
    ]);
  });

  it('opens on People → Cast', () => {
    expect(DEFAULT_ENCOUNTER_SECTION).toBe('cast');
    expect(sectionPlaceOf('cast')).toEqual({
      group: 'People',
      section: 'cast',
      label: 'Cast',
    });
  });

  it('every key a jump names lands in its ruled section', () => {
    expect(sectionPlaceOf('factions').label).toBe('Sides');
    expect(sectionPlaceOf('dispositions')).toEqual({
      group: 'People',
      section: 'factions',
      label: 'Sides',
    });
    expect(sectionPlaceOf('interactions').label).toBe('Conversations');
    expect(sectionPlaceOf('concealments').label).toBe('Secrets');
    expect(sectionPlaceOf('endings').label).toBe('Ways out');
    expect(sectionPlaceOf('intel').label).toBe('Records');
    expect(sectionPlaceOf('facts').label).toBe('Threads');
    expect(sectionPlaceOf('behaviours').group).toBe('Pieces');
    expect(sectionPlaceOf('bundles').group).toBe('Pieces');
  });

  it('offers no Tables and no Scenarios', () => {
    const labels = ENCOUNTER_GROUPS.flatMap((group) =>
      group.sections.map((section) => section.label)
    );
    expect(labels).not.toContain('Tables');
    expect(labels).not.toContain('Scenarios');
  });
});
