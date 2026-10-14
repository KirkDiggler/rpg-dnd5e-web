// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { createCastleS4Document } from './fixtures/castleS4';
import { refusalJumps, type RefusalTarget } from './refusalJump';

/** The castle with a door on a wall, the postern exit, endings, tables,
 * factions, dispositions, intel and the stash concealment. */
function castle(): RoomDraftDocument {
  return createCastleS4Document();
}

function targetOf(
  path: string,
  document: RoomDraftDocument = castle()
): RefusalTarget | null {
  const [jump] = refusalJumps([{ path, message: 'refused' }], document);
  expect(jump).toMatchObject({ path, message: 'refused' });
  return jump!.target;
}

function doorOf(document: RoomDraftDocument, doorId: string) {
  for (const wall of document.draft.room.walls ?? [])
    for (const opening of wall.openings)
      if (opening.door?.id === doorId)
        return { wallId: wall.id, openingId: opening.id };
  throw new Error(`fixture has no door ${doorId}`);
}

describe('refusalJumps', () => {
  it('a monster binding jumps to the creature', () => {
    expect(targetOf('room.room.monsterBindings.gate-1.faction')).toEqual({
      kind: 'creature',
      id: 'gate-1',
    });
  });

  it('a monster declaration by index jumps to that creature', () => {
    const document = castle();
    const second = document.draft.room.monsterDeclarations[1]!.id;
    expect(
      targetOf(
        'room.room.monsterDeclarations[1].startingCell.location',
        document
      )
    ).toEqual({ kind: 'creature', id: second });
  });

  it('a prop binding or declaration jumps to the scene prop', () => {
    expect(targetOf('room.room.propBindings.ledger.intel')).toEqual({
      kind: 'prop',
      id: 'ledger',
    });
    expect(targetOf('room.room.propDeclarations.ledger.footprint')).toEqual({
      kind: 'prop',
      id: 'ledger',
    });
  });

  it('a door binding jumps to the door on its wall', () => {
    const document = castle();
    const { wallId, openingId } = doorOf(document, 'gate-wall-door');
    expect(
      targetOf('room.room.doorBindings.gate-wall-door.locked[0].dc', document)
    ).toEqual({
      kind: 'door',
      target: { kind: 'door', wallId, openingId, doorId: 'gate-wall-door' },
    });
  });

  it("a wall opening's door path jumps to that door", () => {
    const document = castle();
    const walls = document.draft.room.walls ?? [];
    const wallIndex = walls.findIndex((wall) =>
      wall.openings.some((opening) => opening.door?.id === 'gate-wall-door')
    );
    const openingIndex = walls[wallIndex]!.openings.findIndex(
      (opening) => opening.door?.id === 'gate-wall-door'
    );
    const { wallId, openingId } = doorOf(document, 'gate-wall-door');
    expect(
      targetOf(
        `room.room.walls[${wallIndex}].openings[${openingIndex}].door.id`,
        document
      )
    ).toEqual({
      kind: 'door',
      target: { kind: 'door', wallId, openingId, doorId: 'gate-wall-door' },
    });
  });

  it("an exit jumps to the exit's hex", () => {
    const document = castle();
    const index = document.scope.exits!.findIndex(
      (exit) => exit.id === 'postern'
    );
    expect(targetOf(`exits[${index}].cell`, document)).toEqual({
      kind: 'hex',
      cell: document.scope.exits![index]!.cell,
    });
  });

  it('a template jumps to its cast member', () => {
    expect(targetOf('templates.guard.abilities.str')).toEqual({
      kind: 'castMember',
      ref: 'dnd5e:monsters:guard',
    });
  });

  it('tables, factions, dispositions, intel and concealments open their home section', () => {
    const document = castle();
    const faction = document.scope.factions!.findIndex(
      (f) => f.id === 'garrison'
    );
    const intel = document.scope.intel!.findIndex(
      (record) => record.id === 'cooks-ledger'
    );
    expect(targetOf('tables.gate-patrol.time[0].when', document)).toEqual({
      kind: 'home',
      section: 'tables',
      id: 'gate-patrol',
    });
    expect(targetOf(`factions[${faction}].mind`, document)).toEqual({
      kind: 'home',
      section: 'factions',
      id: 'garrison',
    });
    expect(targetOf('factions.garrison.table', document)).toEqual({
      kind: 'home',
      section: 'factions',
      id: 'garrison',
    });
    expect(targetOf('dispositions[0].until', document)).toEqual({
      kind: 'home',
      section: 'dispositions',
    });
    expect(targetOf(`intel[${intel}].reveals`, document)).toEqual({
      kind: 'home',
      section: 'intel',
      id: 'cooks-ledger',
    });
    expect(targetOf('concealments.stash.cells[0]', document)).toEqual({
      kind: 'home',
      section: 'concealments',
      id: 'stash',
    });
  });

  it('an ending jumps to that ending', () => {
    const document = castle();
    const index = document.scope.endings!.findIndex(
      (ending) => ending.id === 'king-slain'
    );
    expect(targetOf(`endings[${index}].when`, document)).toEqual({
      kind: 'ending',
      id: 'king-slain',
    });
  });

  it('an unknown id is a sentence', () => {
    expect(targetOf('room.room.monsterBindings.nobody.faction')).toBeNull();
    expect(targetOf('room.room.propBindings.nothing-here')).toBeNull();
    expect(targetOf('room.room.doorBindings.no-such-door.locked')).toBeNull();
    expect(targetOf('exits[99].cell')).toBeNull();
    expect(targetOf('templates.dragon.base')).toBeNull();
    expect(targetOf('tables.no-table.on')).toBeNull();
    expect(targetOf('concealments.no-secret.cells[0]')).toBeNull();
    expect(targetOf('endings[42].when')).toBeNull();
  });

  it('an empty path is a sentence', () => {
    expect(targetOf('')).toBeNull();
  });

  it('line 12 is a sentence', () => {
    expect(targetOf('line 12')).toBeNull();
  });

  it('a path the studio has no noun for is a sentence', () => {
    expect(targetOf('room.room.partyStart')).toBeNull();
    expect(targetOf('room.room.walls[0].appearance')).toBeNull();
    expect(targetOf('scenarios.siege.gate')).toBeNull();
  });

  it('a deeper tail still jumps', () => {
    expect(
      targetOf('room.room.monsterBindings.gate-1.on.time[0].toward.at')
    ).toEqual({ kind: 'creature', id: 'gate-1' });
  });

  it('keeps every refusal, in order, with its path and message', () => {
    expect(
      refusalJumps(
        [
          { path: 'line 3', message: 'bad indent' },
          { path: 'room.room.monsterBindings.gate-1', message: 'no table' },
        ],
        castle()
      )
    ).toEqual([
      { path: 'line 3', message: 'bad indent', target: null },
      {
        path: 'room.room.monsterBindings.gate-1',
        message: 'no table',
        target: { kind: 'creature', id: 'gate-1' },
      },
    ]);
  });
});
