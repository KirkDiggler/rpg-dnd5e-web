/**
 * PredicateEditor — ONE component for every place a predicate is authored
 * (rpg-project#375 §7): a disposition's `until` today, a placement's
 * `arrives` and an authored ending's `when` in step B.
 *
 * The grammar is one shape with four forms (`PredicateDoc`), so the editor
 * is one form select and, under it, the value that form takes: `round` a
 * number counted from 1; `down` a dropdown of the dungeon's NAMED monsters;
 * `fact` a text box with the facts the intel records reveal offered as
 * suggestions — free text stays legal, because a fact is declared by
 * mention (§2), and an unrevealed one is shown with its cost rather than
 * refused (R8); `stance` two faction dropdowns and the stance it must fold
 * to.
 *
 * Refusals arrive from the caller already addressed to this predicate
 * (`factionRules.ts`), so the same sentence renders here whether the
 * predicate sits on a disposition or on a placement.
 */
import {
  namedMonsters,
  PARTY,
  PREDICATE_FORMS,
  predicateForm,
  revealedFacts,
  STANCES,
  type DungeonDoc,
  type PredicateDoc,
  type PredicateForm,
  type Stance,
} from './dungeonYaml';
import { factionChoices, factNote } from './factionRules';

export interface PredicateEditorProps {
  doc: DungeonDoc;
  value: PredicateDoc | undefined;
  onChange: (next: PredicateDoc | undefined) => void;
  /** Prefix for every test id inside: `${testId}-form`, `-round`, `-down`,
   * `-fact`, `-stance-a`, `-stance-b`, `-stance-is`, `-refusal`. */
  testId: string;
  /** What choosing no predicate means here — "the hostility never ends"
   * on an `until`, "placed at launch" on an `arrives`. */
  noneMeans: string;
  /** The refusals addressed to this predicate, in order. */
  refusals: readonly string[];
  /** An ending's `when` is REQUIRED: no "(none)" is offered, and the
   * select never answers undefined. `until` and `arrives` are optional. */
  required?: boolean;
}

/** The value a form starts with when the author picks it — the first
 * thing the dungeon offers, or blank with the refusal that says what to
 * do about it. */
function freshPredicate(doc: DungeonDoc, form: PredicateForm): PredicateDoc {
  switch (form) {
    case 'round':
      return { round: 1 };
    case 'down':
      return { down: namedMonsters(doc)[0]?.id ?? '' };
    case 'fact':
      return { fact: '' };
    case 'stance':
      return {
        stance: {
          between: [factionChoices(doc)[0] ?? '', PARTY],
          is: 'neutral',
        },
      };
  }
}

export function PredicateEditor({
  doc,
  value,
  onChange,
  testId,
  noneMeans,
  refusals,
  required = false,
}: PredicateEditorProps) {
  const form = value === undefined ? '' : predicateForm(value);
  const note = value === undefined ? null : factNote(doc, value);
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <select
        className="dg-input"
        data-testid={`${testId}-form`}
        aria-label="predicate form"
        value={form}
        onChange={(e) => {
          const next = e.target.value as PredicateForm | '';
          onChange(next === '' ? undefined : freshPredicate(doc, next));
        }}
      >
        {!required && <option value="">(none)</option>}
        {PREDICATE_FORMS.map((f) => (
          <option key={f} value={f}>
            {FORM_LABEL[f]}
          </option>
        ))}
      </select>
      {value !== undefined && 'round' in value && (
        <input
          className="dg-input"
          data-testid={`${testId}-round`}
          aria-label="round"
          type="number"
          min={1}
          step={1}
          value={value.round}
          onChange={(e) => onChange({ round: Number(e.target.value) || 0 })}
        />
      )}
      {value !== undefined && 'down' in value && (
        <DownPicker
          doc={doc}
          value={value.down}
          testId={`${testId}-down`}
          onChange={(down) => onChange({ down })}
        />
      )}
      {value !== undefined && 'fact' in value && (
        <FactBox
          doc={doc}
          value={value.fact}
          testId={`${testId}-fact`}
          onChange={(fact) => onChange({ fact })}
        />
      )}
      {value !== undefined && 'stance' in value && (
        <div className="flex gap-1 items-end flex-wrap">
          <FactionPicker
            doc={doc}
            value={value.stance.between[0]}
            testId={`${testId}-stance-a`}
            label="first faction"
            onChange={(a) =>
              onChange({
                stance: {
                  between: [a, value.stance.between[1]],
                  is: value.stance.is,
                },
              })
            }
          />
          <FactionPicker
            doc={doc}
            value={value.stance.between[1]}
            testId={`${testId}-stance-b`}
            label="second faction"
            onChange={(b) =>
              onChange({
                stance: {
                  between: [value.stance.between[0], b],
                  is: value.stance.is,
                },
              })
            }
          />
          <label className="dg-label">
            is
            <select
              className="dg-input"
              data-testid={`${testId}-stance-is`}
              aria-label="stance it folds to"
              value={value.stance.is}
              onChange={(e) =>
                onChange({
                  stance: {
                    between: value.stance.between,
                    is: e.target.value as Stance,
                  },
                })
              }
            >
              {STANCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {refusals.length > 0 ? (
        refusals.map((message, i) => (
          <div
            key={i}
            className="text-xs"
            data-testid={`${testId}-refusal`}
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            {message}
          </div>
        ))
      ) : note !== null ? (
        // THE COST, NOT A REFUSAL (R8): the dungeon allows an `until` on a
        // fact nobody reveals, and says what that buys.
        <div className="text-xs" data-testid={`${testId}-note`}>
          {note}
        </div>
      ) : (
        <div className="text-xs opacity-70">
          {value === undefined ? noneMeans : FORM_HELP[predicateForm(value)]}
        </div>
      )}
    </div>
  );
}

const FORM_LABEL: Record<PredicateForm, string> = {
  round: 'round — a fight reaches round N',
  down: 'down — a monster falls',
  fact: 'fact — something becomes known',
  stance: 'stance — two factions stand a certain way',
};

const FORM_HELP: Record<PredicateForm, string> = {
  round:
    'Holds once any fight in the run has started this round. Outside a fight it never holds.',
  down: 'Holds once that monster is Down.',
  fact: 'On an `until`: holds once the faction’s mind knows it. Carry a record that reveals it into the mind’s region.',
  stance: 'Holds once the pair’s stance folds to this value.',
};

/** The NAMED monsters, by id — a `{ down }` names a placement and only a
 * named one can be named. A value the file carries that names nothing
 * stays selectable, so the author sees what the file says. */
function DownPicker({
  doc,
  value,
  testId,
  onChange,
}: {
  doc: DungeonDoc;
  value: string;
  testId: string;
  onChange: (id: string) => void;
}) {
  const monsters = namedMonsters(doc);
  if (monsters.length === 0 && value === '') {
    return (
      <div className="text-xs opacity-70" data-testid={`${testId}-none`}>
        no monster in this dungeon has an id yet — select one and name it
      </div>
    );
  }
  return (
    <select
      className="dg-input"
      data-testid={testId}
      aria-label="monster"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {value !== '' && !monsters.some((m) => m.id === value) && (
        <option value={value}>{value}</option>
      )}
      {value === '' && <option value="">(pick a monster)</option>}
      {monsters.map((m) => (
        <option key={m.id} value={m.id}>
          {m.id} · {m.ref.split(':').pop()}
        </option>
      ))}
    </select>
  );
}

/** Free text with the revealed facts as suggestions — a fact is declared
 * by mention, so the box never refuses a word it has not seen. */
function FactBox({
  doc,
  value,
  testId,
  onChange,
}: {
  doc: DungeonDoc;
  value: string;
  testId: string;
  onChange: (fact: string) => void;
}) {
  const facts = revealedFacts(doc);
  const listId = `${testId}-suggestions`;
  return (
    <>
      <input
        className="dg-input"
        data-testid={testId}
        aria-label="fact"
        list={listId}
        placeholder={facts[0] ?? 'saved-wiseman'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId} data-testid={listId}>
        {facts.map((fact) => (
          <option key={fact} value={fact} />
        ))}
      </datalist>
    </>
  );
}

/** The declared factions and the party (`factionChoices`), keeping a value
 * the file carries that is no longer declared. */
export function FactionPicker({
  doc,
  value,
  testId,
  label,
  onChange,
}: {
  doc: DungeonDoc;
  value: string;
  testId: string;
  label: string;
  onChange: (id: string) => void;
}) {
  const choices = factionChoices(doc);
  return (
    <label className="dg-label flex-1">
      {label}
      <select
        className="dg-input"
        data-testid={testId}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {value === '' && <option value="">(pick a faction)</option>}
        {value !== '' && !choices.includes(value) && (
          <option value={value}>{value}</option>
        )}
        {choices.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
