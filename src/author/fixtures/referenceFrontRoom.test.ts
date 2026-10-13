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
    // moves on and this is a snapshot at `29206a48`, not the live file.
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

  it('carries the goblin’s two lines verbatim — the priced checks moved onto them', () => {
    // rpg-project#569 R2: the threat and the appeal that were the goblin's
    // `intimidate:`/`persuade:` checks are two OPTIONS at the same DCs, each
    // carrying the rows its faction's four social tables used to hold.
    expect(goblin().options).toEqual([
      {
        id: 'lean-on-it',
        say: "Where's the cellar? Tell me or you're next.",
        check: [{ ability: 'intimidation', dc: 12 }],
        success: [
          {
            weight: 70,
            say: "Fine! FINE. The cellar door is behind the barrels. Just don't.",
            fact: 'goblin-cowed',
          },
          { weight: 30, say: 'Boss! BOSS!', flee: {} },
        ],
        failure: [{ say: 'Big talk, for someone standing in my doorway.' }],
      },
      {
        id: 'talk-it-round',
        say: "We're not here for you. Where did the bandits go?",
        check: [{ ability: 'persuasion', dc: 10 }],
        success: [
          {
            say: 'Bandits took the cellar. Go left at the rope, and mind the third step.',
          },
        ],
        failure: [
          {
            weight: 100,
            say: "Cellar's empty, friend. Nothing down there but rats. Straight on through.",
            fact: 'cellar-is-clear',
          },
        ],
      },
    ]);
  });

  it('carries the arms the author named, unread by this module', () => {
    const doc = goblin();
    expect(doc.actions).toEqual(['dnd5e:weapons:scimitar']);
  });

  it('carries no social table: the four keys retired to the goblin’s lines', () => {
    const doc = referenceFrontRoomDoc();
    expect(goblin(doc).on).toBeUndefined();
    for (const faction of doc.factions)
      for (const trigger of faction.on ?? [])
        expect(trigger.trigger).toBe('time');
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
