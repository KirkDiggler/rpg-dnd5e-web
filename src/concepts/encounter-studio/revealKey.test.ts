/**
 * WHERE A JUMP LANDS, AS A REVEAL KEY (rpg-project#983): the one path map
 * gives the thing and, where the path names one, the place inside it.
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { keyOfPath, keyOfTarget, nameOfKey } from './revealKey';

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

describe('keyOfPath', () => {
  it.each([
    [
      'room.room.monsterBindings.gate-1.options[1].failure[0].recognize',
      {
        kind: 'creature',
        id: 'gate-1',
        part: 'options[1].failure[0].recognize',
      },
    ],
    ['room.room.monsterDeclarations[2]', { kind: 'creature', id: 'captain' }],
    [
      'room.room.propBindings.grate.options[0]',
      { kind: 'prop', id: 'grate', part: 'options[0]' },
    ],
    [
      'factions[1].options[0]',
      { kind: 'faction', id: 'loyalists', part: 'options[0]' },
    ],
    ['intel[4]', { kind: 'record', id: 'kitchen-way' }],
    [
      'concealments.kitchen-passage.checks',
      { kind: 'concealment', id: 'kitchen-passage', part: 'checks' },
    ],
    ['endings[1].when', { kind: 'ending', id: 'king-deposed', part: 'when' }],
    ['exits[0]', { kind: 'exit', id: 'postern' }],
    ['interactions.front-gate', { kind: 'conversation', id: 'front-gate' }],
    ['dispositions[0].until', { kind: 'disposition', id: '0', part: 'until' }],
    [
      'behaviorDefinitions.captain-policy.recipe.states.ready',
      { kind: 'routine', id: 'captain-policy', part: 'recipe.states.ready' },
    ],
    [
      'room.room.doorBindings.gate-wall-door',
      { kind: 'door', id: 'gate-wall-door' },
    ],
  ])('%s', (path, key) => {
    expect(keyOfPath(path, castle)).toEqual(key);
  });

  it('a path with no thing lands nowhere', () => {
    expect(keyOfPath('(engine rule)', castle)).toBeNull();
    expect(keyOfPath('line 3', castle)).toBeNull();
  });
});

describe('keyOfTarget', () => {
  it('names the thing a target selects or opens', () => {
    expect(keyOfTarget({ kind: 'creature', id: 'captain' })).toEqual({
      kind: 'creature',
      id: 'captain',
    });
    expect(
      keyOfTarget({ kind: 'home', section: 'factions', id: 'garrison' })
    ).toEqual({ kind: 'faction', id: 'garrison' });
    expect(
      keyOfTarget({ kind: 'home', section: 'intel', id: 'kitchen-way' })
    ).toEqual({ kind: 'record', id: 'kitchen-way' });
    expect(keyOfTarget({ kind: 'ending', id: 'freed' })).toEqual({
      kind: 'ending',
      id: 'freed',
    });
  });
  it('a key names its place in words, the way placeName says its path', () => {
    expect(
      nameOfKey(
        { kind: 'creature', id: 'gate-1', part: 'options[1].failure[0]' },
        castle
      )
    ).toBe('gate-1 · line `straggler` · on a miss');
    expect(nameOfKey({ kind: 'record', id: 'kitchen-way' }, castle)).toBe(
      'record `kitchen-way`'
    );
    expect(nameOfKey({ kind: 'join', id: 'j1' }, castle)).toBe('join j1');
  });
});
