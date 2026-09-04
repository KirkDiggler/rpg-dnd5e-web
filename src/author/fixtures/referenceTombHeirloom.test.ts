import { describe, expect, it } from 'vitest';
import { emitDungeon, intelHolders, parseDungeon } from '../dungeonYaml';
import { referenceTombDoc } from './referenceTomb';
import {
  REFERENCE_TOMB_HEIRLOOM_YAML,
  referenceTombHeirloomDoc,
} from './referenceTombHeirloom';

describe('the heirloom tomb is the toolkit’s own file', () => {
  // THE BYTES, PINNED — and pinned on bytes PRETTIER WOULD CHANGE, which
  // is the whole difficulty. The pre-commit hook formats `*.yaml`, and
  // prettier respaces flow sequences and breaks flow maps across lines; it
  // had already done that to `reference-tomb.yaml` without any test
  // noticing, because the assertions there only named substrings prettier
  // leaves alone. So `src/author/fixtures/*.yaml` is in `.prettierignore`
  // and the first assertion below is a tightly-packed row that would not
  // survive a formatting pass.
  //
  // Read off the toolkit file at `rulebooks/dnd5e/encounter/v0.58.0`. Changing one of these
  // means the toolkit changed and this copy has to be re-taken, which is
  // exactly the conversation this test exists to force.
  it('carries the toolkit fixture’s own text, byte for byte', () => {
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      '      - [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'key: reference-tomb-heirloom'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'exits:\n  - { id: entrance, at: [1, 3] }\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'scenarios:\n  recover-the-artifact:\n    artifact: heirloom\n    exit: entrance\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      '  - { id: captain, ref: "dnd5e:monsters:skeleton-captain", at: [23,5], targeting: closest,\n      holds: [vault-map] }\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      'intel:\n  - id: vault-map\n    reveals: { door: vault }\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      '  - id: hall-notes\n    reveals: { door: vault }\n'
    );
    expect(REFERENCE_TOMB_HEIRLOOM_YAML).toContain(
      '      blocks_movement: false, blocks_los: false, holdable: true }\n'
    );
  });

  it('parses every field this slice adds', () => {
    const doc = referenceTombHeirloomDoc();
    expect(doc.exits).toEqual([{ id: 'entrance', at: expect.anything() }]);
    expect(doc.scenarios).toEqual({
      'recover-the-artifact': { artifact: 'heirloom', exit: 'entrance' },
    });
    const captain = doc.place.find((p) => p.id === 'captain');
    // KNOWLEDGE IS A RECORD NOW (rpg-project#372 R1): the captain holds
    // the vault map, and the map is what says which door it opens. That
    // indirection is the whole tool — the same record could later be
    // carried by a second guard or reveal something that is not a door,
    // and none of it touches this line.
    expect(captain?.holds).toEqual(['vault-map']);
    // TWO RECORDS, ONE DOOR (R6). The second is on a holdable scroll in
    // the hall, so the vault can be opened by picking something up rather
    // than by winning the dungeon's hardest fight — which is what makes
    // the tool walkable at all.
    expect(doc.intel).toEqual([
      { id: 'vault-map', reveals: { door: 'vault' } },
      { id: 'hall-notes', reveals: { door: 'vault' } },
    ]);
    const scroll = doc.place.find((p) => p.holds?.includes('hall-notes'));
    expect(scroll?.holdable).toBe(true);
    expect(intelHolders(doc, 'hall-notes')).toEqual([scroll?.id]);
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
    expect(plain.place.every((p) => p.holds === undefined)).toBe(true);
    expect(plain.intel).toEqual([]);
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
    expect(bytes).not.toContain('holds:');
    expect(bytes).not.toContain('intel:');
  });
});
