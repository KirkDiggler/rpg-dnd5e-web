/**
 * SET A MACHINE (rpg-project#996): each edit changes exactly the node it
 * names, keeps every key it does not, and the castle written back after an
 * edit differs from the served file only where the edit is.
 */
import { describe, expect, it } from 'vitest';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  newNameRefusal,
  setBehaviorDefinition,
  statesOf,
  stepOf,
  tableKeysOf,
  tableRowsOf,
  transitionsOf,
  withListAdded,
  withStateAdded,
  withStepOn,
  withStepPick,
  withStepReason,
  withStepTo,
  withTableRows,
  withTransitions,
  type Node,
} from './machineEdit';

const GATE = 'gate-1-policy';

function castle() {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return read;
}

/** The castle written back with gate-1-policy set to `edit(definition)`. */
function savedWith(edit: (definition: Node) => Node): string {
  const read = castle();
  const definition = definitionOf(read.scope, GATE)!;
  return exportDraftYaml(
    {
      draft: read.draft,
      scope: setBehaviorDefinition(read.scope, GATE, edit(definition)),
    },
    read.key
  );
}

/** The served lines an edit removed and the lines it added. */
function diff(after: string): { removed: string[]; added: string[] } {
  const a = served.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { removed: a.slice(start, endA), added: b.slice(start, endB) };
}

const alertStep = (definition: Node, index: number) =>
  transitionsOf(definition, 'alert')[index];
const setAlertStep =
  (index: number, edit: (step: unknown) => Node) => (definition: Node) =>
    withTransitions(
      definition,
      'alert',
      transitionsOf(definition, 'alert').map((s, i) =>
        i === index ? edit(alertStep(definition, index)) : s
      )
    );

describe('the castle round-trips', () => {
  it('setting gate-1-policy to itself writes the served file byte for byte', () => {
    expect(savedWith((definition) => definition)).toBe(served);
  });

  it('reads the castle’s gate-1-policy as written', () => {
    const definition = definitionOf(castle().scope, GATE)!;
    expect(statesOf(definition)).toEqual(
      expect.arrayContaining(['alert', 'challenged', 'posted'])
    );
    expect(tableKeysOf(definition)).toEqual(
      expect.arrayContaining(['approached', 'barred', 'post'])
    );
    // alert's fourth step: on barred, to challenged, picks barred and keeps
    // its anchor.
    expect(stepOf(alertStep(definition, 3))).toEqual({
      on: 'barred',
      to: 'challenged',
      pick: 'barred',
      reason: 'walked into him',
      guarded: false,
      otherActs: 1,
    });
  });
});

describe('a step’s edits change exactly that node', () => {
  it('where it goes: one line', () => {
    const { removed, added } = diff(
      savedWith(setAlertStep(3, (step) => withStepTo(step, 'cowed')))
    );
    expect(removed).toEqual(['              to: challenged']);
    expect(added).toEqual(['              to: cowed']);
  });

  it('staying removes its `to` and nothing else', () => {
    const { removed, added } = diff(
      savedWith(setAlertStep(3, (step) => withStepTo(step, null)))
    );
    expect(removed).toEqual(['              to: challenged']);
    expect(added).toEqual([]);
  });

  it('what fires it: one line', () => {
    const { removed, added } = diff(
      savedWith(setAlertStep(3, (step) => withStepOn(step, 'approached')))
    );
    expect(removed).toEqual(['            - on: barred']);
    expect(added).toEqual(['            - on: approached']);
  });

  it('its list: the pick in place, its anchor kept', () => {
    const { removed, added } = diff(
      savedWith(setAlertStep(3, (step) => withStepPick(step, 'post')))
    );
    expect(removed).toEqual(['                - pick: barred']);
    expect(added).toEqual(['                - pick: post']);
  });

  it('its reason: one line', () => {
    const { removed, added } = diff(
      savedWith(setAlertStep(3, (step) => withStepReason(step, 'bumped')))
    );
    expect(removed).toEqual(['              reason: walked into him']);
    expect(added).toEqual(['              reason: bumped']);
  });

  it('a guarded step keeps its condition when it moves elsewhere', () => {
    const definition = definitionOf(castle().scope, GATE)!;
    const before = alertStep(definition, 0) as Node;
    const after = withStepTo(before, 'cowed');
    expect(after.when).toBe(before.when);
    expect(after.to).toBe('cowed');
  });
});

describe('a step’s keys this slice does not edit are kept', () => {
  const step = {
    on: 'time',
    when: { rounds: { op: 'gte', n: 3 } },
    future: { any: 'thing' },
    do: [{ pick: 'post' }, { wake_in: 2 }, { set: { key: 'k', value: 1 } }],
    reason: 'why',
  };

  it('every edit keeps `when`, unknown keys and other acts', () => {
    for (const next of [
      withStepOn(step, 'turn'),
      withStepTo(step, 'alert'),
      withStepPick(step, 'time'),
      withStepReason(step, 'other'),
    ]) {
      expect(next.when).toBe(step.when);
      expect(next.future).toBe(step.future);
      expect(next.do).toEqual(
        expect.arrayContaining([
          { wake_in: 2 },
          { set: { key: 'k', value: 1 } },
        ])
      );
    }
  });

  it('a new `to` takes its place between `when` and `do`', () => {
    expect(Object.keys(withStepTo(step, 'alert'))).toEqual([
      'on',
      'when',
      'future',
      'to',
      'do',
      'reason',
    ]);
  });

  it('no list drops the pick and keeps the other acts', () => {
    expect(withStepPick(step, null).do).toEqual([
      { wake_in: 2 },
      { set: { key: 'k', value: 1 } },
    ]);
  });

  it('no list on a step whose only act is its pick drops `do`', () => {
    expect(withStepPick({ on: 'time', do: [{ pick: 'post' }] }, null)).toEqual({
      on: 'time',
    });
  });

  it('a list on a step with none puts its pick first', () => {
    expect(
      withStepPick({ on: 'barred', do: [{ anchor: true }] }, 'x').do
    ).toEqual([{ pick: 'x' }, { anchor: true }]);
  });

  it('an empty reason removes it', () => {
    expect(Object.hasOwn(withStepReason(step, ''), 'reason')).toBe(false);
  });
});

describe('adding and removing', () => {
  it('removing a step removes only it from that state', () => {
    const read = castle();
    const definition = definitionOf(read.scope, GATE)!;
    const steps = transitionsOf(definition, 'alert');
    const next = withTransitions(
      definition,
      'alert',
      steps.filter((_, i) => i !== 2)
    );
    expect(transitionsOf(next, 'alert')).toEqual([
      ...steps.slice(0, 2),
      ...steps.slice(3),
    ]);
    for (const state of statesOf(definition).filter((s) => s !== 'alert'))
      expect(transitionsOf(next, state)).toBe(transitionsOf(definition, state));
    const { removed, added } = diff(savedWith(() => next));
    expect(removed).toEqual([
      '            - on: approached',
      '              do:',
      '                - pick: approached',
    ]);
    expect(added).toEqual([]);
  });

  it('a new state has no steps and is written under the recipe’s states', () => {
    const definition = definitionOf(castle().scope, GATE)!;
    const next = withStateAdded(definition, 'resting');
    expect(statesOf(next)).toContain('resting');
    expect(transitionsOf(next, 'resting')).toEqual([]);
    expect(() => withStateAdded(definition, 'alert')).toThrow(
      'There is already a state "alert".'
    );
    expect(savedWith(() => next)).toContain('        resting:\n');
  });

  it('a new list is an empty table key, and its rows are set whole', () => {
    const definition = definitionOf(castle().scope, GATE)!;
    const next = withListAdded(definition, 'greet');
    expect(tableKeysOf(next)).toContain('greet');
    expect(tableRowsOf(next, 'greet')).toEqual([]);
    const row = { say: 'Halt.', hold: {} };
    expect(tableRowsOf(withTableRows(next, 'greet', [row]), 'greet')).toEqual([
      row,
    ]);
    // Other lists are untouched.
    expect(tableRowsOf(next, 'post')).toBe(tableRowsOf(definition, 'post'));
    expect(() => withListAdded(definition, 'post')).toThrow(
      'There is already a list "post".'
    );
  });

  it('a name must be a word', () => {
    expect(newNameRefusal('', [], 'state')).toBe('Name the state.');
    expect(newNameRefusal('two words', [], 'list')).toMatch(/letters, digits/);
    expect(newNameRefusal('ok-1', [], 'list')).toBeNull();
  });

  it('a behaviour the file does not author is refused', () => {
    expect(() => setBehaviorDefinition(castle().scope, 'nobody', {})).toThrow(
      'behaviorDefinitions.nobody: this site authors no such behaviour'
    );
  });
});
