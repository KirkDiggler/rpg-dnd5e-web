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
  REFERENCE_GOBLIN_CAMP_YAML,
  referenceGoblinCampDoc,
} from './referenceGoblinCamp';
import { referenceTombHeirloomDoc } from './referenceTombHeirloom';

/**
 * ASSERTS ONLY WHAT DESIGN §1 AND THE PLAN FIX, on purpose: the toolkit's
 * canonical bytes replace `reference-goblin-camp.yaml` when they land, and
 * that swap must touch one file. So: the lines §1 spells out, the three
 * regions the plan names, where the letter and the exit and the start are
 * — and nothing about the draft's own geometry.
 */
describe('the goblin camp is design §1’s file, step A', () => {
  it('carries the design’s own lines, on bytes prettier would change', () => {
    // A tightly-packed row — prettier would respace it, which is why the
    // fixtures are in `.prettierignore` and why this line is asserted.
    expect(REFERENCE_GOBLIN_CAMP_YAML).toMatch(
      /\n {6}- \[\[\d+,\d+\],\[\d+,\d+\]/
    );
    expect(REFERENCE_GOBLIN_CAMP_YAML).toContain('key: reference-goblin-camp');
    expect(REFERENCE_GOBLIN_CAMP_YAML).toContain(
      'factions:\n  - { id: goblins, mind: chief }\n'
    );
    expect(REFERENCE_GOBLIN_CAMP_YAML).toContain(
      'dispositions:\n  - { between: [goblins, party], stance: hostile, until: { fact: saved-wiseman } }\n'
    );
    expect(REFERENCE_GOBLIN_CAMP_YAML).toContain(
      'reveals: { fact: saved-wiseman }'
    );
    expect(REFERENCE_GOBLIN_CAMP_YAML).toContain(
      'scenarios:\n  hold-out:\n    convince: goblins\n'
    );
    // STEP A: no arrivals, no reinforcements.
    expect(REFERENCE_GOBLIN_CAMP_YAML).not.toContain('arrives:');
    expect(REFERENCE_GOBLIN_CAMP_YAML).not.toContain('reinforcements');
  });

  it('parses every field the slice adds', () => {
    const doc = referenceGoblinCampDoc();
    expect(doc.factions).toEqual([{ id: 'goblins', mind: 'chief' }]);
    expect(doc.dispositions).toEqual([
      {
        between: ['goblins', 'party'],
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
    expect(chief?.faction).toBe('goblins');
    expect(scout?.faction).toBe('goblins');
    expect(letter?.holdable).toBe(true);
    expect(intelHolders(doc, 'wisemans-letter')).toEqual(['letter']);
    expect(doc.place.every((p) => p.arrives === undefined)).toBe(true);
    expect(doc.scenarios).toEqual({ 'hold-out': { convince: 'goblins' } });
  });

  it('is the camp the plan names: gate, yard, hut — start at the gate facing the yard, the exit on the letter’s cell', () => {
    const doc = referenceGoblinCampDoc();
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
    expect(factionRefusals(referenceGoblinCampDoc())).toEqual([]);
  });

  it('every door stands in a wall and opens a crossing', () => {
    // A structural sanity check on whatever geometry the file carries, not
    // an assertion about this draft's particular wall.
    const doc = referenceGoblinCampDoc();
    for (const door of doc.doors) {
      expect(wallsThrough(doc, door.at)).not.toEqual([]);
      expect(doorCrossing(doc, door)).not.toBeNull();
    }
  });

  it('re-emits and re-parses byte-for-byte', () => {
    const once = emitDungeon(referenceGoblinCampDoc());
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });

  it('opens in the Concepts Lab on `?authorFixture=goblin-camp`', () => {
    expect(sandboxDocForSearch('?authorFixture=goblin-camp').key).toBe(
      'reference-goblin-camp'
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
