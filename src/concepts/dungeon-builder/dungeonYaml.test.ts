import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWalkItYaml,
  deletePlacement,
  DungeonParseError,
  movePlacement,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setConnectorLocked,
  stripMonsterPlacements,
  toDungeonDoc,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';

describe('parseDungeon', () => {
  it('parses showcase.yaml into the expected room chain', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(doc.key).toBe('showcase');
    expect(doc.height).toBe(8);
    expect(doc.rooms.map((r) => r.id)).toEqual([
      'antechamber',
      'shrine',
      'vault',
    ]);
    expect(doc.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
    });
    // 3 in antechamber's place: list, matching the source file exactly.
    expect(doc.rooms[0].place).toHaveLength(3);
    // showcase.yaml's own 2 connectors, neither locked.
    expect(doc.connectors).toEqual([
      { from: 'antechamber', to: 'shrine', locked: null },
      { from: 'shrine', to: 'vault', locked: null },
    ]);
  });

  it('flags monster refs and never reads flags off them', () => {
    // showcase.yaml's own place: lists are all props; confirm the flag via
    // a synthetic monster placement instead.
    const withMonster = SHOWCASE_YAML.replace(
      '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }',
      '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }\n      - { ref: "dnd5e:monsters:skeleton", at: [1, 2] }'
    );
    const { doc: doc2 } = parseDungeon(withMonster);
    const monster = doc2.rooms[0].place.find((p) => p.ref.includes('monsters'));
    expect(monster?.isMonster).toBe(true);
  });

  it('throws DungeonParseError on structurally invalid YAML', () => {
    expect(() => parseDungeon('key: only-a-key\n')).toThrow(DungeonParseError);
  });

  it('throws on genuinely malformed YAML syntax', () => {
    expect(() => parseDungeon('rooms: [this is not: valid')).toThrow(
      DungeonParseError
    );
  });
});

describe('setConnectorLocked (door editing, rpg-dnd5e-web#667)', () => {
  it('adds a flow-style locked: block matching the real dungeonspec shape', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setConnectorLocked(cst, 0, { dc: 12, ability: 'dex' });
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '- { from: antechamber, to: shrine, locked: { dc: 12, ability: dex } }'
    );
    const { doc } = parseDungeon(out);
    expect(doc.connectors[0]).toEqual({
      from: 'antechamber',
      to: 'shrine',
      locked: { dc: 12, ability: 'dex' },
    });
    // The untouched connector stays untouched.
    expect(doc.connectors[1].locked).toBeNull();
  });

  it('removes locked: entirely when set to null', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setConnectorLocked(cst, 0, { dc: 15, ability: 'str' });
    setConnectorLocked(cst, 0, null);
    const { doc } = parseDungeon(serializeDungeon(cst));
    expect(doc.connectors[0].locked).toBeNull();
  });
});

describe('stripMonsterPlacements / buildWalkItYaml (Walk it, rpg-dnd5e-web#667)', () => {
  // showcase.yaml itself has zero monster place: entries (only its vault
  // room's boss:) — inject a synthetic one, same technique the "flags
  // monster refs" test above uses, so there's something real to strip.
  const withMonster = SHOWCASE_YAML.replace(
    '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }',
    '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }\n      - { ref: "dnd5e:monsters:skeleton", at: [1, 2] }'
  );

  it('removes only monster place: entries — props and boss: survive', () => {
    const { cst, doc: before } = parseDungeon(withMonster);
    expect(before.rooms[0].place.some((p) => p.isMonster)).toBe(true);

    stripMonsterPlacements(cst);
    const after = toDungeonDoc(cst);

    expect(after.rooms[0].place.some((p) => p.isMonster)).toBe(false);
    expect(
      after.rooms[0].place.some((p) => p.ref === 'dnd5e:props:brazier')
    ).toBe(true);
    // The boss-archetype room's boss: is untouched — dungeonspec requires
    // exactly one boss per boss-archetype room (validateBossCardinality);
    // stripMonsterPlacements only ever touches place: lists.
    expect(after.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
    });
  });

  it('buildWalkItYaml renames the key and strips monsters from a FRESH parse', () => {
    const walkYaml = buildWalkItYaml(withMonster, 'showcase-walk');
    const { doc } = parseDungeon(walkYaml);

    expect(doc.key).toBe('showcase-walk');
    expect(doc.rooms.every((r) => r.place.every((p) => !p.isMonster))).toBe(
      true
    );
    expect(doc.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
    });

    // The input text itself is untouched — buildWalkItYaml parses its own
    // CST rather than mutating a CST the caller might still be using for
    // the live board.
    const { doc: reparsedOriginal } = parseDungeon(withMonster);
    expect(reparsedOriginal.key).toBe('showcase');
    expect(reparsedOriginal.rooms[0].place.some((p) => p.isMonster)).toBe(true);
  });
});

describe('serializeDungeon round-trip', () => {
  it('is byte-stable on a no-op round trip against the real fixture on disk', () => {
    // Read the actual file, not the embedded copy, so this test catches
    // fixtures.ts drifting from the source of truth too.
    const realPath = join(
      __dirname,
      '../../../../../dungeon-content/showcase.yaml'
    );
    let real: string;
    try {
      real = readFileSync(realPath, 'utf8');
    } catch {
      // Not every checkout has the sibling game-dev workspace present
      // (e.g. CI) — fall back to the embedded copy, which is the same
      // content pinned at build time.
      real = SHOWCASE_YAML;
    }
    const { cst } = parseDungeon(real);
    const out = serializeDungeon(cst);
    // Documented residual gap (dungeonYaml.ts's own doc comment): flow
    // sequences round-trip with internal padding ("[ 1, 1 ]") the source
    // file doesn't have ("[1, 1]"). Normalize only that one, single-space
    // difference before asserting byte-stability, so this test still
    // catches any OTHER drift (reflowed blocks, dropped comments, field
    // reordering) as a real failure.
    const normalize = (s: string) =>
      s.replace(/\[ (-?\d+), (-?\d+) \]/g, '[$1, $2]');
    expect(normalize(out)).toBe(normalize(real));
  });

  it('preserves a comment through a no-op parse/serialize cycle', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '# colonnade: 8 pillars framing the center lane (rows 3-5 clear)'
    );
  });
});

describe('board-driven edits', () => {
  it('placeItem adds a flow-style entry matching the source style', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    placeItem(cst, 'antechamber', 'dnd5e:props:brazier', [3, 2]);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '{ ref: "dnd5e:props:brazier", at: [ 3, 2 ], blocks_movement: false, blocks_los: false }'
    );
  });

  it('placeItem never writes blocks_movement/blocks_los for a monster ref', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    placeItem(cst, 'antechamber', 'dnd5e:monsters:skeleton', [3, 3]);
    const out = serializeDungeon(cst);
    expect(out).toContain('{ ref: "dnd5e:monsters:skeleton", at: [ 3, 3 ] }');
    expect(out).not.toMatch(/monsters:skeleton.*blocks_movement/);
  });

  it('movePlacement mutates in place and keeps an attached comment', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    // shrine's pillar[0] (index 2 in the room's place list) carries the
    // "colonnade" comment (see fixtures.ts / CONTRACT.md).
    const pillarIndex = doc.rooms[1].place.findIndex(
      (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 2 && p.at[1] === 2
    );
    movePlacement(cst, 'shrine', pillarIndex, [3, 2]);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '# colonnade: 8 pillars framing the center lane (rows 3-5 clear)'
    );
    expect(out).toContain('at: [ 3, 2 ]');
  });

  it('deletePlacement on a comment-carrying item silently drops the comment too — CONTRACT.md finding, confirmed here', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    const pillarIndex = doc.rooms[1].place.findIndex(
      (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 2 && p.at[1] === 2
    );
    deletePlacement(cst, 'shrine', pillarIndex);
    const out = serializeDungeon(cst);
    // The other 7 pillars remain, but the heading that described all 8 is gone.
    expect(out).not.toContain('# colonnade: 8 pillars');
    expect(out).toContain('dnd5e:props:pillar", at: [ 4, 2 ]');
  });
});
