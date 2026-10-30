/**
 * One ordered action-ref list: Add action or Drop action (rpg-project#721).
 * The cast form stages it and the placement's Overrides commit it; both hand
 * this the list and take the next one back.
 *
 * THE ORDER IS AUTHORED. The session applies adds and drops in the order
 * written (rpg-toolkit `session/entities.go augmentActions`), so the rows
 * move rather than sort. A ref the engine's grammar refuses is said in the
 * engine's words under the field and never enters the list.
 */
import { useState, type Ref } from 'react';
import {
  actionRefRefusal,
  moveRef,
  type ActionAugmentKey,
} from '../world-building/actionAugments';
import { FieldHelp } from './FieldHelp';

const LABELS: Record<
  ActionAugmentKey,
  { title: string; noun: string; help: string }
> = {
  addActions: {
    title: 'Add action',
    noun: 'added action',
    help: 'Added after the weapons it already has, in this order.',
  },
  dropActions: {
    title: 'Drop action',
    noun: 'dropped action',
    help: 'Taken away from the weapons it already has. Dropping one it does not carry is refused when the run launches.',
  },
};

/** The typed-but-not-added text is the caller's when it passes `draft`
 * (the cast form, whose Apply refuses while one is pending and whose Cancel
 * clears it); otherwise it is this list's own. */
export function ActionRefList({
  kind,
  refs,
  onChange,
  draft: heldDraft,
  onDraftChange,
  inputRef,
  pending = false,
}: {
  kind: ActionAugmentKey;
  refs: readonly string[];
  onChange(next: readonly string[]): void;
  draft?: string;
  onDraftChange?(next: string): void;
  inputRef?: Ref<HTMLInputElement>;
  /** Apply was refused because this field still holds text. */
  pending?: boolean;
}): React.JSX.Element {
  const [ownDraft, setOwnDraft] = useState('');
  const draft = heldDraft ?? ownDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const label = LABELS[kind];
  const refusal = draft.trim() ? actionRefRefusal(draft) : null;
  return (
    <fieldset data-testid={`action-refs-${kind}`}>
      <legend>
        {label.title}, in order{' '}
        <FieldHelp field={label.title}>
          {label.help} Actions are typed references. A pick-list waits for the
          rulebook catalog.
        </FieldHelp>
      </legend>
      {refs.length === 0 ? (
        <p className="es-help">None.</p>
      ) : (
        <ol>
          {refs.map((ref, index) => (
            <li key={`${ref}-${index}`} className="es-buttons">
              <code>{ref}</code>
              <button
                type="button"
                aria-label={`Move ${label.noun} ${ref} earlier`}
                disabled={index === 0}
                onClick={() => onChange(moveRef(refs, index, index - 1))}
              >
                Move up
              </button>
              <button
                type="button"
                aria-label={`Move ${label.noun} ${ref} later`}
                disabled={index === refs.length - 1}
                onClick={() => onChange(moveRef(refs, index, index + 1))}
              >
                Move down
              </button>
              <button
                type="button"
                aria-label={`Remove ${label.noun} ${ref}`}
                onClick={() => onChange(refs.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="es-buttons">
        <input
          aria-label={`New ${label.noun} reference`}
          ref={inputRef}
          aria-invalid={refusal !== null || pending}
          placeholder="dnd5e:weapons:javelin"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!draft.trim() || refusal) return;
            onChange([...refs, draft.trim()]);
            setDraft('');
          }}
        />
        <button
          type="button"
          disabled={!draft.trim() || refusal !== null}
          onClick={() => {
            onChange([...refs, draft.trim()]);
            setDraft('');
          }}
        >
          {label.title}
        </button>
      </div>
      {refusal && (
        <p role="alert" className="es-warning">
          {refusal}
        </p>
      )}
    </fieldset>
  );
}
