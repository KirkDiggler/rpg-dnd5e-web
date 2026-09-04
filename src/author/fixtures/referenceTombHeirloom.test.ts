import { describe, expect, it } from 'vitest';
import { emitDungeon, parseDungeon } from '../dungeonYaml';
import { referenceTombDoc } from './referenceTomb';
import {
  REFERENCE_TOMB_HEIRLOOM_YAML,
  referenceTombHeirloomDoc,
} from './referenceTombHeirloom';

describe('the heirloom tomb is the toolkit’s own file', () => {
  // THE BYTES, PINNED. Not "it parses" and not "it has a vault" — the
  // literal text, so a copy that drifts from the toolkit's testdata fails
  // here rather than in a walk. The values below are read off the toolkit
  // file at commit 48c72498; changing one means the toolkit changed and
  // this copy has to be re-taken, which is exactly the conversation this
  // test is meant to force.
  it('carries the toolkit fixture’s own text, line for line', () => {
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'key: reference-tomb-heirloom'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      '  - { id: entrance, at: [1, 3] }'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'scenarios:\n  recover-the-artifact:\n    artifact: heirloom\n    exit: entrance\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain('knows: [vault] }');
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'blocks_movement: false, blocks_los: false, holdable: true }'
    );
  });

  it('parses every field this slice adds', () => {
    const doc = referenceTombHeirloomDoc();
    expect(doc.exits).toEqual([{ id: 'entrance', at: expect.anything() }]);
    expect(doc.scenarios).toEqual({
      'recover-the-artifact': { artifact: 'heirloom', exit: 'entrance' },
    });
    const captain = doc.place.find((p) => p.id === 'captain');
    expect(captain?.knows).toEqual(['vault']);
    // NO BOSS FLAG. This dungeon ends because a scenario says so (design
    // R8) — a boss flag here would end the run when the captain fell,
    // before anybody could loot the way in, and the whole path-2 win
    // would be unreachable.
    expect(captain?.boss).toBeUndefined();
    const heirloom = doc.place.find((p) => p.id === 'heirloom');
    expect(heirloom?.holdable).toBe(true);
    expect(doc.regions.find((r) => r.id === 'vault')?.concealed).toBe(true);
    expect(doc.doors.find((d) => d.id === 'vault')?.concealed).toHaveLength(2);
  });

  it('re-emits and re-parses byte-for-byte', () => {
    const once = emitDungeon(referenceTombHeirloomDoc());
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });

  it('leaves the plain tomb exactly as it was', () => {
    // The slice adds a fixture; it does not edit one. A tomb that grew an
    // exit or a scenario here would change what every existing test and
    // the seeded content mean.
    const plain = referenceTombDoc();
    expect(plain.exits).toEqual([]);
    expect(plain.scenarios).toEqual({});
    expect(plain.place.every((p) => p.id === undefined)).toBe(true);
    expect(plain.place.every((p) => p.holdable === undefined)).toBe(true);
    expect(plain.place.every((p) => p.knows === undefined)).toBe(true);
    // And the bytes it emits are unchanged: every new field is written
    // only when it has a value, which is what keeps this true.
    const bytes = emitDungeon(plain);
    expect(bytes).not.toContain('exits:');
    expect(bytes).not.toContain('scenarios:');
    // No PLACEMENT carries an id — `- { id:` is the flow-map shape a
    // placement is emitted in; regions and doors have always had ids and
    // are written as block maps.
    expect(bytes).not.toContain('- { id:');
    expect(bytes).not.toContain('holdable:');
    expect(bytes).not.toContain('knows:');
  });
});
