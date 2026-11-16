/**
 * A PLACE IN THE FILE, IN WORDS (rpg-project#983): a path is named from the
 * dialect's own grammar and the draft. It names a location, never what runs.
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
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

  it('never returns nothing', () => {
    expect(placeName('', castle)).toBe('the whole file');
  });
});
