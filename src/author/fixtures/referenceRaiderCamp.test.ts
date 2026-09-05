import { describe, expect, it } from 'vitest';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';
import {
  doorCrossing,
  emitDungeon,
  floorOwners,
  intelHolders,
  parseDungeon,
  wallsThrough,
} from '../dungeonYaml';
import { factionRefusals } from '../factionRules';
import { axialKey } from '../hexOffset';
import {
  REFERENCE_RAIDER_CAMP_YAML,
  referenceRaiderCampDoc,
} from './referenceRaiderCamp';
import { referenceTombHeirloomDoc } from './referenceTombHeirloom';

/**
 * ASSERTS ONLY WHAT DESIGN §1 AND THE PLAN FIX, on purpose: the file is
 * the toolkit's own bytes (`referenceRaiderCamp.ts` cites the commit and
 * the sha256), and re-taking it when the toolkit changes must touch one
 * file. So: the lines §1 spells out, the three regions the plan names,
 * where the letter and the exit and the start are — and nothing about the
 * file's own geometry.
 */
describe('the raider camp is design §1’s file, step A', () => {
  it('carries the design’s own lines, on bytes prettier would change', () => {
    // A tightly-packed row — prettier would respace it, which is why the
    // fixtures are in `.prettierignore` and why this line is asserted.
    expect(REFERENCE_RAIDER_CAMP_YAML).toMatch(
      /\n {6}- \[\[\d+,\d+\],\[\d+,\d+\]/
    );
    expect(REFERENCE_RAIDER_CAMP_YAML).toContain('key: reference-raider-camp');
    expect(REFERENCE_RAIDER_CAMP_YAML).toContain(
      'factions:\n  - { id: raiders, mind: chief }\n'
    );
    expect(REFERENCE_RAIDER_CAMP_YAML).toContain(
      'dispositions:\n  - { between: [raiders, party], stance: hostile, until: { fact: saved-wiseman } }\n'
    );
    expect(REFERENCE_RAIDER_CAMP_YAML).toContain(
      'reveals: { fact: saved-wiseman }'
    );
    expect(REFERENCE_RAIDER_CAMP_YAML).toContain(
      'scenarios:\n  hold-out: { convince: raiders }\n'
    );
    // STEP A: no arrivals, and no reinforcement placements (the header
    // may SAY the word; no `place[]` entry is one).
    expect(REFERENCE_RAIDER_CAMP_YAML).not.toContain('arrives:');
    expect(
      referenceRaiderCampDoc().place.some((p) =>
        (p.id ?? '').startsWith('reinforcement')
      )
    ).toBe(false);
  });

  it('parses every field the slice adds', () => {
    const doc = referenceRaiderCampDoc();
    expect(doc.factions).toEqual([{ id: 'raiders', mind: 'chief' }]);
    expect(doc.dispositions).toEqual([
      {
        between: ['raiders', 'party'],
        stance: 'hostile',
        until: { fact: 'saved-wiseman' },
      },
    ]);
    expect(doc.intel).toEqual([
      { id: 'wisemans-letter', reveals: { fact: 'saved-wiseman' } },
    ]);
    const chief = doc.place.find((p) => p.id === 'chief');
    const scout = doc.place.find((p) => p.id === 'scout');
    const letter = doc.place.find((p) => p.id === 'letter');
    expect(chief?.faction).toBe('raiders');
    expect(scout?.faction).toBe('raiders');
    expect(letter?.holdable).toBe(true);
    expect(intelHolders(doc, 'wisemans-letter')).toEqual(['letter']);
    expect(doc.place.every((p) => p.arrives === undefined)).toBe(true);
    expect(doc.scenarios).toEqual({ 'hold-out': { convince: 'raiders' } });
  });

  it('is the camp the plan names: gate, yard, hut — start at the gate facing the yard, the exit on the letter’s cell', () => {
    const doc = referenceRaiderCampDoc();
    const owners = floorOwners(doc);
    const regionOf = (id: string) => {
      const placement = doc.place.find((p) => p.id === id);
      return placement ? owners.get(axialKey(placement.at)) : undefined;
    };
    expect(doc.regions.map((r) => r.id)).toEqual(['gate', 'yard', 'hut']);
    expect(regionOf('scout')).toBe('yard');
    expect(regionOf('chief')).toBe('hut');
    expect(regionOf('letter')).toBe('gate');
    expect(doc.start).not.toBeNull();
    expect(owners.get(axialKey(doc.start!.at))).toBe('gate');
    expect(doc.start!.facing).toBe('e');
    const letter = doc.place.find((p) => p.id === 'letter')!;
    expect(doc.exits).toEqual([{ id: 'front-gate', at: letter.at }]);
  });

  it('earns no refusal the client can know', () => {
    expect(factionRefusals(referenceRaiderCampDoc())).toEqual([]);
  });

  it('every door stands in a wall and opens a crossing', () => {
    // A structural sanity check on whatever geometry the file carries, not
    // an assertion about this draft's particular wall.
    const doc = referenceRaiderCampDoc();
    for (const door of doc.doors) {
      expect(wallsThrough(doc, door.at)).not.toEqual([]);
      expect(doorCrossing(doc, door)).not.toBeNull();
    }
  });

  it('re-emits and re-parses byte-for-byte', () => {
    const once = emitDungeon(referenceRaiderCampDoc());
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });

  it('opens in the Concepts Lab on `?authorFixture=raider-camp`', () => {
    expect(sandboxDocForSearch('?authorFixture=raider-camp').key).toBe(
      'reference-raider-camp'
    );
  });

  it('is built from monsters that exist: skeletons led by the skeleton captain', () => {
    const doc = referenceRaiderCampDoc();
    expect(doc.place.find((p) => p.id === 'chief')?.ref).toBe(
      'dnd5e:monsters:skeleton-captain'
    );
    expect(doc.place.find((p) => p.id === 'scout')?.ref).toBe(
      'dnd5e:monsters:skeleton'
    );
  });

  it('leaves the heirloom tomb exactly as it was', () => {
    // A7: every existing dungeon plays under the default factions. The
    // tomb declares none, and its bytes carry none of the new keys.
    const tomb = referenceTombHeirloomDoc();
    expect(tomb.factions).toEqual([]);
    expect(tomb.dispositions).toEqual([]);
    expect(tomb.place.every((p) => p.faction === undefined)).toBe(true);
    const bytes = emitDungeon(tomb);
    expect(bytes).not.toContain('factions:');
    expect(bytes).not.toContain('dispositions:');
    expect(bytes).not.toContain('faction:');
    expect(bytes).not.toContain('arrives:');
  });
});
