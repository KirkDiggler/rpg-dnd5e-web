/**
 * A STEP BUILT FROM THE ENGINE'S WORDS (rpg-project#1018): conditions and
 * acts are read and written from the recorded `GetMachineWords` answer's
 * `written` and `args`, over the served castle; a made-up word added to the
 * table is read and written with no code of its own; and a step whose
 * condition is set back unchanged writes the castle byte for byte.
 */
import { clone, create } from '@bufbuild/protobuf';
import {
  GetMachineWordsResponseSchema,
  MachineActWordSchema,
  MachineArgSchema,
  MachineConditionWordSchema,
  MachineWrittenSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import { machineWordsV225 } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  setBehaviorDefinition,
  statesOf,
  transitionsOf,
  withStepDo,
  withStepWhen,
  withTransitions,
  type Node,
} from './machineEdit';
import {
  actRowsOf,
  allowedOn,
  argValue,
  authoredArgs,
  beatWordFor,
  doWordsOf,
  leafWordsOf,
  newNode,
  whenOfRows,
  whenShapeOf,
  withArg,
  withNegated,
  wordOfNode,
  type StepWord,
} from './stepWords';

const WORDS = machineWordsV225();
const GATE = 'gate-1-policy';

function castle() {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return read;
}
const gate = (): Node => definitionOf(castle().scope, GATE)!;

/** The castle written back with one gate-1 step set to `edit(step)`. */
function savedWith(
  state: string,
  index: number,
  edit: (step: Node) => Node
): string {
  const read = castle();
  const definition = definitionOf(read.scope, GATE)!;
  const steps = transitionsOf(definition, state).map((s, i) =>
    i === index ? edit(s as Node) : s
  );
  return exportDraftYaml(
    {
      draft: read.draft,
      scope: setBehaviorDefinition(
        read.scope,
        GATE,
        withTransitions(definition, state, steps)
      ),
    },
    read.key
  );
}

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

const stepAt = (state: string, on: string, has: string): [number, Node] => {
  const steps = transitionsOf(gate(), state) as Node[];
  const index = steps.findIndex(
    (s) => s.on === on && JSON.stringify(s).includes(has)
  );
  if (index < 0) throw new Error(`no ${on} step with ${has} in ${state}`);
  return [index, steps[index]!];
};

const word = (w: string): StepWord =>
  [...leafWordsOf(WORDS), ...doWordsOf(WORDS)].find((x) => x.word === w)!;

const noChoices = () => [] as string[];
const plainKind = (): 'string' => 'string';

describe('flat or nested, on the castle’s real steps', () => {
  it('the hearing step’s either / or is nested and kept', () => {
    const [, heard] = stepAt('posted', 'heard', 'any');
    expect(whenShapeOf(WORDS, heard.when)).toEqual({
      kind: 'kept',
      why: 'nested',
    });
  });

  it('the “at least 3 rounds” step is flat: one rounds row', () => {
    const [, back] = stepAt('alert', 'time', 'rounds');
    const shape = whenShapeOf(WORDS, back.when);
    expect(shape.kind).toBe('flat');
    if (shape.kind !== 'flat') return;
    expect(shape.form).toBe('one');
    expect(shape.rows.map((r) => r.word.word)).toEqual(['rounds']);
    expect(shape.rows[0]!.negated).toBe(false);
  });

  it('a fact step is one fact: row; a step with no when is flat and empty', () => {
    const [, turned] = stepAt('alert', 'fact', 'guards-turned');
    const shape = whenShapeOf(WORDS, turned.when);
    expect(shape.kind === 'flat' && shape.rows[0]!.word.word).toBe('fact:');
    const [, barred] = stepAt('alert', 'barred', 'barred');
    expect(whenShapeOf(WORDS, barred.when)).toEqual({
      kind: 'flat',
      form: 'none',
      rows: [],
    });
  });

  it('an all of leaves, one under a not, is flat; not over a group is nested', () => {
    const leafA = { rounds: { op: 'gte', n: 3 } };
    const leafB = { fact: { name: 'fact:gate-cowed', op: 'eq', value: true } };
    const flat = whenShapeOf(WORDS, { all: [leafA, { not: leafB }] });
    expect(flat.kind).toBe('flat');
    if (flat.kind === 'flat')
      expect(flat.rows.map((r) => [r.word.word, r.negated])).toEqual([
        ['rounds', false],
        ['fact:', true],
      ]);
    expect(whenShapeOf(WORDS, { not: { all: [leafA, leafB] } }).kind).toBe(
      'kept'
    );
    expect(whenShapeOf(WORDS, { all: [{ all: [leafA] }] }).kind).toBe('kept');
    expect(whenShapeOf(WORDS, { any: [leafA, leafB] }).kind).toBe('kept');
  });

  it('a leaf the table names no word for is kept', () => {
    expect(whenShapeOf(WORDS, { weather: 'rain' })).toEqual({
      kind: 'kept',
      why: 'unknown',
    });
  });

  it('every flat castle step set back from its rows writes the castle byte for byte', () => {
    const read = castle();
    let scope = read.scope;
    let flat = 0;
    for (const id of Object.keys(
      (read.scope.unread?.behaviorDefinitions ?? {}) as Node
    )) {
      let definition = definitionOf(scope, id)!;
      for (const state of statesOf(definition)) {
        const steps = transitionsOf(definition, state).map((raw) => {
          const step = raw as Node;
          const shape = whenShapeOf(WORDS, step.when);
          if (shape.kind !== 'flat' || shape.form === 'none') return step;
          flat++;
          // Each row rebuilt from its leaf and polarity, and each input set
          // to the value it already holds.
          const rebuilt = shape.rows.map((r) =>
            withNegated(
              authoredArgs(r.word).reduce<unknown>(
                (leaf, arg) =>
                  withArg(r.word, leaf, arg, argValue(r.word, leaf, arg)),
                r.leaf
              ),
              r.negated
            )
          );
          return withStepWhen(step, whenOfRows(shape.form, rebuilt));
        });
        definition = withTransitions(definition, state, steps);
      }
      scope = setBehaviorDefinition(scope, id, definition);
    }
    expect(flat).toBeGreaterThan(0);
    expect(exportDraftYaml({ draft: read.draft, scope }, read.key)).toBe(
      served
    );
  });
});

describe('a flat condition is edited from the table', () => {
  it('at least 3 rounds → 5 changes one line', () => {
    const [index, back] = stepAt('alert', 'time', 'rounds');
    const shape = whenShapeOf(WORDS, back.when);
    if (shape.kind !== 'flat') throw new Error('the rounds step is flat');
    const row = shape.rows[0]!;
    const n = row.word.args.find((a) => a.name === 'n')!;
    expect(
      diff(
        savedWith('alert', index, (s) =>
          withStepWhen(s, withArg(row.word, row.leaf, n, 5))
        )
      )
    ).toEqual({
      removed: ['                  n: 3'],
      added: ['                  n: 5'],
    });
  });

  it('a comparison and a not', () => {
    const rounds = word('rounds');
    const op = rounds.args.find((a) => a.name === 'op')!;
    expect(withArg(rounds, { rounds: { op: 'gte', n: 3 } }, op, 'eq')).toEqual({
      rounds: { op: 'eq', n: 3 },
    });
    const leaf = { fact: { name: 'fact:gate-cowed', op: 'eq', value: true } };
    expect(withNegated(leaf, true)).toEqual({ not: leaf });
  });

  it('an open word’s id is written after its colon, where the word is spelled', () => {
    const fact = word('fact:');
    const id = fact.args.find((a) => a.name === 'id')!;
    expect(
      withArg(
        fact,
        { fact: { name: 'fact:a', op: 'eq', value: true } },
        id,
        'b'
      )
    ).toEqual({ fact: { name: 'fact:b', op: 'eq', value: true } });
  });

  it('a new condition is built from its args, fixed ones written', () => {
    expect(
      newNode(
        word('fact:'),
        () => ['gate-cowed'],
        (a) => (a.kind === 'bool' ? 'bool' : 'string')
      )
    ).toEqual({ fact: { name: 'fact:gate-cowed', value: true, op: 'eq' } });
    expect(newNode(word('within'), noChoices, () => 'int')).toEqual({
      scope: { within: 1 },
    });
    expect(newNode(word('flag:'), () => ['warned'], plainKind)).toEqual({
      flag: 'warned',
    });
    expect(newNode(word('heard.claim'), noChoices, plainKind)).toEqual({
      fact: { name: 'heard.claim', value: 'held', op: 'eq' },
    });
  });

  it('adding a condition to a one-leaf step makes an all; removing the last removes when', () => {
    const [index, back] = stepAt('alert', 'time', 'rounds');
    const within = newNode(word('within'), noChoices, () => 'int');
    const after = diff(
      savedWith('alert', index, (s) =>
        withStepWhen(s, whenOfRows('one', [back.when, within]))
      )
    );
    expect(after.added.join('\n')).toContain('all:');
    expect(after.added.join('\n')).toContain('within: 1');
    const removed = diff(
      savedWith('alert', index, (s) => withStepWhen(s, whenOfRows('one', [])))
    );
    expect(removed.added).toEqual([]);
    expect(removed.removed.join('\n')).toContain('rounds:');
  });

  it('a word is offered on a beat only where the table allows it', () => {
    expect(allowedOn(WORDS, word('heard.claim'), 'heard')).toBe(true);
    expect(allowedOn(WORDS, word('heard.claim'), 'time')).toBe(false);
    // A family's word allows every beat of the family.
    expect(allowedOn(WORDS, word('within'), 'deed:attacked')).toBe(true);
    expect(allowedOn(WORDS, word('rounds'), 'time')).toBe(true);
    expect(beatWordFor(WORDS, 'deed:attacked')).toMatchObject({
      word: 'deed:',
      open: 'attacked',
    });
    expect(beatWordFor(WORDS, 'clock:world')?.word).toBe('clock:world');
  });
});

describe('acts are edited from the table, in order', () => {
  const [index, barred] = stepAt('alert', 'barred', 'barred');
  const acts = barred.do as unknown[];

  it('the step’s other acts, its pick left to “Does one of”', () => {
    const rows = actRowsOf(WORDS, acts, 0);
    expect(rows.map((r) => [r.index, r.word?.word])).toEqual([[1, 'anchor']]);
  });

  it('add, edit and remove keep the others in place', () => {
    const wake = word('wake_in');
    const added = [...acts, newNode(wake, noChoices, () => 'int')];
    expect(added).toEqual([
      { pick: 'barred' },
      { anchor: true },
      { wake_in: 1 },
    ]);
    const n = wake.args.find((a) => a.name === 'n')!;
    const edited = added.map((a, i) => (i === 2 ? withArg(wake, a, n, 3) : a));
    expect(edited[2]).toEqual({ wake_in: 3 });
    expect(edited.filter((_, i) => i !== 1)).toEqual([
      { pick: 'barred' },
      { wake_in: 3 },
    ]);
    const text = diff(savedWith('alert', index, (s) => withStepDo(s, edited)));
    expect(text.removed).toEqual([]);
    expect(text.added).toEqual(['                - wake_in: 3']);
  });

  it('set takes a flag and a value of the flag’s kind; clear a list', () => {
    const set = word('set');
    expect(
      newNode(
        set,
        () => ['warned'],
        (a) => (a.kind === 'of' ? 'bool' : 'string')
      )
    ).toEqual({ set: { key: 'warned', value: true } });
    expect(newNode(word('clear'), () => ['warned'], plainKind)).toEqual({
      clear: ['warned'],
    });
    expect(newNode(word('anchor'), noChoices, () => 'bool')).toEqual({
      anchor: true,
    });
  });

  it('an act the table does not know is kept, with no word', () => {
    const rows = actRowsOf(WORDS, [{ pick: 'x' }, { dance: 1 }], 0);
    expect(rows).toEqual([{ index: 1, node: { dance: 1 }, word: null }]);
  });
});

describe('a made-up word works with no code of its own', () => {
  const words = clone(GetMachineWordsResponseSchema, WORDS);
  words.conditions.push(
    create(MachineConditionWordSchema, {
      word: 'light',
      kind: 'int',
      on: ['seen'],
      label: 'the light is {op} {n}',
      written: create(MachineWrittenSchema, { part: 'when', key: 'light' }),
      args: [
        create(MachineArgSchema, {
          name: 'n',
          goes: 'field',
          field: 'level',
          kind: 'int',
        }),
        create(MachineArgSchema, {
          name: 'op',
          goes: 'field',
          field: 'op',
          names: 'op',
          kind: 'string',
          values: ['eq', 'gte'],
        }),
      ],
    })
  );
  words.acts.push(
    create(MachineActWordSchema, {
      word: 'shout',
      label: 'shouts {value}',
      written: create(MachineWrittenSchema, { part: 'do', key: 'shout' }),
      args: [
        create(MachineArgSchema, {
          name: 'value',
          goes: 'value',
          kind: 'string',
        }),
      ],
    })
  );
  const light = leafWordsOf(words).find((w) => w.word === 'light')!;
  const shout = doWordsOf(words).find((w) => w.word === 'shout')!;

  it('is offered where the table allows it', () => {
    expect(allowedOn(words, light, 'seen')).toBe(true);
    expect(allowedOn(words, light, 'time')).toBe(false);
  });

  it('is written where its args say, and read back as itself', () => {
    const node = newNode(light, noChoices, (a) =>
      a.kind === 'int' ? 'int' : 'string'
    );
    expect(node).toEqual({ light: { level: 1, op: 'eq' } });
    expect(wordOfNode(leafWordsOf(words), node)?.word).toBe('light');
    const shape = whenShapeOf(words, { all: [node, { not: node }] });
    expect(shape.kind).toBe('flat');
    const n = light.args[0]!;
    expect(withArg(light, node, n, 4)).toEqual({
      light: { level: 4, op: 'eq' },
    });
    const act = newNode(shout, noChoices, plainKind);
    expect(act).toEqual({ shout: '' });
    expect(actRowsOf(words, [act], -1)[0]!.word?.word).toBe('shout');
  });
});

describe('one condition is written bare, unless the file wrote all of one', () => {
  const x = { rounds: { op: 'gte', n: 3 } };
  const y = { scope: { within: 2 } };
  it('the rule', () => {
    expect(whenOfRows('one', [x])).toBe(x);
    expect(whenOfRows('all', [x], 2)).toBe(x);
    expect(whenOfRows('all', [x], 1)).toEqual({ all: [x] });
    expect(whenOfRows('one', [x, y])).toEqual({ all: [x, y] });
    expect(whenOfRows('all', [], 1)).toBeUndefined();
  });
});
