/**
 * THE EDITOR SPEAKS THE ENGINE'S WORDS (rpg-project#1018): with the
 * recorded `GetMachineWords` answer, a step's beat is chosen by its label,
 * a flat condition is edited row by row from the table, its other acts the
 * same way; a nested condition is kept as written. Without words the
 * editor is as before.
 */
import { clone, create } from '@bufbuild/protobuf';
import {
  GetMachineWordsResponseSchema,
  MachineArgSchema,
  MachineConditionWordSchema,
  MachineWrittenSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import {
  castleMachinesV228ReadBack,
  machineWordsV225,
} from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  transitionsOf,
  withTransitions,
  type Node,
} from './machineEdit';
import { MachineStateEdit } from './MachineStateEdit';
import type { MachineWords } from './machineWords';

afterEach(cleanup);

const GATE = 'gate-1-policy';
const WORDS = machineWordsV225();

function gate(): Node {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return definitionOf(read.scope, GATE)!;
}

function edit(
  words: MachineWords | null,
  state = 'alert',
  start: Node = gate()
) {
  const commits: Node[] = [];
  function Harness() {
    const [definition, setDefinition] = useState(start);
    return (
      <MachineStateEdit
        routine={GATE}
        state={state}
        definition={definition}
        readBack={castleMachinesV228ReadBack()}
        readBackIsCurrent
        words={words}
        onCommit={(change) => {
          const next = change(definition);
          commits.push(next);
          setDefinition(next);
          return true;
        }}
      />
    );
  }
  render(<Harness />);
  const step = (index: number) =>
    transitionsOf(commits.at(-1)!, state)[index] as Node;
  return { commits, step };
}

const select = (label: string) =>
  screen.getByLabelText<HTMLSelectElement>(label);
const optionTexts = (label: string) =>
  Array.from(select(label).options).map((o) => o.textContent);

/** alert's steps as the castle writes them: 4 is barred (pick, anchor),
 * 5 the rounds step. */
const BARRED = 'alert step 4';
const ROUNDS = 'alert step 5';

describe('what fires it: the engine’s beats', () => {
  it('lists the beats by their plain labels, the authored one chosen', () => {
    edit(WORDS);
    expect(select(`What fires ${BARRED}`).value).toBe('barred');
    expect(optionTexts(`What fires ${BARRED}`)).toEqual(
      expect.arrayContaining(['someone walks into it', 'hears something'])
    );
    expect(select(`What fires ${BARRED}`).selectedOptions[0]!.textContent).toBe(
      'someone walks into it'
    );
  });

  it('choosing another beat commits it; an open family offers its part', () => {
    const { step } = edit(WORDS);
    fireEvent.change(select(`What fires ${BARRED}`), {
      target: { value: 'deed:' },
    });
    expect(step(3).on).toBe('deed:attacked');
    expect(select(`${BARRED} deed`).value).toBe('attacked');
    fireEvent.change(select(`${BARRED} deed`), { target: { value: 'fled' } });
    expect(step(3).on).toBe('deed:fled');
  });

  it('a beat the table does not name is kept and shown as written', () => {
    const start = gate();
    const steps = transitionsOf(start, 'alert').map((s, i) =>
      i === 3 ? { ...(s as Node), on: 'whistle' } : s
    );
    const { commits } = edit(
      WORDS,
      'alert',
      withTransitions(start, 'alert', steps)
    );
    expect(select(`What fires ${BARRED}`).value).toBe('whistle');
    expect(commits).toEqual([]);
  });
});

describe('a flat condition is edited row by row', () => {
  it('the rounds step: change 3 to 5', () => {
    const { step } = edit(WORDS);
    const n = screen.getByLabelText<HTMLInputElement>(
      `${ROUNDS} condition 1 n`
    );
    expect(n.value).toBe('3');
    expect(
      select(`${ROUNDS} condition 1 op`).selectedOptions[0]!.textContent
    ).toBe('at least');
    fireEvent.change(n, { target: { value: '5' } });
    fireEvent.blur(n);
    expect(step(4).when).toEqual({ rounds: { op: 'gte', n: 5 } });
  });

  it('the comparison and the not', () => {
    const { step } = edit(WORDS);
    fireEvent.change(select(`${ROUNDS} condition 1 op`), {
      target: { value: 'eq' },
    });
    expect(step(4).when).toEqual({ rounds: { op: 'eq', n: 3 } });
    fireEvent.click(screen.getByLabelText(`${ROUNDS} condition 1 is not`));
    expect(step(4).when).toEqual({ not: { rounds: { op: 'eq', n: 3 } } });
  });

  it('add offers only what is allowed on the beat; add then remove', () => {
    const { step } = edit(WORDS);
    const add = `Add a condition to ${ROUNDS}`;
    const offered = Array.from(select(add).options).map((o) => o.value);
    expect(offered).toContain('fact:');
    expect(offered).not.toContain('heard.claim');
    expect(offered).not.toContain('within');
    fireEvent.change(select(add), { target: { value: 'fact:' } });
    expect(step(4).when).toEqual({
      all: [
        { rounds: { op: 'gte', n: 3 } },
        {
          fact: {
            name: expect.stringMatching(/^fact:/),
            value: true,
            op: 'eq',
          },
        },
      ],
    });
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ${ROUNDS} condition 1` })
    );
    // Back to one condition: written bare.
    expect(step(4).when).toEqual({
      fact: expect.objectContaining({ op: 'eq' }),
    });
  });

  it('a condition not allowed on the step’s beat is kept and marked', () => {
    const start = gate();
    const steps = transitionsOf(start, 'alert').map((s, i) =>
      i === 4
        ? {
            ...(s as Node),
            when: { fact: { name: 'heard.claim', op: 'eq', value: 'failed' } },
          }
        : s
    );
    edit(WORDS, 'alert', withTransitions(start, 'alert', steps));
    const row = screen.getByLabelText(`${ROUNDS} condition 1`).closest('li')!;
    expect(row.hasAttribute('data-not-allowed')).toBe(true);
    expect(row.textContent).toContain('Only on: hears something.');
    expect(
      select(`${ROUNDS} condition 1 value`).selectedOptions[0]!.textContent
    ).toBe('it was a claim that failed');
  });

  it('the hearing step’s either / or is kept as written, in the engine’s words', () => {
    edit(WORDS, 'posted');
    const steps = within(
      screen.getByRole('list', { name: 'Steps in posted' })
    ).getAllByRole('listitem');
    const heard = steps.find(
      (li) => li.querySelector<HTMLSelectElement>('select')?.value === 'heard'
    )!;
    expect(heard.textContent).toContain('Kept as written: its condition.');
    expect(heard.textContent).toContain('edited as text');
    expect(heard.querySelector('[aria-label$="condition 1"]')).toBeNull();
  });

  it('a word added to the table is offered with no code of its own', () => {
    const words = clone(GetMachineWordsResponseSchema, WORDS);
    words.conditions.push(
      create(MachineConditionWordSchema, {
        word: 'light',
        kind: 'int',
        label: 'the light is at least {n}',
        written: create(MachineWrittenSchema, { part: 'when', key: 'light' }),
        args: [
          create(MachineArgSchema, {
            name: 'n',
            goes: 'field',
            field: 'level',
            kind: 'int',
          }),
        ],
      })
    );
    const { step } = edit(words);
    const add = `Add a condition to ${ROUNDS}`;
    expect(optionTexts(add)).toContain('the light is at least …');
    fireEvent.change(select(add), { target: { value: 'light' } });
    expect(step(4).when).toEqual({
      all: [{ rounds: { op: 'gte', n: 3 } }, { light: { level: 1 } }],
    });
  });
});

describe('acts besides the move and the pick', () => {
  it('shows marks the moment; adds, edits and removes in order', () => {
    const { step } = edit(WORDS);
    const acts = screen.getByRole('list', { name: `Acts of ${BARRED}` });
    expect(acts.textContent).toContain('marks the moment');
    fireEvent.change(select(`Add an act to ${BARRED}`), {
      target: { value: 'wake_in' },
    });
    expect(step(3).do).toEqual([
      { pick: 'barred' },
      { anchor: true },
      { wake_in: 1 },
    ]);
    const n = screen.getByLabelText<HTMLInputElement>(`${BARRED} act 2 n`);
    fireEvent.change(n, { target: { value: '3' } });
    fireEvent.blur(n);
    expect(step(3).do).toEqual([
      { pick: 'barred' },
      { anchor: true },
      { wake_in: 3 },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ${BARRED} act 1` })
    );
    expect(step(3).do).toEqual([{ pick: 'barred' }, { wake_in: 3 }]);
  });

  it('the pick is not offered again; a machine with no flags says so', () => {
    edit(WORDS);
    const offered = Array.from(select(`Add an act to ${BARRED}`).options).map(
      (o) => o.value
    );
    expect(offered).not.toContain('pick');
    expect(offered).toEqual(expect.arrayContaining(['set', 'clear', 'anchor']));
    // Said only where a flag is named, never under every step.
    expect(screen.queryByText(/declares no flags/)).toBeNull();
    fireEvent.change(select(`Add an act to ${BARRED}`), {
      target: { value: 'clear' },
    });
    const notes = screen.getAllByText(/declares no flags/);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.closest('li')!.getAttribute('data-word')).toBe('clear');
  });

  it('a flag the bag declares is offered, its value of the flag’s kind', () => {
    const start = gate();
    const recipe = start.recipe as Node;
    const { step } = edit(WORDS, 'alert', {
      ...start,
      recipe: { ...recipe, bag: { warned: false } },
    });
    fireEvent.change(select(`Add an act to ${BARRED}`), {
      target: { value: 'set' },
    });
    expect(step(3).do).toEqual([
      { pick: 'barred' },
      { anchor: true },
      { set: { key: 'warned', value: true } },
    ]);
    expect(select(`${BARRED} act 2 id`).value).toBe('warned');
    fireEvent.change(select(`${BARRED} act 2 value`), {
      target: { value: 'false' },
    });
    expect((step(3).do as Node[])[2]).toEqual({
      set: { key: 'warned', value: false },
    });
  });
});

describe('with no words the editor is as before', () => {
  it('beats are ids and a guarded step is kept as written', () => {
    edit(null);
    expect(optionTexts(`What fires ${BARRED}`)).toContain('barred');
    expect(screen.queryByLabelText(`${ROUNDS} condition 1 n`)).toBeNull();
    expect(screen.queryByLabelText(`Add an act to ${BARRED}`)).toBeNull();
    const steps = within(
      screen.getByRole('list', { name: 'Steps in alert' })
    ).getAllByRole('listitem');
    expect(steps[4]!.textContent).toContain('Kept as written: its condition');
  });
});

describe('each step is a card', () => {
  it('heads with its line in the engine’s words and Remove step', () => {
    edit(WORDS);
    const card = screen
      .getByRole('list', { name: 'Steps in alert' })
      .querySelector<HTMLLIElement>('li[data-step="4"]')!;
    const head = card.querySelector('.es-machine-step-head')!;
    expect(head.textContent).toContain('Step 5');
    expect(
      within(head as HTMLElement).getByRole('button', {
        name: `Remove ${ROUNDS}`,
      }).textContent
    ).toBe('Remove step');
    // A step with no condition and no other acts opens no rows for them.
    const plain = screen
      .getByRole('list', { name: 'Steps in alert' })
      .querySelector<HTMLLIElement>('li[data-step="5"]')!;
    expect(plain.querySelector('.es-machine-conditions')).toBeNull();
    expect(plain.querySelector('.es-machine-acts')).toBeNull();
    expect(
      within(plain).getByLabelText<HTMLSelectElement>(
        'Add a condition to alert step 6'
      ).options[0]!.textContent
    ).toBe('+ condition');
  });

  it('the summary is the drawn step’s line', () => {
    edit(WORDS);
    const summary = screen
      .getByRole('list', { name: 'Steps in alert' })
      .querySelector('li[data-step="4"] [data-summary]')!;
    expect(summary.textContent).toContain('time passes');
    expect(summary.textContent).toContain('3 rounds');
    expect(summary.textContent).toContain('→ posted');
  });
});

describe('review fixes', () => {
  it('a cleared or fractional number keeps the document’s value and shows invalid', () => {
    const { commits } = edit(WORDS);
    const n = screen.getByLabelText<HTMLInputElement>(
      `${ROUNDS} condition 1 n`
    );
    fireEvent.change(n, { target: { value: '' } });
    fireEvent.blur(n);
    expect(n.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(n, { target: { value: '2.5' } });
    fireEvent.blur(n);
    expect(commits).toEqual([]);
    fireEvent.change(n, { target: { value: '4' } });
    fireEvent.blur(n);
    expect(n.hasAttribute('aria-invalid')).toBe(false);
    expect((transitionsOf(commits.at(-1)!, 'alert')[4] as Node).when).toEqual({
      rounds: { op: 'gte', n: 4 },
    });
  });

  it('a set whose flag changes takes the new flag’s starting value', () => {
    const start = gate();
    const recipe = start.recipe as Node;
    const { step } = edit(WORDS, 'alert', {
      ...start,
      recipe: { ...recipe, bag: { alarmed: false, count: 0 } },
    });
    fireEvent.change(select(`Add an act to ${BARRED}`), {
      target: { value: 'set' },
    });
    expect((step(3).do as Node[])[2]).toEqual({
      set: { key: 'alarmed', value: true },
    });
    fireEvent.change(select(`${BARRED} act 2 id`), {
      target: { value: 'count' },
    });
    expect((step(3).do as Node[])[2]).toEqual({
      set: { key: 'count', value: 0 },
    });
  });

  it('removing back to one condition writes the bare condition', () => {
    const { step } = edit(WORDS);
    fireEvent.change(select(`Add a condition to ${ROUNDS}`), {
      target: { value: 'fact:' },
    });
    expect(step(4).when).toHaveProperty('all');
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ${ROUNDS} condition 2` })
    );
    expect(step(4).when).toEqual({ rounds: { op: 'gte', n: 3 } });
  });
});
