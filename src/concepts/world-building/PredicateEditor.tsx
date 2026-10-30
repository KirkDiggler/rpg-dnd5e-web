/**
 * THE ONE PREDICATE EDITOR (rpg-project#578, S4-T3): a disposition's
 * `until`, a binding's `arrives` and an ending's `when` are the same
 * `PredicateSpec`, so one editor writes all three. Exactly one key per
 * predicate (`round`, `down`, `fact`, `stance`); the caller says which
 * forms it offers and whether "none" is a choice. An ending passes no
 * `none`, because the decoder requires its `when`.
 *
 * The value is written as typed. Whether a placement or a faction a form
 * names exists is the engine's to judge, at its own path.
 *
 * `not` IS OFFERED EVERYWHERE (rpg-project#719): the grammar makes it legal
 * wherever a predicate is, so the editor offers it after the caller's forms
 * and edits its one inner predicate with this same editor. Every caller of
 * this editor is a WAITED-FOR site (an until, an arrival, an ending's when),
 * where a `not` of a fact, a round or a fall holds from the start; the
 * engine's sentence for that is shown under the inner one
 * (`predicateNot.ts`), as Save & Play will say it.
 */
import {
  PARTY,
  predicateForm,
  STANCES,
  type PredicateDoc,
  type PredicateForm,
  type Stance,
} from '@/author/factionVocabulary';
import { factionNameOptions } from './factionNameOptions';
import { waitedNotRefusal } from './predicateNot';
import type { RoomGameplayData } from './roomDraft';
import type { SiteScope } from './siteScope';

export function FactionNameSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface PredicateEditorProps {
  value: PredicateDoc | undefined;
  onChange(next: PredicateDoc | undefined): void;
  /** The forms offered, in this order. */
  forms: readonly PredicateForm[];
  /** Every control's label prefix: "Until", "Arrives", "Ending when". */
  name: string;
  /** The form picker's visible words: "Until", "In reserve until". */
  label: string;
  /** The words for no predicate. Absent: a predicate is required, and an
   * absent value shows as unchosen. */
  none?: string;
  scope: SiteScope;
  room: Pick<RoomGameplayData, 'monsterDeclarations'>;
  /** Placement id to its shown name. */
  names: ReadonlyMap<string, string>;
  /** Inside a `not` of a `not`: the outer one carries the engine's one
   * sentence, so this one says nothing (rpg-project#719). */
  quiet?: boolean;
}

export function PredicateEditor({
  value,
  onChange,
  forms,
  name,
  label,
  none,
  scope,
  room,
  names,
  quiet,
}: PredicateEditorProps): React.JSX.Element {
  const form = value === undefined ? 'none' : predicateForm(value);
  const shown = value as unknown as Record<string, unknown> | undefined;
  const stance = shown?.stance as
    | { between: [string, string]; is: Stance }
    | undefined;
  return (
    <>
      <label>
        <span>{label}</span>
        <select
          aria-label={`${name} form`}
          value={form === 'none' && none === undefined ? '' : form}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') onChange(undefined);
            else if (next === 'not') onChange({ not: notInnerFor(value) });
            else if (next === 'round') onChange({ round: 1 });
            else if (next === 'down')
              onChange({ down: room.monsterDeclarations[0]?.id ?? '' });
            else if (next === 'fact')
              onChange({ fact: (shown?.fact as string) ?? '' });
            else
              onChange({
                stance: {
                  between: stance?.between ?? [PARTY, PARTY],
                  is: stance?.is ?? 'hostile',
                },
              });
          }}
        >
          {none !== undefined ? (
            <option value="none">{none}</option>
          ) : (
            form === 'none' && (
              <option value="" disabled>
                Choose a condition
              </option>
            )
          )}
          {forms.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
          <option value="not">not</option>
        </select>
      </label>
      {value !== undefined && 'not' in value && (
        <NotEditor
          value={value}
          onChange={onChange}
          forms={forms}
          name={name}
          scope={scope}
          room={room}
          names={names}
          quiet={quiet}
        />
      )}
      {form === 'round' && (
        <label>
          <span>Round</span>
          <input
            type="number"
            step={1}
            aria-label={`${name} round`}
            value={String(shown?.round ?? 1)}
            onChange={(event) =>
              onChange({ round: Number(event.target.value) })
            }
          />
        </label>
      )}
      {form === 'down' && (
        <label>
          <span>Placement</span>
          <select
            aria-label={`${name} placement`}
            value={(shown?.down as string) ?? ''}
            onChange={(event) => onChange({ down: event.target.value })}
          >
            <option value="">(choose a placement)</option>
            {room.monsterDeclarations.map((monster) => (
              <option key={monster.id} value={monster.id} title={monster.id}>
                {names.get(monster.id)}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'fact' && (
        <label>
          <span>Fact</span>
          <input
            aria-label={`${name} fact`}
            value={(shown?.fact as string) ?? ''}
            onChange={(event) => onChange({ fact: event.target.value })}
          />
        </label>
      )}
      {form === 'stance' && (
        <div className="wb-policy-until-stance">
          <FactionNameSelect
            label={`${name} stance first faction`}
            value={stance?.between[0] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onChange({
                stance: {
                  between: [next, stance?.between[1] ?? PARTY],
                  is: stance?.is ?? 'hostile',
                },
              })
            }
          />
          <FactionNameSelect
            label={`${name} stance second faction`}
            value={stance?.between[1] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onChange({
                stance: {
                  between: [stance?.between[0] ?? PARTY, next],
                  is: stance?.is ?? 'hostile',
                },
              })
            }
          />
          <label>
            <span>Is</span>
            <select
              aria-label={`${name} stance is`}
              value={stance?.is ?? 'hostile'}
              onChange={(event) =>
                onChange({
                  stance: {
                    between: stance?.between ?? [PARTY, PARTY],
                    is: event.target.value as Stance,
                  },
                })
              }
            >
              {STANCES.map((word) => (
                <option key={word} value={word}>
                  {word}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  );
}

/** The inner predicate a fresh `not` starts from: the predicate the author
 * already had, turned over, or a stance (the one form a waited-for `not` can
 * fire on). */
function notInnerFor(value: PredicateDoc | undefined): PredicateDoc {
  if (value !== undefined && !('not' in value)) return value;
  return { stance: { between: [PARTY, PARTY], is: 'neutral' } };
}

/** A `not`'s one inner predicate, edited by the same editor one level down,
 * with the engine's refusal under it when this `not` can never fire. */
function NotEditor({
  value,
  onChange,
  forms,
  name,
  scope,
  room,
  names,
  quiet,
}: Omit<PredicateEditorProps, 'label' | 'none' | 'value'> & {
  value: { not: PredicateDoc };
}): React.JSX.Element {
  const refusal = quiet ? undefined : waitedNotRefusal(value);
  return (
    <div className="wb-policy-until-not" data-testid={`${name} not`}>
      <PredicateEditor
        value={value.not}
        onChange={(inner) =>
          onChange(inner === undefined ? undefined : { not: inner })
        }
        forms={forms}
        name={`${name} not`}
        label="Not"
        scope={scope}
        room={room}
        names={names}
        quiet={'not' in value.not}
      />
      {refusal !== undefined && (
        <p
          className="wb-entry-refusal"
          role="alert"
          data-testid={`${name} not refusal`}
        >
          {refusal}
        </p>
      )}
    </div>
  );
}
