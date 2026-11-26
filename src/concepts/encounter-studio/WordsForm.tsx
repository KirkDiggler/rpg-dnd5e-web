/**
 * THE ENGINE'S WORDS AS A FORM (rpg-project#1201): one field per word of a
 * place, drawn by the word's `shape` and labelled by the table's own `label`.
 * The form knows shapes, never words: which words exist, what they offer and
 * what they allow all come from the table it is given. A word of a shape this
 * studio has no control for is shown, not hidden, and a key the table does not
 * name is kept and listed, so saving never loses what the engine did not ask
 * about. It validates nothing beyond the inputs' own attributes: the engine's
 * refusals say what is wrong after Save.
 */
import type { ReactNode } from 'react';
import {
  setWord,
  unknownKeys,
  withWordsOf,
  wordsAt,
  type FormWord,
} from './wordsForm';

type Obj = Record<string, unknown>;

const VALUE = '{value}';

const isObject = (value: unknown): value is Obj =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The label around its control: a `{value}` in the label marks where the
 * control sits, else the label comes first. */
function Labelled({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  const at = label.indexOf(VALUE);
  if (at < 0)
    return (
      <label>
        <span>{label}</span> {children}
      </label>
    );
  return (
    <label>
      {label.slice(0, at)}
      {children}
      {label.slice(at + VALUE.length)}
    </label>
  );
}

export function WordsForm({
  words,
  place,
  value,
  onChange,
  idPrefix,
  placeWords,
}: {
  words: readonly FormWord[];
  place: string;
  value: Readonly<Obj>;
  onChange(next: Obj): void;
  idPrefix: string;
  /** The words to draw instead of the words of `place` (the `with` words of
   * a chosen value). */
  placeWords?: readonly FormWord[];
}): React.JSX.Element {
  const shown = placeWords ?? wordsAt(words, place);
  const write = (word: string, next: unknown) =>
    onChange(setWord(value, word, next));
  return (
    <div>
      {shown.map((word) => (
        <Field
          key={word.word}
          words={words}
          place={place}
          word={word}
          value={value}
          write={write}
          idPrefix={idPrefix}
        />
      ))}
      {unknownKeys(shown, value).map((key) => (
        <p key={key} className="es-help" data-also-written={key}>
          also written: <code>{key}</code>{' '}
          <code>{JSON.stringify(value[key])}</code>
        </p>
      ))}
    </div>
  );
}

/** The label with its `{value}` mark removed: the name of a control. */
const plain = (label: string): string =>
  label.replace(VALUE, ' ').replace(/\s+/g, ' ').trim();

/** Whether a written value is the type its word's shape expects. An absent
 * value always is. */
function fits(shape: string, current: unknown): boolean {
  if (current === undefined) return true;
  switch (shape) {
    case 'text':
    case 'one of':
      return typeof current === 'string';
    case 'true or false':
      return typeof current === 'boolean';
    case 'whole number':
      return typeof current === 'number';
    case 'list of':
      return (
        Array.isArray(current) && current.every((x) => typeof x === 'string')
      );
    case 'entries':
      return isObject(current);
    case 'list':
      return Array.isArray(current);
    default:
      return true;
  }
}

function Field({
  words,
  place,
  word,
  value,
  write,
  idPrefix,
}: {
  words: readonly FormWord[];
  place: string;
  word: FormWord;
  value: Readonly<Obj>;
  write(word: string, next: unknown): void;
  idPrefix: string;
}): React.JSX.Element | null {
  const id = `${idPrefix}-${word.word}`;
  const current = value[word.word];
  const required = word.required || undefined;
  const name = plain(word.label);
  if (!fits(word.shape, current))
    return (
      <p className="es-help" data-wrong-type={word.word}>
        {name}: <code>{JSON.stringify(current)}</code> is not {word.shape}.{' '}
        <button
          type="button"
          aria-label={`Clear ${name}`}
          onClick={() => write(word.word, undefined)}
        >
          Clear
        </button>
      </p>
    );
  switch (word.shape) {
    case 'text':
      return (
        <Labelled label={word.label}>
          <input
            id={id}
            type="text"
            aria-required={required}
            value={typeof current === 'string' ? current : ''}
            onChange={(e) =>
              write(
                word.word,
                e.target.value === '' && !word.required
                  ? undefined
                  : e.target.value
              )
            }
          />
        </Labelled>
      );
    case 'one of': {
      const chosen = typeof current === 'string' ? current : '';
      const listed = word.values.some((v) => v.word === chosen);
      return (
        <Labelled label={word.label}>
          <select
            id={id}
            aria-required={required}
            value={chosen}
            onChange={(e) =>
              write(
                word.word,
                e.target.value === '' ? undefined : e.target.value
              )
            }
          >
            {chosen === '' && <option value="" />}
            {chosen !== '' && !listed && (
              <option value={chosen}>{chosen}</option>
            )}
            {word.values.map((v) => (
              <option key={v.word} value={v.word}>
                {v.label}
              </option>
            ))}
          </select>
        </Labelled>
      );
    }
    case 'list of': {
      const held = Array.isArray(current) ? (current as string[]) : [];
      const offered = word.values.map((v) => v.word);
      const unlisted = held.filter((h) => !offered.includes(h));
      const at = word.label.indexOf(VALUE);
      const before = at < 0 ? word.label : word.label.slice(0, at);
      const after = at < 0 ? '' : word.label.slice(at + VALUE.length);
      const writeList = (tick: string, on: boolean) => {
        const next = [
          ...offered.filter((w) => (w === tick ? on : held.includes(w))),
          ...unlisted.filter((w) => w !== tick || on),
        ];
        write(word.word, next.length === 0 ? undefined : next);
      };
      return (
        <div role="group" aria-label={name} aria-required={required}>
          <span>{before}</span>
          {word.values.map((v) => (
            <label key={v.word}>
              <input
                type="checkbox"
                checked={held.includes(v.word)}
                onChange={(e) => writeList(v.word, e.target.checked)}
              />{' '}
              {v.label}
            </label>
          ))}
          {unlisted.map((w) => (
            <label key={`unlisted:${w}`}>
              <input
                type="checkbox"
                checked
                onChange={(e) => writeList(w, e.target.checked)}
              />{' '}
              {w}
            </label>
          ))}
          {after && <span>{after}</span>}
        </div>
      );
    }
    case 'whole number':
      return (
        <Labelled label={word.label}>
          <input
            id={id}
            type="number"
            step={1}
            aria-required={required}
            min={word.bounds?.min}
            max={
              word.bounds && !word.bounds.noMax ? word.bounds.max : undefined
            }
            value={typeof current === 'number' ? current : ''}
            onChange={(e) =>
              write(
                word.word,
                e.target.value === '' ? undefined : Number(e.target.value)
              )
            }
          />
        </Labelled>
      );
    case 'true or false':
      return (
        <Labelled label={word.label}>
          <input
            id={id}
            type="checkbox"
            aria-required={required}
            checked={current === true}
            onChange={(e) =>
              write(
                word.word,
                e.target.checked ? true : word.required ? false : undefined
              )
            }
          />
        </Labelled>
      );
    case 'entries': {
      const own = wordsAt(words, word.holds);
      const nestedWords =
        own.length > 0 ? undefined : withWordsOf(words, place, value);
      if (own.length === 0 && (nestedWords?.length ?? 0) === 0)
        return current === undefined ? null : (
          <p className="es-help" data-also-written={word.word}>
            also written: <code>{word.word}</code>{' '}
            <code>{JSON.stringify(current)}</code>
          </p>
        );
      const set = isObject(current);
      return (
        <fieldset id={id}>
          <legend>
            {word.label}
            {!word.required && (
              <label>
                <input
                  type="checkbox"
                  aria-label={`set ${name}`}
                  checked={set}
                  onChange={(e) =>
                    write(word.word, e.target.checked ? {} : undefined)
                  }
                />{' '}
                set
              </label>
            )}
          </legend>
          {(set || word.required) && (
            <WordsForm
              words={words}
              place={word.holds}
              value={isObject(current) ? current : {}}
              onChange={(next) => write(word.word, next)}
              idPrefix={id}
              placeWords={nestedWords}
            />
          )}
        </fieldset>
      );
    }
    case 'list': {
      const entries: unknown[] = Array.isArray(current) ? current : [];
      return (
        <fieldset id={id}>
          <legend>{word.label}</legend>
          {entries.map((entry, index) => (
            <div key={index}>
              {isObject(entry) ? (
                <WordsForm
                  words={words}
                  place={word.holds}
                  value={entry}
                  onChange={(next) =>
                    write(
                      word.word,
                      entries.map((e, i) => (i === index ? next : e))
                    )
                  }
                  idPrefix={`${id}-${index}`}
                />
              ) : (
                <p className="es-help" data-not-an-object={index}>
                  <code>{JSON.stringify(entry)}</code>
                </p>
              )}
              <button
                type="button"
                className="wb-danger"
                aria-label={`Remove ${index + 1} from ${name}`}
                onClick={() => {
                  const rest = entries.filter((_, i) => i !== index);
                  write(
                    word.word,
                    rest.length === 0 && !word.required ? undefined : rest
                  );
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            aria-label={`Add to ${name}`}
            onClick={() => write(word.word, [...entries, {}])}
          >
            Add
          </button>
        </fieldset>
      );
    }
    default:
      return (
        <p className="es-help" data-no-control={word.word}>
          {word.word}: <code>{JSON.stringify(current)}</code>. This studio has
          no control for the engine&apos;s {word.shape} yet.
        </p>
      );
  }
}
