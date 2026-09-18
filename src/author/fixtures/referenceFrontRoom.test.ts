// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emitDungeon, parseDungeon, type PlacementDoc } from '../dungeonYaml';
import {
  REFERENCE_FRONT_ROOM_SHA256,
  REFERENCE_FRONT_ROOM_YAML,
  referenceFrontRoomDoc,
} from './referenceFrontRoom';

/** The goblin, found by the author's own id rather than by index, so a
 * reorder of the file cannot silently move what these assertions read. */
function goblin(doc = referenceFrontRoomDoc()): PlacementDoc {
  const found = doc.place.find((p) => p.id === 'front-goblin');
  if (!found) throw new Error('the front room has no `front-goblin` placement');
  return found;
}

describe('the reference front room is the server’s own file', () => {
  it('parses the file the compiler compiles, byte for byte', () => {
    // The copy exists so the builder's fixture and the server's fixture are
    // ONE text. A formatter, a hand-edit, or upstream drift breaks that
    // silently, and no other test would notice — so the bytes are pinned.
    expect(
      createHash('sha256').update(REFERENCE_FRONT_ROOM_YAML).digest('hex')
    ).toBe(REFERENCE_FRONT_ROOM_SHA256);
    expect(REFERENCE_FRONT_ROOM_YAML).toContain('key: reference-front-room');
  });

  it('loads at all — the four keys the builder used to refuse', () => {
    // Before #1118 this threw `place[0]: unknown key "actions"` and the
    // room could not be opened. Every assertion below is downstream of
    // this one: the front room's authoring began with it not loading.
    expect(() => parseDungeon(REFERENCE_FRONT_ROOM_YAML)).not.toThrow();
  });

  it('carries the goblin’s social checks verbatim', () => {
    const doc = goblin();
    expect(doc.intimidate).toEqual([{ ability: 'intimidation', dc: 12 }]);
    expect(doc.persuade).toEqual([{ ability: 'persuasion', dc: 10 }]);
  });

  it('carries the arms the author named, unread by this module', () => {
    const doc = goblin();
    expect(doc.actions).toEqual(['dnd5e:weapons:scimitar']);
  });

  it('reads the answer table in the author’s own order', () => {
    const doc = goblin();
    expect(doc.on?.map((t) => t.trigger)).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
  });

  it('reads each entry’s weight, line and single word', () => {
    const doc = goblin();
    const table = new Map(doc.on?.map((t) => [t.trigger, t.entries]));

    // A landed threat, 70/30. The weight is authored and kept; the line is
    // carried verbatim; each entry does exactly ONE thing.
    expect(table.get('intimidated')).toEqual([
      {
        weight: 70,
        say: "Fine! FINE. The cellar door is behind the barrels. Just don't.",
        word: { word: 'fact', value: 'goblin-cowed' },
      },
      {
        weight: 30,
        say: 'Boss! BOSS!',
        word: { word: 'flee' },
      },
    ]);

    // ABSENT WEIGHT IS NOT ZERO. This entry authored no weight, which means
    // 1 to the engine; defaulting it to 100 here would rewrite the author's
    // odds, and writing `weight: 1` back would be a silent edit.
    expect(table.get('intimidate_failed')).toEqual([
      { say: 'Big talk, for someone standing in my doorway.' },
    ]);

    expect(table.get('persuaded')).toEqual([
      {
        say: 'Bandits took the cellar. Go left at the rope, and mind the third step.',
      },
    ]);

    // The lie is a fact like any other — an id with no truth bit, exactly
    // as the engine wants it.
    expect(table.get('persuade_failed')).toEqual([
      {
        weight: 100,
        say: "Cellar's empty, friend. Nothing down there but rats. Straight on through.",
        word: { word: 'fact', value: 'cellar-is-clear' },
      },
    ]);
  });

  it('keeps the dispositions that make a neutral goblin possible', () => {
    const doc = referenceFrontRoomDoc();
    expect(doc.factions.map((f) => f.id)).toEqual(['goblins', 'bandits']);
    expect(doc.dispositions.map((d) => [d.between, d.stance])).toEqual([
      [['goblins', 'party'], 'neutral'],
      [['bandits', 'party'], 'hostile'],
    ]);
  });

  it('re-emits and re-parses byte-for-byte', () => {
    const once = emitDungeon(parseDungeon(REFERENCE_FRONT_ROOM_YAML));
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });
});
