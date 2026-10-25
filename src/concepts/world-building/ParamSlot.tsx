/**
 * ParamSlot — a parameter reference as a VALUE KIND of the row editor
 * (rpg-project#670).
 *
 * Inside a bundle, wherever a row carries a scalar (a search's cells and
 * heading, a sound's kind and span, a weight, a route, a fact), the author may
 * write `$name` instead: the engine replaces that whole scalar with the value a
 * `use:` gives the parameter. This slot shows such a value as a CHIP, `$path`,
 * and offers the bundle's declared parameters beside the ordinary control.
 *
 * A NAME THE BUNDLE DOES NOT DECLARE IS REFUSED in the engine's own sentence:
 * typed under "Other…" it is never written, and one already in the file (from
 * the text view) is drawn as a refused chip until it is fixed. Outside a
 * bundle the slot is just its control.
 */
import { GROUP_SENTENCES } from '@/author/answerVocabulary';
import { useContext, useState, type ReactNode } from 'react';
import { paramRefOf } from './answerTableShape';
import { BundleParamsContext } from './bundlesContext';

const OTHER = '__other__';

/** A `$name` chip. Refused when the bundle does not declare the name. */
export function ParamChip({
  name,
  onClear,
  clearLabel,
}: {
  name: string;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const bundle = useContext(BundleParamsContext);
  const undeclared = bundle !== undefined && !bundle.params.includes(name);
  return (
    <span
      className={`wb-param-chip${undeclared ? ' wb-param-chip--refused' : ''}`}
      data-param={name}
    >
      ${name}
      {onClear && (
        <button type="button" aria-label={clearLabel} onClick={onClear}>
          ×
        </button>
      )}
      {undeclared && (
        <span className="wb-entry-refusal" role="alert">
          {GROUP_SENTENCES.undeclaredRef(name, bundle.bundle, bundle.params)}
        </span>
      )}
    </span>
  );
}

export function ParamSlot({
  value,
  label,
  onPick,
  onClear,
  children,
}: {
  /** The value as written: a `$name` draws the chip, anything else the
   * control. */
  value: unknown;
  /** What the slot is named for, e.g. "Cells for time entry". */
  label: string;
  /** Write `$name` into the slot. */
  onPick: (ref: string) => void;
  /** Put the ordinary value back. */
  onClear: () => void;
  children: ReactNode;
}) {
  const bundle = useContext(BundleParamsContext);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [refusal, setRefusal] = useState<string | undefined>();
  const ref = paramRefOf(value);
  if (ref !== undefined)
    return (
      <ParamChip
        name={ref}
        onClear={onClear}
        clearLabel={`Clear $${ref} from ${label}`}
      />
    );
  if (bundle === undefined) return <>{children}</>;
  const pick = (name: string) => {
    if (!bundle.params.includes(name)) {
      setRefusal(
        GROUP_SENTENCES.undeclaredRef(name, bundle.bundle, bundle.params)
      );
      return;
    }
    setRefusal(undefined);
    setTyping(false);
    setTyped('');
    onPick(`$${name}`);
  };
  return (
    <>
      {children}
      <select
        className="wb-param-pick"
        aria-label={`Parameter for ${label}`}
        value=""
        onChange={(event) => {
          if (event.target.value === OTHER) setTyping(true);
          else if (event.target.value !== '') pick(event.target.value);
        }}
      >
        <option value="">$…</option>
        {bundle.params.map((name) => (
          <option key={name} value={name}>
            ${name}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {typing && (
        <input
          aria-label={`Parameter name for ${label}`}
          placeholder="parameter name"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') pick(typed.trim().replace(/^\$/, ''));
          }}
        />
      )}
      {refusal && (
        <span className="wb-entry-refusal" role="alert">
          {refusal}
        </span>
      )}
    </>
  );
}
