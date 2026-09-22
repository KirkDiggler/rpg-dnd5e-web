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

describe('the reference front room is a pinned snapshot of the server’s file', () => {
  it('is the bytes taken at the pinned sha', () => {
    // The copy exists so the builder's fixture and the server's fixture were
    // ONE text WHEN IT WAS TAKEN. A formatter or a hand-edit breaks that
    // silently, and no other test would notice — so the bytes are pinned.
    // The hash does NOT prove the copy still matches upstream: the server
    // moves on and this is a snapshot at `1f2a6ac8`, not the live file.
    expect(
      createHash('sha256').update(REFERENCE_FRONT_ROOM_YAML).digest('hex')
    ).toBe(REFERENCE_FRONT_ROOM_SHA256);
    expect(REFERENCE_FRONT_ROOM_YAML).toContain('key: reference-front-room');
  });

  it('loads at all — the grammar the builder used to refuse', () => {
    // The room's authoring began with it not loading: before #1118 it threw
    // `place[0]: unknown key "actions"`, and before #1137 the shipped grammar
    // — `time`, `when:`, `temper` and the mix — was still refused. Every
    // assertion below is downstream of this one.
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

  it('reads the faction’s answer table in the author’s own order', () => {
    // THE TABLE MOVED TO THE FACTION (rpg-project#466): four goblins answer
    // ONE table, and a table on one placement cannot be shared. The placement
    // therefore authors no table of its own, which is what inheritance means.
    const doc = referenceFrontRoomDoc();
    expect(goblin(doc).on).toBeUndefined();
    expect(doc.factions[0].on?.map((t) => t.trigger)).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
  });

  it('reads each entry’s weight, word and condition', () => {
    const doc = referenceFrontRoomDoc();
    const table = new Map(
      doc.factions[0].on?.map((t) => [t.trigger, t.entries])
    );

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
