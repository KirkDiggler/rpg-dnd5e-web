/**
 * A STEP'S BEAT, CONDITIONS AND ACTS IN THE ENGINE'S WORDS (rpg-project#1018).
 *
 * The parts of a step row in the Edit tab that the engine's words table
 * (`GetMachineWords`) builds: the beat it is on, its condition as one row
 * per condition when the condition is flat (`stepWords.whenShapeOf`), and
 * its acts besides the move and the pick. Every dropdown, every input and
 * where each input is written come from the table's `written` and `args`
 * (`stepWords.ts`); nothing here names a word, so a word the engine adds
 * appears and is written with no change.
 */
import type { MachineArg } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useId, useState } from 'react';
import type { Node } from './machineEdit';
import { firstPickAt, withStepDo, withStepWhen } from './machineEdit';
import { fillSlots, type MachineWords } from './machineWords';
import {
  actRowsOf,
  allowedOn,
  argValue,
  authoredArgs,
  beatWordFor,
  canNegate,
  doWordsOf,
  kindOfArg,
  leafWordsOf,
  newNode,
  onlyOnWords,
  optionLabel,
  startingValue,
  whenOfRows,
  whenShapeOf,
  withArgAndDependents,
  withNegated,
  type ArgKind,
  type StepChoices,
  type StepWord,
} from './stepWords';

/** The act "Does one of" edits: the step's first pick (`machineEdit`). It
 * is not offered again among the other acts. */
const PICK = 'pick';

/** A refusal shown on a row: the engine's sentence, and where in the step
 * it points (`.when.all[0].fact`, `.do[1]`; empty for the step). */
export interface RowRefusal {
  rest: string;
  message: string;
}

/** Refusals grouped by the row a pattern's first number names; one that
 * matches `whole` but not the pattern goes under -1. */
function byRow(
  list: readonly RowRefusal[] | undefined,
  whole: string,
  row: (rest: string) => number
): Map<number, RowRefusal[]> {
  const out = new Map<number, RowRefusal[]>();
  for (const r of list ?? []) {
    if (
      r.rest !== whole &&
      !r.rest.startsWith(`${whole}.`) &&
      !r.rest.startsWith(`${whole}[`)
    )
      continue;
    const at = row(r.rest);
    out.set(at, [...(out.get(at) ?? []), r]);
  }
  return out;
}

const choiceList = (choices: StepChoices, arg: MachineArg): string[] =>
  arg.values.length > 0 ? [...arg.values] : (choices.of(arg)?.options ?? []);

const kindFor =
  (word: StepWord, choices: StepChoices) =>
  (arg: MachineArg, node: unknown): ArgKind =>
    kindOfArg(word, arg, node, choices.flagKind);

/** A fresh node of `word` from the document's choices. */
const freshNode = (word: StepWord, choices: StepChoices): Node =>
  newNode(word, (arg) => choiceList(choices, arg), kindFor(word, choices));

/** A text or number input committed on blur or Enter. */
function CommitInput({
  label,
  value,
  type,
  list,
  onCommit,
}: {
  label: string;
  value: string;
  type: 'text' | 'number';
  list?: string;
  onCommit(text: string): void;
}) {
  const [text, setText] = useState(value);
  // A number input commits only a whole number: a cleared or fractional
  // field keeps the document's value and shows as invalid until fixed.
  const valid = type !== 'number' || /^-?\d+$/.test(text.trim());
  const commit = () => {
    if (valid && text.trim() !== value) onCommit(text.trim());
  };
  return (
    <input
      aria-label={label}
      aria-invalid={!valid || undefined}
      type={type}
      value={text}
      list={list}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

/** One input of a word, built from its arg: a comparison, a closed set, a
 * thing the document names, a yes/no, a number or text. */
function ArgInput({
  words,
  word,
  arg,
  node,
  label,
  choices,
  onSet,
}: {
  words: MachineWords;
  word: StepWord;
  arg: MachineArg;
  node: unknown;
  label: string;
  choices: StepChoices;
  onSet(value: unknown): void;
}) {
  const listId = useId();
  const kind = kindOfArg(word, arg, node, choices.flagKind);
  const value = argValue(word, node, arg);
  const offered = choices.of(arg);
  if (arg.names === 'op') {
    const ops = words.ops.filter(
      (o) => arg.values.length === 0 || arg.values.includes(o.op)
    );
    const now = typeof value === 'string' ? value : '';
    return (
      <select
        aria-label={label}
        value={now}
        onChange={(e) => onSet(e.target.value)}
      >
        {!ops.some((o) => o.op === now) && <option value={now}>{now}</option>}
        {ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.words}
          </option>
        ))}
      </select>
    );
  }
  const closed =
    arg.values.length > 0
      ? [...arg.values]
      : offered?.closed
        ? offered.options
        : null;
  if (arg.many) {
    const held = Array.isArray(value) ? value.map(String) : [];
    if (closed) {
      const all = [...closed, ...held.filter((h) => !closed.includes(h))];
      return (
        <span role="group" aria-label={label} className="es-machine-many">
          {all.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                aria-label={`${label} ${option}`}
                checked={held.includes(option)}
                onChange={(e) =>
                  onSet(
                    e.target.checked
                      ? [...held, option]
                      : held.filter((h) => h !== option)
                  )
                }
              />
              {option}
            </label>
          ))}
        </span>
      );
    }
    return (
      <CommitInput
        key={held.join(', ')}
        label={label}
        type="text"
        value={held.join(', ')}
        onCommit={(text) =>
          onSet(
            text
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          )
        }
      />
    );
  }
  if (kind === 'bool' && !closed) {
    return (
      <select
        aria-label={label}
        value={String(value === true)}
        onChange={(e) => onSet(e.target.value === 'true')}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  const now = value === undefined ? '' : String(value);
  if (closed) {
    const labels =
      arg.name === 'value' && 'valueLabels' in word
        ? (word as { valueLabels: Record<string, string> }).valueLabels
        : {};
    return (
      <select
        aria-label={label}
        value={now}
        onChange={(e) =>
          onSet(kind === 'int' ? Number(e.target.value) : e.target.value)
        }
      >
        {!closed.includes(now) && (
          <option value={now}>{now || '(none)'}</option>
        )}
        {closed.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <CommitInput
        key={now}
        label={label}
        type={kind === 'int' ? 'number' : 'text'}
        value={now}
        list={offered?.options.length ? listId : undefined}
        onCommit={(text) => onSet(kind === 'int' ? Number(text) : text)}
      />
      {offered && offered.options.length > 0 && (
        <datalist id={listId}>
          {offered.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** "What fires it": the engine's beats by their labels; a beat with an
 * open part offers its input. An authored beat the table does not name is
 * kept and offered as written. */
export function BeatField({
  words,
  on,
  name,
  choices,
  onChange,
}: {
  words: MachineWords;
  on: string;
  name: string;
  choices: StepChoices;
  onChange(on: string): void;
}) {
  const found = on ? beatWordFor(words, on) : null;
  const selected = found ? found.word : on;
  const open = found?.args.find((a) => a.goes === 'open');
  return (
    <label>
      <span>On</span>
      <select
        aria-label={`What fires ${name}`}
        value={selected}
        onChange={(e) => {
          const beat = words.beats.find((b) => b.word === e.target.value);
          const arg = beat?.args.find((a) => a.goes === 'open');
          if (!beat || !arg) return onChange(e.target.value);
          const start = startingValue(arg, 'string', choiceList(choices, arg));
          onChange(`${beat.word}${String(start)}`);
        }}
      >
        {on === '' && <option value="">(none)</option>}
        {!found && on !== '' && <option value={on}>{on}</option>}
        {words.beats.map((beat) => (
          <option key={beat.word} value={beat.word}>
            {optionLabel(beat)}
          </option>
        ))}
      </select>
      {found && open && (
        <BeatOpen
          label={`${name} ${open.names || open.name}`}
          value={found.open}
          options={choiceList(choices, open)}
          closed={open.values.length > 0 || choices.of(open)?.closed === true}
          onSet={(value) => onChange(`${found.word}${value}`)}
        />
      )}
    </label>
  );
}

/** The open part of a beat (`deed:<word>`, `clock:<name>`). */
function BeatOpen({
  label,
  value,
  options,
  closed,
  onSet,
}: {
  label: string;
  value: string;
  options: readonly string[];
  closed: boolean;
  onSet(value: string): void;
}) {
  const listId = useId();
  if (closed)
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onSet(e.target.value)}
      >
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  return (
    <>
      <CommitInput
        key={value}
        label={label}
        type="text"
        value={value}
        list={options.length ? listId : undefined}
        onCommit={onSet}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** A step's condition: one row per condition when flat, else kept. */
export function StepConditions({
  words,
  step,
  beat,
  name,
  sentence,
  choices,
  refusals,
  onStep,
  show,
}: {
  /** `add`: only the compact "+ condition" control, on the step's line;
   * `rows`: the conditions it has, under the line, or nothing. */
  show: 'add' | 'rows';
  words: MachineWords;
  step: Node;
  beat: string;
  name: string;
  sentence: string | undefined;
  choices: StepChoices;
  /** The step's refusals; those under `.when` are shown here, on the
   * condition they name, or on the condition as a whole. */
  refusals?: readonly RowRefusal[];
  onStep(step: Node): boolean;
}) {
  const shape = whenShapeOf(words, step.when);
  const refused = byRow(refusals, '.when', (rest) => {
    if (shape.kind !== 'flat') return -1;
    if (shape.form === 'one') return 0;
    const m = /^\.when\.all\[(\d+)\]/.exec(rest);
    return m ? Number(m[1]) : -1;
  });
  if (shape.kind === 'kept')
    return show === 'add' ? null : (
      <div className="es-machine-conditions" data-kept="">
        <p className="es-help es-machine-kept">
          Kept as written: its condition.{' '}
          {sentence ?? 'The engine says it once the file is checked.'}{' '}
          {shape.why === 'nested'
            ? 'A nested condition (either / or, or not over a group) is edited as text.'
            : 'It holds a condition the engine’s words do not name; it is edited as text.'}
        </p>
        <Refused list={refused.get(-1)} />
      </div>
    );
  const nodes = shape.rows.map((r) => r.node);
  const write = (next: unknown[]) =>
    onStep(withStepWhen(step, whenOfRows(shape.form, next, shape.rows.length)));
  const setRow = (i: number, node: unknown) =>
    write(nodes.map((n, k) => (k === i ? node : n)));
  const leaves = leafWordsOf(words);
  const offered = leaves.filter((w) => allowedOn(words, w, beat));
  const negate = canNegate(words);
  if (show === 'add')
    return (
      <AddWord
        label={`Add a condition to ${name}`}
        what="+ condition"
        options={offered}
        onAdd={(word) => write([...nodes, freshNode(word, choices)])}
      />
    );
  if (shape.rows.length === 0 && !refused.size) return null;
  return (
    <div className="es-machine-conditions">
      <span className="es-help">When</span>
      <Refused list={refused.get(-1)} />
      <ul aria-label={`Conditions of ${name}`}>
        {shape.rows.map((row, i) => {
          const rowName = `${name} condition ${i + 1}`;
          const allowed = allowedOn(words, row.word, beat);
          const options = offered.includes(row.word as never)
            ? offered
            : [row.word, ...offered];
          const rowRefused = refused.get(i);
          return (
            <li
              key={i}
              className="es-machine-condition"
              data-condition={i}
              data-word={row.word.word}
              data-not-allowed={allowed ? undefined : ''}
              data-refused={rowRefused?.length ? '' : undefined}
            >
              <select
                aria-label={rowName}
                value={row.word.word}
                onChange={(e) => {
                  const word = leaves.find((w) => w.word === e.target.value);
                  if (word)
                    setRow(
                      i,
                      withNegated(freshNode(word, choices), row.negated)
                    );
                }}
              >
                {options.map((w) => (
                  <option key={w.word} value={w.word}>
                    {optionLabel(w)}
                  </option>
                ))}
              </select>
              {negate && (
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${rowName} is not`}
                    checked={row.negated}
                    onChange={(e) =>
                      setRow(i, withNegated(row.leaf, e.target.checked))
                    }
                  />
                  not
                </label>
              )}
              {authoredArgs(row.word).map((arg) => (
                <ArgInput
                  key={arg.name}
                  words={words}
                  word={row.word}
                  arg={arg}
                  node={row.leaf}
                  label={`${rowName} ${arg.name}`}
                  choices={choices}
                  onSet={(value) =>
                    setRow(
                      i,
                      withNegated(
                        withArgAndDependents(
                          row.word,
                          row.leaf,
                          arg,
                          value,
                          choices
                        ),
                        row.negated
                      )
                    )
                  }
                />
              ))}
              <button
                type="button"
                className="wb-danger"
                aria-label={`Remove ${rowName}`}
                onClick={() => write(nodes.filter((_, k) => k !== i))}
              >
                Remove
              </button>
              {!allowed && (
                <p className="es-help" data-rule="">
                  {onlyOnWords(words, row.word)}
                </p>
              )}
              <Refused list={rowRefused} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A step's acts besides its move and its pick, in order. */
export function StepActs({
  words,
  step,
  beat,
  name,
  choices,
  refusals,
  onStep,
  show,
}: {
  /** As `StepConditions`'s: the "+ act" control, or the act rows. */
  show: 'add' | 'rows';
  words: MachineWords;
  step: Node;
  beat: string;
  name: string;
  choices: StepChoices;
  /** The step's refusals; those under `.do[n]` are shown on act n. */
  refusals?: readonly RowRefusal[];
  onStep(step: Node): boolean;
}) {
  const acts = Array.isArray(step.do) ? step.do : [];
  const rows = actRowsOf(words, acts, firstPickAt(acts));
  const refused = byRow(refusals, '.do', (rest) => {
    const m = /^\.do\[(\d+)\]/.exec(rest);
    return m ? Number(m[1]) : -1;
  });
  const write = (next: unknown[]) => onStep(withStepDo(step, next));
  const known = doWordsOf(words).filter((w) => w.word !== PICK);
  const offered = known.filter((w) => allowedOn(words, w, beat));
  if (show === 'add')
    return (
      <AddWord
        label={`Add an act to ${name}`}
        what="+ act"
        options={offered}
        onAdd={(word) => write([...acts, freshNode(word, choices)])}
      />
    );
  if (rows.length === 0) return null;
  return (
    <div className="es-machine-acts">
      <span className="es-help">Also does</span>
      {rows.length > 0 && (
        <ul aria-label={`Acts of ${name}`}>
          {rows.map((row, n) => {
            const rowName = `${name} act ${n + 1}`;
            const rowRefused = refused.get(row.index);
            const remove = (
              <button
                type="button"
                className="wb-danger"
                aria-label={`Remove ${rowName}`}
                onClick={() => write(acts.filter((_, k) => k !== row.index))}
              >
                Remove
              </button>
            );
            if (!row.word)
              return (
                <li
                  key={row.index}
                  className="es-machine-act"
                  data-act={row.index}
                  data-refused={rowRefused?.length ? '' : undefined}
                >
                  <span className="es-help" data-kept="">
                    Kept as written: <code>{JSON.stringify(row.node)}</code>
                  </span>
                  {remove}
                  <Refused list={rowRefused} />
                </li>
              );
            const word = row.word;
            const allowed = allowedOn(words, word, beat);
            return (
              <li
                key={row.index}
                className="es-machine-act"
                data-act={row.index}
                data-word={word.word}
                data-not-allowed={allowed ? undefined : ''}
                data-refused={rowRefused?.length ? '' : undefined}
              >
                <span>{actSaid(word, row.node)}</span>
                {authoredArgs(word).map((arg) => (
                  <ArgInput
                    key={arg.name}
                    words={words}
                    word={word}
                    arg={arg}
                    node={row.node}
                    label={`${rowName} ${arg.name}`}
                    choices={choices}
                    onSet={(value) =>
                      write(
                        acts.map((a, k) =>
                          k === row.index
                            ? withArgAndDependents(word, a, arg, value, choices)
                            : a
                        )
                      )
                    }
                  />
                ))}
                {remove}
                {!allowed && (
                  <p className="es-help" data-rule="">
                    {onlyOnWords(words, word)}
                  </p>
                )}
                {!choices.hasFlags &&
                  word.args.some((a) => a.names === 'flag') && (
                    <p className="es-help" data-no-flags="">
                      This machine declares no flags: name the flag as text.
                    </p>
                  )}
                <Refused list={rowRefused} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** An act's label with what it holds filled in ("waits 3 rounds"). */
function actSaid(word: StepWord, node: unknown): string {
  const slots: Record<string, string> = {};
  for (const arg of word.args) {
    const v = argValue(word, node, arg);
    if (v !== undefined)
      slots[arg.name] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return fillSlots(word.label || word.word, slots);
}

/** A select that adds one word, then returns to its prompt. */
function AddWord({
  label,
  what,
  options,
  onAdd,
}: {
  label: string;
  what: string;
  options: readonly StepWord[];
  onAdd(word: StepWord): void;
}) {
  return (
    <select
      aria-label={label}
      value=""
      onChange={(e) => {
        const word = options.find((w) => w.word === e.target.value);
        if (word) onAdd(word);
      }}
    >
      <option value="">{what}</option>
      {options.map((w) => (
        <option key={w.word} value={w.word}>
          {optionLabel(w)}
        </option>
      ))}
    </select>
  );
}

/** The engine's refusals of a row, each its sentence. */
export function Refused({ list }: { list?: readonly RowRefusal[] }) {
  if (!list?.length) return null;
  return (
    <>
      {list.map((r, i) => (
        <p
          key={i}
          className="es-help es-machine-refused"
          role="note"
          data-refused=""
        >
          Refused: {r.message}
        </p>
      ))}
    </>
  );
}
