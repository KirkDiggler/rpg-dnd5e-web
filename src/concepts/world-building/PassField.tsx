import { useId } from 'react';
import { passForm, passOf } from './postPass';

/**
 * A post's pass as one choice and one id (rpg-project#928): "the walker
 * knows a fact" (a password, the bare word; empty, nobody passes), or "the
 * holder recognises the walker" (a topic). A pass written in any other shape — a
 * list, a `not`, a form this build does not know — is shown as written and
 * left untouched; the form does not offer to change it.
 *
 * Topics the site's interactions already grant are offered as you type; a
 * new topic is allowed (the compiler names one no outcome grants).
 */
export function PassField({
  label,
  value,
  topics = [],
  onChange,
}: {
  /** The post's name in labels: "gate-1 posted". */
  label: string;
  /** The pass as written. */
  value: unknown;
  /** Topic ids the loaded content grants. */
  topics?: readonly string[];
  onChange: (next: unknown) => void;
}): React.JSX.Element {
  const topicList = useId();
  const form = passForm(value);
  if (form.kind === 'other')
    return (
      <div aria-label={`Pass in ${label}`}>
        <span>Pass</span>
        <pre aria-label={`Pass as written in ${label}`}>
          {JSON.stringify(form.written)}
        </pre>
        <p className="wb-help">
          Written in a shape this form does not edit; it is kept as written.
        </p>
      </div>
    );
  // An empty fact field is no pass at all: the password mode is also the
  // "nobody passes" one, as the field has always been.
  const mode = form.kind === 'recognized' ? 'recognized' : 'fact';
  const id =
    form.kind === 'fact'
      ? form.fact
      : form.kind === 'recognized'
        ? form.topic
        : '';
  const choose = (next: 'fact' | 'recognized') => {
    if (next === mode) return;
    // Switching keeps the word typed so far; a recognition needs a topic, so
    // an empty one starts on the first the site grants.
    if (next === 'fact') onChange(passOf({ kind: 'fact', fact: id }));
    else onChange(passOf({ kind: 'recognized', topic: id || topics[0] || '' }));
  };
  return (
    <div aria-label={`Pass in ${label}`}>
      <label>
        <span>Lets through</span>
        <select
          aria-label={`Pass kind in ${label}`}
          value={mode}
          onChange={(event) =>
            choose(event.target.value as 'fact' | 'recognized')
          }
        >
          <option value="fact">a walker who knows a fact (password)</option>
          <option value="recognized">a walker the holder recognises</option>
        </select>
      </label>
      {mode === 'fact' && (
        <label>
          <span>Pass fact</span>
          <input
            aria-label={`Pass fact in ${label}`}
            value={id}
            placeholder="nobody passes"
            onChange={(event) =>
              onChange(passOf({ kind: 'fact', fact: event.target.value }))
            }
          />
        </label>
      )}
      {form.kind === 'recognized' && (
        <label>
          <span>Recognised as (topic)</span>
          <input
            aria-label={`Pass topic in ${label}`}
            list={topicList}
            value={form.topic}
            onChange={(event) =>
              onChange(
                passOf({ kind: 'recognized', topic: event.target.value })
              )
            }
          />
          <datalist id={topicList}>
            {topics.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
        </label>
      )}
    </div>
  );
}
