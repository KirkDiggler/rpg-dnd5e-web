import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  setMonsterFaction,
  setMonsterTable,
  withBinding,
} from './monsterOrderEdits';
import {
  createRoomDraft,
  moveRoomMonster,
  placeRoomMonster,
  removeRoomMonster,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

function source() {
  return encodeSingleRoomDungeon({
    key: 'declarations',
    draft: placeRoomMonster(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1'),
      {
        id: 'guard',
        ref: 'dnd5e:monsters:thug',
        startingCell: { location: { q: 0, r: 0 }, facing: 'ne' },
      }
    ),
  });
}

describe('monster declarations consumer contract', () => {
  it('exports declarations, never the retired monsters key', () => {
    const room = parse(source()).room.room;
    expect(room).not.toHaveProperty('monsters');
    expect(room.monsterDeclarations[0]).toMatchObject({
      id: 'guard',
      startingCell: { facing: 'ne' },
    });
  });

  it('imports, edits, and exports faction-only bindings without putting membership on declarations', () => {
    const doc = parse(source());
    doc.factions = [{ id: 'watch' }];
    doc.room.room.monsterBindings = { guard: { faction: 'watch' } };
    // JSON is also YAML; this exercises the production document reader.
    const imported = decodeSingleRoomDungeon(JSON.stringify(doc));
    const moved = moveRoomMonster(imported.draft, 'guard', { q: 1, r: 0 });
    const yaml = encodeSingleRoomDungeon({ ...imported, draft: moved });
    const room = parse(yaml).room.room;
    expect(room.monsterBindings).toEqual({ guard: { faction: 'watch' } });
    expect(room.monsterDeclarations[0]).not.toHaveProperty('faction');
    expect(room.monsterDeclarations[0].startingCell).toEqual({
      location: { q: 1, r: 0 },
      facing: 'ne',
    });
    expect(
      removeRoomMonster(moved, 'guard').room.monsterBindings
    ).toBeUndefined();
  });

  it('keeps faction-only bindings through edits and clears membership without losing other bindings', () => {
    const bound = setMonsterFaction(undefined, 'watch');
    expect(withBinding(undefined, 'guard', bound)).toEqual({
      guard: { faction: 'watch' },
    });
    const orders = setMonsterTable(bound, 'watch-drill');
    expect(orders).toEqual({ faction: 'watch', table: 'watch-drill' });
    expect(setMonsterTable(orders, undefined)).toEqual(bound);
    expect(setMonsterFaction(orders, undefined)).toEqual({
      table: 'watch-drill',
    });
    expect(
      withBinding(
        { guard: bound! },
        'guard',
        setMonsterFaction(bound, undefined)
      )
    ).toBeUndefined();
  });

  it('preserves carried-only interaction facts when editing membership', () => {
    const facts = {
      intimidate: [{ ability: 'intimidation', dc: 12 }],
      persuade: [{ ability: 'persuasion', dc: 10 }],
    };
    const bound = setMonsterFaction(facts, 'watch');
    expect(withBinding(undefined, 'guard', bound)).toEqual({
      guard: { ...facts, faction: 'watch' },
    });
    expect(setMonsterFaction(bound, undefined)).toEqual(facts);
  });

  it.each([null, '', 12])('rejects invalid binding faction %s', (faction) => {
    const doc = parse(source());
    doc.room.room.monsterBindings = { guard: { faction } };
    expect(() => decodeSingleRoomDungeon(JSON.stringify(doc))).toThrow(
      /faction must be a faction id/
    );
  });

  it('refuses the retired list with migration guidance', () => {
    const doc = parse(source());
    doc.room.room.monsters =
      doc.room.room.monsterDeclarations ?? doc.room.room.monsters;
    delete doc.room.room.monsterDeclarations;
    expect(() => decodeSingleRoomDungeon(JSON.stringify(doc))).toThrow(
      /monsters has been renamed to monsterDeclarations/
    );
  });

  it('refuses declaration-level membership with migration guidance', () => {
    const doc = parse(source());
    const declarations =
      doc.room.room.monsterDeclarations ?? doc.room.room.monsters;
    declarations[0].faction = 'watch';
    expect(() => decodeSingleRoomDungeon(JSON.stringify(doc))).toThrow(
      /faction belongs in monsterBindings/
    );
  });
});
