import { describe, expect, it } from 'vitest';
import {
  addMonsterOption,
  removeMonsterOption,
  setMonsterFaction,
  setMonsterOption,
} from './monsterOrderEdits';
import {
  addOption,
  addOptionRow,
  nextOptionId,
  patchOption,
  patchOptionApproach,
  removeOption,
  removeOptionApproach,
  removeOptionRow,
} from './optionEdits';
import { addPropOption, removePropOption } from './propBindingEdits';

const line = {
  id: 'gossip',
  say: 'Busy night?',
  check: [{ ability: 'persuasion', dc: 10 }],
};

describe('option list mechanics (rpg-project#569)', () => {
  it('names a new line with an id this binding has not taken', () => {
    expect(nextOptionId(undefined)).toBe('line-1');
    expect(nextOptionId([{ ...line, id: 'line-1' }])).toBe('line-2');
    expect(addOption([line]).map((option) => option.id)).toEqual([
      'gossip',
      'line-1',
    ]);
  });

  it('drops what the engine refuses empty instead of writing it', () => {
    // The last line removed is "none", never `options: []`.
    expect(removeOption([line], 0)).toBeUndefined();
    // The last verdict row removed drops the verdict.
    const answered = addOptionRow(line, 'failure');
    expect(answered.failure).toEqual([{ say: '' }]);
    expect(removeOptionRow(answered, 'failure', 0)).toEqual(line);
    // Clearing the gate deletes the key: the line is always offered.
    const gated = patchOption(line, { requires: { fact: 'feast-tonight' } });
    expect(gated.requires).toEqual({ fact: 'feast-tonight' });
    expect(patchOption(gated, { requires: undefined })).toEqual(line);
    // An emptied tool is no tool.
    expect(patchOptionApproach(line, 0, { tool: undefined }).check[0]).toEqual({
      ability: 'persuasion',
      dc: 10,
    });
  });

  it('keeps an emptied check, so the author meets the engine’s sentence', () => {
    expect(removeOptionApproach(line, 0).check).toEqual([]);
  });

  it('puts lines on a creature and a prop, and removes the binding they leave empty', () => {
    const goblin = addMonsterOption(undefined);
    expect(goblin?.options?.[0].id).toBe('line-1');
    const named = setMonsterOption(goblin, 0, line);
    expect(named).toEqual({ options: [line] });
    expect(removeMonsterOption(named, 0)).toBeUndefined();
    // Editing membership keeps the lines.
    expect(setMonsterFaction(named, 'goblins')).toEqual({
      faction: 'goblins',
      options: [line],
    });
    const altar = addPropOption({ holdable: true });
    expect(altar?.options).toHaveLength(1);
    expect(removePropOption(altar, 0)).toEqual({ holdable: true });
  });
});
