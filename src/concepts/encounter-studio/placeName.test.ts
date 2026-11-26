/**
 * A PLACE IN THE FILE, IN WORDS (rpg-project#983): a path is named from the
 * dialect's own grammar and the draft. It names a location, never what runs.
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import itemsSite from './fixtures/cloak-and-ring-walk.yaml?raw';
import hailSite from './fixtures/hail-site.yaml?raw';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { placeName } from './placeName';

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

describe('placeName', () => {
  it.each([
    [
      'room.room.monsterBindings.gate-1.options[1].failure[0].recognize',
      'gate-1 · line `straggler` · on a miss · recognize',
    ],
    ['intel[4]', 'record `kitchen-way`'],
    ['factions[1].options[0]', 'loyalists · line `yield`'],
    [
      'behaviorDefinitions.captain-policy.recipe.states.ready.transitions[2]',
      'captain-policy · in `ready` · transition 3',
    ],
    ['room.room.doorBindings.gate-wall-door', 'door `gate-wall-door`'],
    ['(engine rule)', 'an engine rule'],
    [
      'room.room.monsterBindings.gate-1.posts.alert.pass',
      'gate-1 · post in `alert` · pass',
    ],
    [
      'room.room.propBindings.grate.options[0].success[0].relocate',
      'grate · line `to-chapel` · on a win · relocate',
    ],
    ['concealments.kitchen-passage', 'secret `kitchen-passage`'],
    ['interactions.front-gate', 'conversation `front-gate`'],
    ['endings[1]', 'ending `king-deposed`'],
    ['exits[0]', 'exit `postern`'],
    ['room.room.monsterDeclarations[2]', 'captain'],
  ])('%s → %s', (path, words) => {
    expect(placeName(path, castle)).toBe(words);
  });

  it('a shape it does not know falls back to the last two segments in words', () => {
    expect(placeName('play.party.sharing', castle)).toBe('party · sharing');
    expect(placeName('mystery[3].thing', castle)).toBe('mystery 4 · thing');
  });

  it('a line, row or thing the draft no longer holds is said plainly, never as an invented id', () => {
    // gate-1 has fewer than 40 lines: the stale index is "line 40".
    expect(
      placeName('room.room.monsterBindings.gate-1.options[39].check', castle)
    ).toBe('gate-1 · line 40 · check');
    expect(placeName('intel[99]', castle)).toBe('intel 100');
  });

  it('ids are shown verbatim in code style, never as field words', () => {
    expect(
      placeName(
        'room.room.monsterBindings.gate-1.someField.Kings_Guard',
        castle
      )
    ).toBe('gate-1 · some field · `Kings_Guard`');
  });

  it("a door in a wall's opening keeps its tail; a wall says its opening", () => {
    const wall = castle.draft.room.walls!.findIndex((w) =>
      w.openings.some((o) => o.door)
    );
    const opening = castle.draft.room.walls![wall]!.openings.findIndex(
      (o) => o.door
    );
    const door = castle.draft.room.walls![wall]!.openings[opening]!.door!.id;
    expect(
      placeName(
        `room.room.walls[${wall}].openings[${opening}].door.locked`,
        castle
      )
    ).toBe(`door \`${door}\` · locked`);
    expect(
      placeName(`room.room.walls[${wall}].openings[${opening}].width`, castle)
    ).toBe(`wall ${wall + 1} · opening ${opening + 1} · width`);
  });

  it('never returns nothing', () => {
    expect(placeName('', castle)).toBe('the whole file');
  });
});

describe('placeName on an item', () => {
  it('names the item, then the place inside it', () => {
    const read = readDraftYaml(itemsSite);
    if (!read.ok) throw new Error(read.refusal);
    const document = { draft: read.draft, scope: read.scope };
    const said = placeName('customItems.garrison-ring.slot', document);
    expect(said).toBe('item `garrison-ring` · slot');
  });
});

describe('placeName on a status', () => {
  it('names the status, then the place inside it', () => {
    const read = readDraftYaml(hailSite);
    if (!read.ok) throw new Error(read.refusal);
    const document = { draft: read.draft, scope: read.scope };
    expect(placeName('statuses.welcomed.changes[0]', document)).toContain(
      'status `welcomed`'
    );
  });
});
