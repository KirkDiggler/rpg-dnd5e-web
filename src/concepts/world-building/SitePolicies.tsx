/**
 * SitePolicies — the site's `factions` and `dispositions`, editable in the
 * `Policies` node (rpg-dnd5e-web#1160, design slices 3 and 4), plus the
 * inherited-vs-overridden split for one selected creature (slice 2, #1157).
 *
 * THE BUILDER IS A FORM BUILDER, NOTHING MORE. It renders controls over the
 * configuration the toolkit already accepts; it never decides which entry
 * fires, never sums a weight, and never reads a `when` — it writes a document.
 * The reference for acceptable shape is the engine's own pinned example,
 * `fixtures/worldBuilderV4Site.yaml`.
 *
 * THE SERVER OWNS SEMANTICS. This form does not cascade a renamed id into the
 * references that name it, does not gate a `mind` on membership, does not
 * refuse a `temper` share or an `until` a pair should not carry. It writes what
 * the author said and the ENGINE refuses what it will not accept, in its own
 * words — the published document is validated against the server through the
 * publish panel's `validate_only` call, which surfaces the engine's
 * path-addressed messages verbatim. The strict-SHAPE layer (unknown words,
 * unrepresentable mappings) still runs on the way out, so a document that
 * cannot be represented fails to encode rather than corrupting state.
 *
 * WORDS COME FROM THE ONE DECLARATION. The entry words are found by ASKING
 * `answerVocabulary.ts` (so a word the engine adds shows up with no change
 * here), and each word's value control is chosen by the SHAPE the declaration
 * gives it. Nothing restates a word.
 */
import {
  ANSWER_AT_SELECTOR,
  ANSWER_SELECTOR_WORDS,
  ANSWER_TEMPER,
  ANSWER_TRIGGERS,
  ANSWER_WHEN,
  answerTrigger,
  answerWhenLegalOn,
  answerWord,
  answerWordsForTrigger,
} from '@/author/answerVocabulary';
import {
  MONSTERS,
  PARTY,
  PREDICATE_FORMS,
  STANCES,
  predicateForm,
  type PredicateDoc,
  type Stance,
} from '@/author/factionVocabulary';
import { paletteNameForRef } from '@/author/paletteData';
import { useState } from 'react';
import type {
  AnswerEntryShape,
  AnswerTableShape,
  AnswerWhenShape,
} from './answerTableShape';
import {
  addMonsterAction,
  addMonsterAnswerEntry,
  addMonsterCheck,
  addMonsterHold,
  moveMonsterAction,
  patchMonsterAnswerEntry,
  patchMonsterCheck,
  removeMonsterAction,
  removeMonsterAnswerEntry,
  removeMonsterCheck,
  removeMonsterHold,
  setMonsterArrives,
  setMonsterTemper,
} from './monsterOrderEdits';
import type {
  RoomCheckApproach,
  RoomGameplayData,
  RoomMonsterBinding,
  RoomMonsterPlacement,
} from './roomDraft';
import { WEAPON_REF_RE } from './roomDraft';
import {
  addSiteAnswerEntry,
  addSiteDisposition,
  addSiteFaction,
  entryWord,
  patchSiteAnswerEntry,
  patchSiteFaction,
  removeSiteAnswerEntry,
  removeSiteDisposition,
  removeSiteFaction,
  renameSiteFaction,
  setAnswerEntryWord,
  updateSiteDisposition,
} from './sitePolicyEdits';
import type {
  SiteDisposition,
  SiteFaction,
  SiteScope,
  SiteTemper,
} from './siteScope';

/** A faction's `temper:` as written — one sealed word, or the word→share mix
 * it deals one from per member. */
function factionTemperText(temper: SiteTemper): string {
  if (typeof temper === 'string') return temper;
  return Object.entries(temper)
    .map(([word, share]) => `${word} ×${share}`)
    .join(' · ');
}

/** What the entry's word acts on, by the SHAPE the declaration gives the
 * word — `string` carries an opaque id, `selector` a sealed word or an
 * authored `at:` cell, and `none` carries nothing so it renders bare. */
function entryWordText(entry: AnswerEntryShape, word: string): string {
  const value = (entry as Record<string, unknown>)[word];
  const shape = answerWord(word)?.value;
  if (shape === 'string') return ` ${String(value)}`;
  if (shape === 'selector') {
    if (typeof value === 'string') return ` ${value}`;
    if (value && typeof value === 'object' && 'at' in value) {
      const [col, row] = (value as { at: [number, number] }).at;
      return ` at [${col}, ${row}]`;
    }
  }
  return '';
}

/** A `when:` as written — one exclusive enemy band, or one deed with its span.
 * The shape carries exactly one key, so the key IS the condition. */
function whenText(when: AnswerWhenShape): string {
  if ('enemy' in when) return `enemy ${when.enemy}`;
  const [deed, span] = Object.entries(when)[0] as [string, { within: number }];
  return `${deed} within ${span.within}`;
}

/** One entry: its condition (when it is on the table at all), its weight (an
 * omitted weight IS 1 to the engine), the `say` that goes with it, and the one
 * word it does. */
function entryText(entry: AnswerEntryShape): string {
  const parts = [
    entry.when === undefined ? 'any time' : `when ${whenText(entry.when)}`,
  ];
  parts.push(`weight ${entry.weight ?? 1}`);
  if (entry.say !== undefined) parts.push(`say “${entry.say}”`);
  const word = entryWord(entry);
  if (word !== undefined) parts.push(`${word}${entryWordText(entry, word)}`);
  return parts.join(' · ');
}

/** A `until:` predicate, in the form names the vocabulary seals. */
function predicateText(predicate: PredicateDoc): string {
  const form = predicateForm(predicate);
  if (form === 'round')
    return `round ${(predicate as { round: number }).round}`;
  if (form === 'down') return `down ${(predicate as { down: string }).down}`;
  if (form === 'fact') return `fact ${(predicate as { fact: string }).fact}`;
  const stance = (
    predicate as { stance: { between: [string, string]; is: string } }
  ).stance;
  return `stance ${stance.between[0]} ↔ ${stance.between[1]} is ${stance.is}`;
}

/** A check route list as one line of text — the read-only form of
 * `intimidate:`/`persuade:` (`dc 12 intimidation`, `dc 15 strength via
 * dnd5e:items:crowbar`). */
function checkText(rows: RoomCheckApproach[]): string {
  return rows
    .map((row) =>
      row.tool === undefined
        ? `dc ${row.dc} ${row.ability}`
        : `dc ${row.dc} ${row.ability} via ${row.tool}`
    )
    .join(', ');
}

/** The read-only `on:` table a creature INHERITS or OVERRIDES — the slice-2
 * facts view, which stays a readout: the faction owns the table, so it is
 * edited in the `Policies` node and never from inside a creature's panel. */
function AnswerTableReadout({ table }: { table: AnswerTableShape }) {
  return (
    <ul className="wb-policy-table">
      {Object.entries(table).map(([trigger, entries]) => (
        <li key={trigger}>
          <span className="wb-policy-trigger">{trigger}</span>
          <ul>
            {entries.map((entry, index) => (
              <li key={index}>{entryText(entry)}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ---------------------------------------------------------------------------
// The entry's `when:` — the condition that puts a row ON the table at all
// (rpg-dnd5e-web#1192, rpg-project#465 §2, rpg-toolkit#1871)
// ---------------------------------------------------------------------------

/** One `when:` as a form value: the enemy band, or the deed, or neither. The
 * two are EXCLUSIVE — the engine refuses a `when` naming both or neither
 * (`validateWhen`), so this models the choice as one picker rather than two
 * checkboxes that could express an illegal state. */
type WhenForm =
  | { kind: 'any' }
  | { kind: 'enemy'; band: string }
  | {
      kind: 'deed';
      deed: string;
      within: number;
    };

/** Read a written `when` into the form. Absent is `any` — the authored state
 * "this row is always eligible". */
function whenFormOf(when: AnswerWhenShape | undefined): WhenForm {
  if (when === undefined) return { kind: 'any' };
  if ('enemy' in when) return { kind: 'enemy', band: when.enemy };
  const [deed, span] = Object.entries(when)[0] as [string, { within: number }];
  return { kind: 'deed', deed, within: span.within };
}

/** Whether a written `when` names a DEED — the condition under which the
 * `actor` selector is legal ("`actor` names the actor of a deed and this entry
 * names none", `answer.go`). Used to keep the selector list honest when a
 * condition is cleared. */
function whenNamesDeed(when: AnswerWhenShape | undefined): boolean {
  return when !== undefined && !('enemy' in when);
}

/** The `when:` control. LEGAL ON `time` ALONE — a social key IS already the
 * condition (`intimidated` means the threat landed), so the caller does not
 * render this at all on a social trigger rather than rendering a disabled one.
 *
 * THE FIRST CONTROL IN THE ROW, because it gates whether the row can fire
 * before it says what the row does. `(any time)` is the default and the honest
 * empty state: the builder does not invent a band the author did not choose.
 * Band and deed words come from `ANSWER_WHEN`, so a band or deed the engine
 * adds appears here with no change. */
function AnswerWhenEditor({
  trigger,
  when,
  onCommit,
}: {
  trigger: string;
  when: AnswerWhenShape | undefined;
  onCommit: (when: AnswerWhenShape | undefined) => void;
}) {
  const form = whenFormOf(when);
  /** The picker's own value: `any`, `enemy:<band>`, or `deed:<word>`. One
   * select, so the exclusive choice is structural rather than validated. */
  const picker =
    form.kind === 'any'
      ? 'any'
      : form.kind === 'enemy'
        ? `enemy:${form.band}`
        : `deed:${form.deed}`;

  return (
    <label className="wb-policy-when">
      <span>When</span>
      <select
        aria-label={`When for ${trigger} entry`}
        value={picker}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'any') onCommit(undefined);
          else if (next.startsWith('enemy:'))
            onCommit({ enemy: next.slice('enemy:'.length) });
          else {
            const deed = next.slice('deed:'.length);
            // A NEW DEED KEEPS THE AUTHOR'S SPAN IF ONE WAS TYPED, else starts
            // at the engine's floor (a span is counted from 1).
            onCommit({
              [deed]: {
                within:
                  form.kind === 'deed'
                    ? form.within
                    : ANSWER_WHEN.minimumWithin,
              },
            } as AnswerWhenShape);
          }
        }}
      >
        <option value="any">(any time) — always eligible</option>
        {ANSWER_WHEN.enemyBands.map((band) => (
          <option key={`enemy:${band}`} value={`enemy:${band}`}>
            an enemy is {band}
          </option>
        ))}
        {ANSWER_WHEN.deeds.map((deed) => (
          <option key={`deed:${deed}`} value={`deed:${deed}`}>
            this creature was {deed}
          </option>
        ))}
      </select>
      {form.kind === 'deed' && (
        <input
          type="number"
          step={1}
          min={ANSWER_WHEN.minimumWithin}
          aria-label={`Within for ${trigger} entry`}
          value={String(form.within)}
          onChange={(event) =>
            onCommit({
              [form.deed]: { within: Number(event.target.value) },
            } as AnswerWhenShape)
          }
        />
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// The shared `on:` table
// ---------------------------------------------------------------------------

/** One entry row: its weight, its `say`, and its ONE word. Every control
 * writes what the author set; whether the entry is legal is the server's call,
 * and `when` is carried verbatim because the builder never reads it. */
function AnswerEntryRow({
  trigger,
  entry,
  onCommit,
  onRemove,
  allowCellSelector = true,
}: {
  trigger: string;
  entry: AnswerEntryShape;
  onCommit: (entry: AnswerEntryShape) => void;
  onRemove: () => void;
  /** A PLACEMENT'S table may not name a cell: `{ at: [col, row] }` is refused
   * by name on a binding, because this dialect's cells are axial and the same
   * bytes would mean two things in the two dialects. A faction's table keeps
   * it. Defaults to `true` so the faction editor is untouched — a control that
   * can never save is not authoring, it is a trap. */
  allowCellSelector?: boolean;
}) {
  const words = answerWordsForTrigger(trigger);
  const word = entryWord(entry) ?? words[0]?.key ?? '';
  const spec = answerWord(word);
  const value = (entry as Record<string, unknown>)[word];
  /** `at:` is offered only where the engine accepts it — the `toward` word on a
   * FACTION's table. See the prop's own note. */
  const cellSelectorAllowed =
    allowCellSelector && word === ANSWER_AT_SELECTOR.onlyWord;
  /** `when` is legal on `time` alone; a social key IS the condition. */
  const whenLegal = answerWhenLegalOn(trigger);
  /** `actor` needs a deed to have been the actor of. Offered only when this
   * entry's `when` names one, so the list never offers an illegal choice —
   * and the engine's own sentence stays the backstop for a hand-written file. */
  const actorLegal = whenNamesDeed(entry.when);
  const selectorWords = ANSWER_SELECTOR_WORDS.filter(
    (selector) => selector.key !== 'actor' || actorLegal
  );

  const withWordValue = (next: unknown): AnswerEntryShape => {
    const draft = { ...(entry as Record<string, unknown>) } as AnswerEntryShape;
    (draft as Record<string, unknown>)[word] = next;
    return draft;
  };

  /** Set or clear the condition. CLEARING IT ALSO CLEARS AN `actor` SELECTOR,
   * because `actor` without a deed is refused by name and leaving it behind
   * would publish a document the engine rejects — the one place this form
   * edits a second field, and it does so only to avoid writing a known-bad
   * state. Any other selector is left exactly as the author set it. */
  const withWhen = (when: AnswerWhenShape | undefined): void => {
    const next: AnswerEntryShape = { ...entry };
    if (when === undefined) delete next.when;
    else next.when = when;
    if (
      spec?.value === 'selector' &&
      value === 'actor' &&
      !whenNamesDeed(when)
    ) {
      (next as Record<string, unknown>)[word] =
        ANSWER_SELECTOR_WORDS[0]?.key ?? 'enemy';
    }
    onCommit(next);
  };

  return (
    <li className="wb-policy-entry" data-entry-word={word}>
      {whenLegal && (
        <AnswerWhenEditor
          trigger={trigger}
          when={entry.when}
          onCommit={withWhen}
        />
      )}
      <label>
        <span>Weight</span>
        <input
          type="number"
          step={1}
          aria-label={`Weight for ${trigger} entry`}
          value={entry.weight === undefined ? '' : String(entry.weight)}
          placeholder="1"
          onChange={(event) => {
            const raw = event.target.value;
            const next: AnswerEntryShape = { ...entry };
            if (raw === '') delete next.weight;
            else next.weight = Number(raw);
            onCommit(next);
          }}
        />
      </label>
      <label>
        <span>Say</span>
        <input
          aria-label={`Say for ${trigger} entry`}
          value={entry.say ?? ''}
          onChange={(event) => {
            const next: AnswerEntryShape = { ...entry };
            if (event.target.value === '') delete next.say;
            else next.say = event.target.value;
            onCommit(next);
          }}
        />
      </label>
      <label>
        <span>One word</span>
        <select
          aria-label={`Word for ${trigger} entry`}
          value={word}
          onChange={(event) =>
            onCommit(setAnswerEntryWord(entry, event.target.value))
          }
        >
          {words.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label} ({candidate.key})
            </option>
          ))}
        </select>
      </label>
      {spec?.value === 'string' && (
        <label>
          <span>{word}</span>
          <input
            aria-label={`${word} for ${trigger} entry`}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onCommit(withWordValue(event.target.value))}
          />
        </label>
      )}
      {spec?.value === 'selector' && (
        <>
          <label>
            <span>{word} acts on</span>
            <select
              aria-label={`${word} selector for ${trigger} entry`}
              value={
                typeof value === 'string'
                  ? value
                  : cellSelectorAllowed
                    ? ANSWER_AT_SELECTOR.key
                    : (ANSWER_SELECTOR_WORDS[0]?.key ?? '')
              }
              onChange={(event) =>
                onCommit(
                  withWordValue(
                    event.target.value === ANSWER_AT_SELECTOR.key
                      ? { at: [0, 0] }
                      : event.target.value
                  )
                )
              }
            >
              {selectorWords.map((selector) => (
                <option key={selector.key} value={selector.key}>
                  {selector.label} ({selector.key})
                </option>
              ))}
              {cellSelectorAllowed && (
                <option value={ANSWER_AT_SELECTOR.key}>
                  {ANSWER_AT_SELECTOR.label} ({ANSWER_AT_SELECTOR.key})
                </option>
              )}
            </select>
          </label>
          {cellSelectorAllowed &&
            isMapping(value) &&
            Array.isArray(value.at) && (
              <label>
                <span>Cell</span>
                <span className="wb-policy-cell">
                  {([0, 1] as const).map((axis) => {
                    const at = value.at as [number, number];
                    return (
                      <input
                        key={axis}
                        type="number"
                        step={1}
                        aria-label={`${
                          axis === 0 ? 'Column' : 'Row'
                        } for ${trigger} entry`}
                        value={String(at[axis] ?? 0)}
                        onChange={(event) => {
                          const cell = [...at] as [number, number];
                          cell[axis] = Number(event.target.value);
                          onCommit(withWordValue({ at: cell }));
                        }}
                      />
                    );
                  })}
                </span>
              </label>
            )}
        </>
      )}
      <button
        type="button"
        className="wb-danger"
        aria-label={`Remove ${trigger} entry`}
        onClick={onRemove}
      >
        Remove entry
      </button>
      <p className="wb-help">{entryText(entry)}</p>
    </li>
  );
}

/** One faction's shared table: its authored triggers, each with its entries,
 * and a trigger picker for the ones it does not carry yet. Triggers come from
 * `ANSWER_TRIGGERS`; the builder never invents one. */
function FactionTableEditor({
  scope,
  faction,
  onChange,
}: {
  scope: SiteScope;
  faction: SiteFaction;
  onChange: (next: SiteScope) => void;
}) {
  const table = faction.on ?? {};
  const authored = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] !== undefined
  );
  const available = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] === undefined
  );
  const [newTrigger, setNewTrigger] = useState(available[0] ?? '');
  return (
    <div className="wb-policy-table-editor">
      <p className="wb-help">Shared table its members inherit.</p>
      {authored.length === 0 && (
        <p className="wb-help">No shared table is authored.</p>
      )}
      {authored.map((trigger) => (
        <div key={trigger} className="wb-policy-trigger-block">
          <p className="wb-policy-trigger">
            <code>{trigger}</code>{' '}
            {answerTrigger(trigger)?.label ?? 'Unknown trigger'}
          </p>
          <ul className="wb-policy-entries">
            {(table[trigger] ?? []).map((entry, index) => (
              <AnswerEntryRow
                key={index}
                trigger={trigger}
                entry={entry}
                onCommit={(next) =>
                  onChange(
                    patchSiteAnswerEntry(
                      scope,
                      faction.id,
                      trigger,
                      index,
                      next
                    )
                  )
                }
                onRemove={() =>
                  onChange(
                    removeSiteAnswerEntry(scope, faction.id, trigger, index)
                  )
                }
              />
            ))}
          </ul>
        </div>
      ))}
      {available.length > 0 && (
        <div className="wb-actions">
          <select
            aria-label={`Add trigger to ${faction.id}`}
            value={newTrigger}
            onChange={(event) => setNewTrigger(event.target.value)}
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {answerTrigger(key)?.label ?? key} ({key})
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Add entry on ${newTrigger} to ${faction.id}`}
            onClick={() =>
              onChange(addSiteAnswerEntry(scope, faction.id, newTrigger))
            }
          >
            Add entry on {newTrigger}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

/** A faction's `temper:` editor — absent, one sealed word, or a word→share
 * mix. The words are the declaration's; the share is written as typed and the
 * server decides whether it can be dealt. */
function FactionTemperEditor({
  temper,
  onCommit,
}: {
  temper: SiteTemper | undefined;
  onCommit: (temper: SiteTemper | undefined) => void;
}) {
  const mode =
    temper === undefined ? 'none' : typeof temper === 'string' ? 'word' : 'mix';
  return (
    <div className="wb-policy-temper">
      <label>
        <span>Temper</span>
        <select
          aria-label="Temper shape"
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') onCommit(undefined);
            else if (next === 'word')
              onCommit(
                typeof temper === 'string' ? temper : ANSWER_TEMPER.words[0]
              );
            else
              onCommit(
                temper !== undefined && typeof temper === 'object'
                  ? temper
                  : { [ANSWER_TEMPER.words[0]!]: 1 }
              );
          }}
        >
          <option value="none">Absent — the default soldier</option>
          <option value="word">One word</option>
          <option value="mix">A mix of words</option>
        </select>
      </label>
      {mode === 'word' && (
        <label>
          <span>Word</span>
          <select
            aria-label="Temper word"
            value={typeof temper === 'string' ? temper : ANSWER_TEMPER.words[0]}
            onChange={(event) => onCommit(event.target.value)}
          >
            {ANSWER_TEMPER.words.map((word) => (
              <option key={word} value={word}>
                {word}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'mix' && (
        <div className="wb-policy-mix">
          {ANSWER_TEMPER.words.map((word) => {
            const share = isMapping(temper) ? temper[word] : undefined;
            return (
              <label key={word}>
                <span>{word}</span>
                <input
                  type="number"
                  step={1}
                  aria-label={`${word} share`}
                  value={share === undefined ? '' : String(share)}
                  placeholder="0"
                  onChange={(event) => {
                    const raw = event.target.value;
                    const next: Record<string, number> = isMapping(temper)
                      ? { ...(temper as Record<string, number>) }
                      : {};
                    if (raw === '') delete next[word];
                    else next[word] = Number(raw);
                    onCommit(next);
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
      <p className="wb-help">
        {temper === undefined
          ? 'No temperament is authored — a soldier, every factor 100.'
          : `temper ${factionTemperText(temper)}`}
      </p>
    </div>
  );
}

function FactionRow({
  scope,
  faction,
  onChange,
  onNotice,
}: {
  scope: SiteScope;
  faction: SiteFaction;
  onChange: (nextScope: SiteScope) => void;
  onNotice?: (message: string) => void;
}) {
  const [typedId, setTypedId] = useState(faction.id);
  const commitId = () => {
    if (typedId === faction.id) return;
    onChange(renameSiteFaction(scope, faction.id, typedId));
    onNotice?.(
      `Renamed the faction “${faction.id}” to “${typedId}”. References that still name “${faction.id}” are the engine’s to refuse.`
    );
  };
  return (
    <li className="wb-policy-faction" data-faction-id={faction.id}>
      <details className="wb-policy-row" data-testid={`faction-${faction.id}`}>
        {/* THE LINE IS THE ID (rpg-dnd5e-web#1178 follow-up): a faction is one
            noun, and its id is what names it. Its temper and its shared answer
            table are the form behind it. */}
        <summary aria-label={`Faction ${faction.id}`}>{faction.id}</summary>
        <div className="wb-policy-form">
          <label>
            <span>Id</span>
            <input
              aria-label={`Faction id for ${faction.id}`}
              value={typedId}
              onChange={(event) => setTypedId(event.target.value)}
              onBlur={commitId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitId();
              }}
            />
          </label>
          <p className="wb-help">
            A placement’s `faction`, a disposition’s `between` and a `stance`
            predicate all name this id. Renaming writes the declaration; the
            server refuses any reference that no longer resolves.
          </p>

          <label>
            <span>Mind</span>
            <input
              aria-label={`Mind for ${faction.id}`}
              value={faction.mind ?? ''}
              placeholder="a placement id"
              onChange={(event) =>
                onChange(
                  patchSiteFaction(scope, faction.id, {
                    mind:
                      event.target.value === ''
                        ? undefined
                        : event.target.value,
                  })
                )
              }
            />
          </label>
          <p className="wb-help">
            The faction knows what its mind knows. Whether this names a
            placement in the faction is the server’s to check.
          </p>

          <FactionTemperEditor
            temper={faction.temper}
            onCommit={(temper) =>
              onChange(patchSiteFaction(scope, faction.id, { temper }))
            }
          />

          <FactionTableEditor
            scope={scope}
            faction={faction}
            onChange={onChange}
          />

          <button
            type="button"
            className="wb-danger"
            aria-label={`Remove faction ${faction.id}`}
            onClick={() => onChange(removeSiteFaction(scope, faction.id))}
          >
            Remove faction
          </button>
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Dispositions
// ---------------------------------------------------------------------------

/** The ids a `between` may name: the reserved `party` and `monsters` always
 * (they are words, not declarations), plus every declared faction, plus any
 * name this document already carries so a hand-written file is shown as
 * written rather than silently rewritten. */
function factionNameOptions(
  scope: SiteScope,
  ...values: Array<string | undefined>
): string[] {
  const options = [PARTY, MONSTERS, ...(scope.factions ?? []).map((f) => f.id)];
  for (const value of values) {
    if (value && !options.includes(value)) options.push(value);
  }
  return options;
}

function FactionNameSelect({
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

/** The `until:` predicate editor. Four forms, exactly one key; the value is
 * written as typed and the server judges whether the pair may carry it. */
function UntilEditor({
  scope,
  room,
  disposition,
  onCommit,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  disposition: SiteDisposition;
  onCommit: (until: PredicateDoc | undefined) => void;
}) {
  const until = disposition.until;
  const form = until === undefined ? 'none' : predicateForm(until);
  const shown = until as unknown as Record<string, unknown> | undefined;
  const stance = shown?.stance as
    | { between: [string, string]; is: Stance }
    | undefined;
  return (
    <div className="wb-policy-until">
      <label>
        <span>Until</span>
        <select
          aria-label="Until form"
          value={form}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') onCommit(undefined);
            else if (next === 'round') onCommit({ round: 1 });
            else if (next === 'down')
              onCommit({ down: room.monsters[0]?.id ?? '' });
            else if (next === 'fact')
              onCommit({ fact: (shown?.fact as string) ?? '' });
            else
              onCommit({
                stance: {
                  between: stance?.between ?? [PARTY, PARTY],
                  is: stance?.is ?? 'hostile',
                },
              });
          }}
        >
          <option value="none">Never — the hostility does not end</option>
          {PREDICATE_FORMS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      {form === 'round' && (
        <label>
          <span>Round</span>
          <input
            type="number"
            step={1}
            aria-label="Until round"
            value={String(shown?.round ?? 1)}
            onChange={(event) =>
              onCommit({ round: Number(event.target.value) })
            }
          />
        </label>
      )}
      {form === 'down' && (
        <label>
          <span>Placement</span>
          <select
            aria-label="Until placement"
            value={(shown?.down as string) ?? ''}
            onChange={(event) => onCommit({ down: event.target.value })}
          >
            <option value="">(choose a placement)</option>
            {room.monsters.map((monster) => (
              <option key={monster.id} value={monster.id}>
                {monster.id} · {paletteNameForRef(monster.ref)}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'fact' && (
        <label>
          <span>Fact</span>
          <input
            aria-label="Until fact"
            value={(shown?.fact as string) ?? ''}
            onChange={(event) => onCommit({ fact: event.target.value })}
          />
        </label>
      )}
      {form === 'stance' && (
        <div className="wb-policy-until-stance">
          <FactionNameSelect
            label="Until stance first faction"
            value={stance?.between[0] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onCommit({
                stance: {
                  between: [next, stance?.between[1] ?? PARTY],
                  is: stance?.is ?? 'hostile',
                },
              })
            }
          />
          <FactionNameSelect
            label="Until stance second faction"
            value={stance?.between[1] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onCommit({
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
              aria-label="Until stance is"
              value={stance?.is ?? 'hostile'}
              onChange={(event) =>
                onCommit({
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
      <p className="wb-help">
        {until === undefined
          ? 'The hostility never ends.'
          : predicateText(until)}
      </p>
    </div>
  );
}

function DispositionRow({
  scope,
  room,
  index,
  disposition,
  onChange,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  index: number;
  disposition: SiteDisposition;
  onChange: (nextScope: SiteScope) => void;
}) {
  const [a, b] = disposition.between;
  const options = factionNameOptions(scope, a, b);
  return (
    <li
      className="wb-policy-disposition"
      data-disposition={disposition.between.join('|')}
    >
      <details className="wb-policy-row" data-testid={`disposition-${a}-${b}`}>
        {/* THE LINE IS THE ENTRY (rpg-dnd5e-web#1178 follow-up): a disposition
            is a pair, so the pair is what it reads as. The stance and the
            `until` are the form behind it. */}
        <summary aria-label={`Disposition between ${a} and ${b}`}>
          between {a} and {b}
          <span className="wb-policy-summary-note">
            {' '}
            · {disposition.stance}
          </span>
        </summary>
        <div className="wb-policy-form">
          <div className="wb-policy-pair">
            <FactionNameSelect
              label="Between first faction"
              value={a}
              options={options}
              onChange={(next) =>
                onChange(
                  updateSiteDisposition(scope, index, { between: [next, b] })
                )
              }
            />
            <FactionNameSelect
              label="Between second faction"
              value={b}
              options={options}
              onChange={(next) =>
                onChange(
                  updateSiteDisposition(scope, index, { between: [a, next] })
                )
              }
            />
          </div>
          <label>
            <span>Stance</span>
            <select
              aria-label="Stance"
              value={disposition.stance}
              onChange={(event) =>
                onChange(
                  updateSiteDisposition(scope, index, {
                    stance: event.target.value as Stance,
                  })
                )
              }
            >
              {STANCES.map((word) => (
                <option key={word} value={word}>
                  {word}
                </option>
              ))}
            </select>
          </label>
          <UntilEditor
            scope={scope}
            room={room}
            disposition={disposition}
            onCommit={(until) =>
              onChange(updateSiteDisposition(scope, index, { until }))
            }
          />
          <button
            type="button"
            className="wb-danger"
            aria-label={`Remove disposition ${disposition.between.join(' and ')}`}
            onClick={() => onChange(removeSiteDisposition(scope, index))}
          >
            Remove disposition
          </button>
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface SitePoliciesProps {
  scope: SiteScope;
  /** The open room's gameplay data — the placements an `until`'s `down` form
   * may name. */
  room: RoomGameplayData;
  /** The next scope. One call is one history transaction. */
  onChange: (nextScope: SiteScope) => void;
  /** Reports an edit that the server will have to judge, so it is never
   * silent. */
  onNotice?: (message: string) => void;
}

/** The site's FACTIONS: who fights as one side, each with its temperament
 * and its shared answer table. Its own top-level node — a faction is a
 * thing, and "Policies" was a wrapper that named nothing the rows did not
 * already name (rpg-dnd5e-web#1178 follow-up). */
export function FactionsPanel({
  scope,
  onChange,
  onNotice,
}: Omit<SitePoliciesProps, 'room'>) {
  const factions = scope.factions ?? [];
  return (
    <div data-testid="site-factions">
      <h4>Factions</h4>
      <div className="wb-actions">
        <button type="button" onClick={() => onChange(addSiteFaction(scope))}>
          Add faction
        </button>
      </div>
      {factions.length === 0 ? (
        <p className="wb-help" data-testid="policies-none">
          No factions are authored on this site. Every monster is on the
          reserved `monsters` side, and no disposition can be declared until a
          faction exists.
        </p>
      ) : (
        <ul className="wb-policy-list">
          {factions.map((faction) => (
            <FactionRow
              key={faction.id}
              scope={scope}
              faction={faction}
              onChange={onChange}
              onNotice={onNotice}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The site's DISPOSITIONS: how two sides stand to each other, and the
 * predicate that ends the hostility. Its own top-level node, beside
 * Factions — the pair a disposition is *about* is what it reads, and it is
 * a different noun from a faction. */
export function DispositionsPanel({
  scope,
  room,
  onChange,
}: Omit<SitePoliciesProps, 'onNotice'>) {
  const factions = scope.factions ?? [];
  const dispositions = scope.dispositions ?? [];
  return (
    <div data-testid="site-dispositions">
      <h4>Dispositions</h4>
      <div className="wb-actions">
        <button
          type="button"
          disabled={factions.length === 0}
          title={factions.length === 0 ? 'Declare a faction first' : undefined}
          onClick={() => onChange(addSiteDisposition(scope))}
        >
          Add disposition
        </button>
      </div>
      {dispositions.length === 0 ? (
        <p className="wb-help">
          No dispositions are authored. A declared faction is hostile to the
          party until you say otherwise.
        </p>
      ) : (
        <ul className="wb-policy-list">
          {dispositions.map((disposition, index) => (
            <DispositionRow
              key={`${disposition.between[0]}:${disposition.between[1]}:${index}`}
              scope={scope}
              room={room}
              index={index}
              disposition={disposition}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One selected creature — its own orders, editable (rpg-dnd5e-web#1164)
// ---------------------------------------------------------------------------

/** The creature's weapon list: ORDERED, and the order is the point. Both turn
 * drivers take the first action whose target is in reach, so this control
 * MOVES weapons rather than merely listing them — it is what authors "the
 * archer draws a scimitar only when cornered".
 *
 * THERE IS NO WEAPONS CATALOG ON THE WIRE. `rpg-project#448` opens that door
 * later (the web palette is its last step), and the engine carries these refs
 * and NEVER INTERPRETS them. So the author writes one, checked against the
 * SAME grammar the encoder uses, and the builder offers no list of its own
 * invention — a closed list here would assert a vocabulary the engine does not
 * have. */
function CreatureWeaponEditor({
  actions,
  onAdd,
  onRemove,
  onMove,
}: {
  actions: readonly string[];
  onAdd: (ref: string) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const usable = WEAPON_REF_RE.test(draft.trim());
  return (
    <div className="wb-policy-table-editor" data-testid="creature-weapons">
      <p className="wb-help">What it fights with, in order.</p>
      {actions.length === 0 ? (
        <p className="wb-help" data-testid="creature-weapons-none">
          No weapons authored — this creature keeps its kind’s default.
        </p>
      ) : (
        <ol className="wb-policy-list">
          {actions.map((ref, index) => (
            <li key={`${ref}-${index}`} className="wb-policy-entry">
              <code>{ref}</code>
              <div className="wb-actions">
                <button
                  type="button"
                  aria-label={`Move ${ref} earlier`}
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  aria-label={`Move ${ref} later`}
                  disabled={index === actions.length - 1}
                  onClick={() => onMove(index, index + 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Remove ${ref}`}
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>
              </div>
              {index === 0 && (
                <p className="wb-help">
                  First in reach — this is what it reaches for.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="wb-actions">
        <input
          aria-label="New weapon reference"
          value={draft}
          placeholder="dnd5e:weapons:shortbow"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          aria-label="Add weapon"
          disabled={!usable}
          onClick={() => {
            onAdd(draft.trim());
            setDraft('');
          }}
        >
          Add weapon
        </button>
      </div>
      {draft.trim() !== '' && !usable && (
        <p className="wb-help">
          A weapon reference looks like dnd5e:weapons:shortbow.
        </p>
      )}
    </div>
  );
}

/** A creature's `temper`: ONE WORD, or absent. Never a mix — the placement
 * names one creature, so dealing a spread for it would be an author rolling
 * for a goblin they have already described (`RoomMonsterBinding.Temper` is a
 * plain `string`). */
function CreatureTemperEditor({
  temper,
  onCommit,
}: {
  temper: string | undefined;
  onCommit: (temper: string | undefined) => void;
}) {
  return (
    <div className="wb-policy-temper">
      <label>
        <span>Temper</span>
        <select
          aria-label="Creature temper"
          value={temper ?? ''}
          onChange={(event) =>
            onCommit(event.target.value === '' ? undefined : event.target.value)
          }
        >
          <option value="">Absent — the faction’s word or mix stands</option>
          {ANSWER_TEMPER.words.map((word) => (
            <option key={word} value={word}>
              {word}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** The creature's OWN `on:` table — driven by the SAME one vocabulary
 * declaration the faction editor uses, with the one thing a placement may not
 * write left out: a selector may not name a cell here, because
 * `{ at: [col, row] }` is refused by name on a binding. */
function CreatureTableEditor({
  table,
  onAdd,
  onPatch,
  onRemove,
}: {
  table: AnswerTableShape;
  onAdd: (trigger: string) => void;
  onPatch: (trigger: string, index: number, entry: AnswerEntryShape) => void;
  onRemove: (trigger: string, index: number) => void;
}) {
  const authored = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] !== undefined
  );
  const available = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] === undefined
  );
  /** WHICH TRIGGER THE PICKER OPENS ON. `time` FIRST when it is offered: it is the
   * trigger a creature's OWN table is mostly about — what it does with its turn,
   * gated by a `when` — and it is the ONLY trigger the `when` editor is legal
   * on. Opening on a social key (the vocabulary's own order) points an author at
   * the half this slice is not about, and at a control with no condition on it.
   * Falls back to the vocabulary's order once `time` is authored. */
  const [newTrigger, setNewTrigger] = useState(
    available.includes('time') ? 'time' : (available[0] ?? '')
  );
  return (
    <div className="wb-policy-table-editor" data-testid="creature-table">
      <p className="wb-help">Its own table, laid over the faction’s.</p>
      {authored.length === 0 && (
        <p className="wb-help" data-testid="creature-table-none">
          No table of its own yet — the faction’s answers stand. Add a trigger
          below to give this creature its own row.
        </p>
      )}
      {authored.map((trigger) => (
        <div key={trigger} className="wb-policy-trigger-block">
          <p className="wb-policy-trigger">
            <code>{trigger}</code>{' '}
            {answerTrigger(trigger)?.label ?? 'Unknown trigger'}
          </p>
          <ul className="wb-policy-entries">
            {(table[trigger] ?? []).map((entry, index) => (
              <AnswerEntryRow
                key={index}
                trigger={trigger}
                entry={entry}
                allowCellSelector={false}
                onCommit={(next) => onPatch(trigger, index, next)}
                onRemove={() => onRemove(trigger, index)}
              />
            ))}
          </ul>
        </div>
      ))}
      {available.length > 0 && (
        <div className="wb-actions">
          <select
            aria-label="Add trigger to this creature"
            value={newTrigger}
            onChange={(event) => setNewTrigger(event.target.value)}
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {answerTrigger(key)?.label ?? key} ({key})
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Add entry on ${newTrigger} to this creature`}
            onClick={() => onAdd(newTrigger)}
          >
            Add entry on {newTrigger}
          </button>
        </div>
      )}
    </div>
  );
}

export interface CreatureOrdersProps {
  scope: SiteScope;
  monster: RoomMonsterPlacement;
  /** The room's gameplay data — what an `arrives`/`down` predicate picks a
   * placement from. Same data `Policies` already receives. */
  room: RoomGameplayData;
  binding?: RoomMonsterBinding;
  /** When given, the creature's `faction` is editable — the ACTOR carries
   * identity and placement (Decision 4), and the shared table stays the
   * faction's to edit in `Policies`. */
  onFactionChange?: (factionId: string | undefined) => void;
  /** When given, the creature's OWN orders are editable. It answers with this
   * creature's orders, or `undefined` for "this creature overrides nothing".
   * THE MAP IS THE CALLER'S: this component edits one creature and never holds
   * the room, so the caller folds the answer in with
   * `monsterOrderEdits.withBinding` — which is where an emptied creature
   * becomes a deleted entry rather than an empty block the encoder refuses. */
  onOrdersChange?: (next: RoomMonsterBinding | undefined) => void;
}

/** The `arrives:` predicate — the SAME four forms as a disposition's `until`,
 * because it is the same `PredicateSpec` the engine carries for all three
 * consumers: a disposition's `until`, a creature's `arrives`, and a placed
 * prop's `arrives` (rpg-project#488 R1). `(none)` means the thing stands there
 * from the first frame; a form holds it out of the run until it holds.
 *
 * EXPORTED since rpg-toolkit#1855 so the Props panel authors a prop's arrival
 * with THIS editor rather than a second one — the same reason there is one
 * predicate grammar. */
export function ArrivesEditor({
  scope,
  room,
  arrives,
  onCommit,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  arrives: PredicateDoc | undefined;
  onCommit: (next: PredicateDoc | undefined) => void;
}) {
  const form = arrives === undefined ? 'none' : predicateForm(arrives);
  const shown = arrives as unknown as Record<string, unknown> | undefined;
  const stance = shown?.stance as
    | { between: [string, string]; is: Stance }
    | undefined;
  return (
    <div className="wb-creature-arrives" data-testid="creature-arrives">
      <label>
        <span>In reserve until</span>
        <select
          aria-label="Arrives form"
          value={form}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') onCommit(undefined);
            else if (next === 'round') onCommit({ round: 1 });
            else if (next === 'down')
              onCommit({ down: room.monsters[0]?.id ?? '' });
            else if (next === 'fact')
              onCommit({ fact: (shown?.fact as string) ?? '' });
            else
              onCommit({
                stance: {
                  between: stance?.between ?? [PARTY, PARTY],
                  is: stance?.is ?? 'hostile',
                },
              });
          }}
        >
          <option value="none">Standing here from the first frame</option>
          {PREDICATE_FORMS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      {form === 'round' && (
        <label>
          <span>Round</span>
          <input
            type="number"
            step={1}
            aria-label="Arrives round"
            value={String(shown?.round ?? 1)}
            onChange={(event) =>
              onCommit({ round: Number(event.target.value) })
            }
          />
        </label>
      )}
      {form === 'down' && (
        <label>
          <span>Placement</span>
          <select
            aria-label="Arrives placement"
            value={(shown?.down as string) ?? ''}
            onChange={(event) => onCommit({ down: event.target.value })}
          >
            <option value="">(choose a placement)</option>
            {room.monsters.map((monster) => (
              <option key={monster.id} value={monster.id}>
                {monster.id} · {paletteNameForRef(monster.ref)}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'fact' && (
        <label>
          <span>Fact</span>
          <input
            aria-label="Arrives fact"
            value={(shown?.fact as string) ?? ''}
            onChange={(event) => onCommit({ fact: event.target.value })}
          />
        </label>
      )}
      {form === 'stance' && (
        <div className="wb-policy-until-stance">
          <FactionNameSelect
            label="Arrives stance first faction"
            value={stance?.between[0] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onCommit({
                stance: {
                  between: [next, stance?.between[1] ?? PARTY],
                  is: stance?.is ?? 'hostile',
                },
              })
            }
          />
          <FactionNameSelect
            label="Arrives stance second faction"
            value={stance?.between[1] ?? PARTY}
            options={factionNameOptions(
              scope,
              stance?.between[0],
              stance?.between[1]
            )}
            onChange={(next) =>
              onCommit({
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
              aria-label="Arrives stance is"
              value={stance?.is ?? 'hostile'}
              onChange={(event) =>
                onCommit({
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
      <p className="wb-help" data-testid="creature-arrives-note">
        {arrives === undefined
          ? 'This creature is in the run from the first frame.'
          : `Held in reserve until ${predicateText(arrives)}.`}
      </p>
    </div>
  );
}

/** The check rows a creature carries under `intimidate:`/`persuade:`. Each row
 * is one authored route (`{ ability, dc, tool? }`), CARRIED verbatim: whether
 * an ability ref resolves and what an absent DC derives is the engine's
 * judgement, so the form never validates either. An empty list is refused by
 * the encoder, which is why the last row's removal goes through
 * `removeMonsterCheck` and deletes the key. */
function CreatureCheckEditor({
  label,
  testId,
  rows,
  onAdd,
  onPatch,
  onRemove,
}: {
  label: string;
  testId: string;
  rows: RoomCheckApproach[];
  onAdd: (row: RoomCheckApproach) => void;
  onPatch: (index: number, row: RoomCheckApproach) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="wb-creature-checks" data-testid={testId}>
      <h6>{label}</h6>
      {rows.length === 0 ? (
        <p className="wb-help" data-testid={`${testId}-none`}>
          Nothing authored — the rulebook derives the DC from the stat block.
        </p>
      ) : (
        <ul className="wb-policy-entries">
          {rows.map((row, index) => (
            <li key={index} className="wb-policy-entry">
              <label>
                <span>Ability</span>
                <input
                  aria-label={`${label} ability ${index}`}
                  value={row.ability}
                  onChange={(event) =>
                    onPatch(index, { ...row, ability: event.target.value })
                  }
                />
              </label>
              <label>
                <span>DC</span>
                <input
                  type="number"
                  step={1}
                  aria-label={`${label} dc ${index}`}
                  value={String(row.dc)}
                  onChange={(event) =>
                    onPatch(index, { ...row, dc: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Tool</span>
                <input
                  aria-label={`${label} tool ${index}`}
                  value={row.tool ?? ''}
                  placeholder="(none)"
                  onChange={(event) => {
                    const next: RoomCheckApproach = {
                      ability: row.ability,
                      dc: row.dc,
                    };
                    // ABSENT WHEN UNAUTHORED: an empty box removes the key
                    // rather than writing `tool: ''`.
                    if (event.target.value !== '')
                      next.tool = event.target.value;
                    onPatch(index, next);
                  }}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${label} row ${index}`}
                onClick={() => onRemove(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-label={`Add ${label} row`}
        onClick={() => onAdd({ ability: '', dc: 1 })}
      >
        Add route
      </button>
    </div>
  );
}

/** The intel records this creature CARRIES (`holds`). The record itself is a
 * site noun edited in the Intel panel — this is only which of them this
 * creature holds, so the picker offers what the site declares and never
 * invents one. */
function CreatureHoldsEditor({
  scope,
  holds,
  onAdd,
  onRemove,
}: {
  scope: SiteScope;
  holds: string[];
  onAdd: (recordId: string) => void;
  onRemove: (recordId: string) => void;
}) {
  const available = (scope.intel ?? []).filter(
    (record) => !holds.includes(record.id)
  );
  return (
    <div className="wb-creature-holds" data-testid="creature-holds">
      <h6>Carries (intel)</h6>
      {holds.length === 0 ? (
        <p className="wb-help" data-testid="creature-holds-none">
          This creature carries no intel records.
        </p>
      ) : (
        <ul className="wb-actor-list" aria-label="Held intel records">
          {holds.map((id) => (
            <li key={id} className="wb-actor-row">
              <span>{id}</span>
              <button
                type="button"
                aria-label={`Stop holding ${id}`}
                onClick={() => onRemove(id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>
        <span>Give a record</span>
        <select
          aria-label="Give intel record"
          value=""
          onChange={(event) => {
            if (event.target.value !== '') onAdd(event.target.value);
          }}
        >
          <option value="">(choose a record)</option>
          {available.map((record) => (
            <option key={record.id} value={record.id}>
              {record.id}
            </option>
          ))}
        </select>
      </label>
      {(scope.intel ?? []).length === 0 && (
        <p className="wb-help" data-testid="creature-holds-no-records">
          This site declares no intel records yet — add one in Intel.
        </p>
      )}
    </div>
  );
}

/** One selected creature, read as document facts: the faction it belongs to,
 * what that faction SUPPLIES, and what this placement's own orders block
 * OVERRIDES — with the two asymmetries stated where an author reads them.
 *
 * The OVERRIDES half becomes an editor when `onOrdersChange` is given, and
 * stays the read-only readout it has been since slice 2 when it is not. The
 * INHERITS half is always a readout and deliberately so: inheritance is what
 * confuses authors, and seeing it next to the overrides is what makes the
 * layering rule legible rather than merely stated.
 *
 * A `faction` key that is ABSENT is the kind's default (rpg-project#477
 * Decision 4), and is deliberately never rendered as a faction named
 * `monsters`: membership in the default side is spelled by absence, and
 * pinning a name on it would have the author believe they declared one. */
export function CreatureOrders({
  scope,
  monster,
  room,
  binding,
  onFactionChange,
  onOrdersChange,
}: CreatureOrdersProps) {
  const faction = monster.faction
    ? (scope.factions ?? []).find((entry) => entry.id === monster.faction)
    : undefined;
  return (
    <div className="wb-creature-orders" aria-label="Selected creature">
      <h4>Selected creature</h4>
      <p className="wb-help">
        {paletteNameForRef(monster.ref)} · {monster.id}
      </p>
      <dl className="wb-creature-orders-grid">
        <div>
          <dt>Faction</dt>
          <dd>
            {onFactionChange ? (
              <input
                aria-label="Creature faction"
                value={monster.faction ?? ''}
                placeholder="its kind’s default"
                onChange={(event) =>
                  onFactionChange(
                    event.target.value === '' ? undefined : event.target.value
                  )
                }
              />
            ) : (
              (monster.faction ??
              'None — this creature keeps its kind’s default.')
            )}
          </dd>
        </div>
      </dl>

      <div className="wb-policy-block">
        <h5>Inherits</h5>
        {monster.faction === undefined ? (
          <p className="wb-help" data-testid="creature-inherits-none">
            Nothing authored here — its kind’s default supplies the table.
          </p>
        ) : faction === undefined ? (
          <p className="wb-help" data-testid="creature-inherits-unknown">
            This site declares no faction with the id “{monster.faction}”.
          </p>
        ) : (
          <>
            {faction.temper !== undefined && (
              <p className="wb-help">
                temper {factionTemperText(faction.temper)}
              </p>
            )}
            {faction.on === undefined ? (
              <p className="wb-help">No shared table is authored.</p>
            ) : (
              <AnswerTableReadout table={faction.on} />
            )}
          </>
        )}
      </div>

      <div className="wb-policy-block">
        <h5>Overrides</h5>
        {onOrdersChange !== undefined ? (
          <>
            <CreatureWeaponEditor
              actions={binding?.actions ?? []}
              onAdd={(ref) => onOrdersChange(addMonsterAction(binding, ref))}
              onRemove={(index) =>
                onOrdersChange(removeMonsterAction(binding, index))
              }
              onMove={(from, to) =>
                onOrdersChange(moveMonsterAction(binding, from, to))
              }
            />
            <CreatureTemperEditor
              temper={binding?.temper}
              onCommit={(temper) =>
                onOrdersChange(setMonsterTemper(binding, temper))
              }
            />
            <CreatureTableEditor
              table={binding?.on ?? {}}
              onAdd={(trigger) =>
                onOrdersChange(addMonsterAnswerEntry(binding, trigger))
              }
              onPatch={(trigger, index, entry) =>
                onOrdersChange(
                  patchMonsterAnswerEntry(binding, trigger, index, entry)
                )
              }
              onRemove={(trigger, index) =>
                onOrdersChange(
                  removeMonsterAnswerEntry(binding, trigger, index)
                )
              }
            />
          </>
        ) : binding === undefined ? (
          <p className="wb-help" data-testid="creature-overrides-none">
            No orders block — this placement keeps everything its faction
            supplies.
          </p>
        ) : (
          <>
            {binding.temper !== undefined && (
              <p className="wb-help">temper {binding.temper}</p>
            )}
            {binding.on !== undefined && (
              <AnswerTableReadout table={binding.on} />
            )}
            {binding.actions !== undefined && (
              <p className="wb-help">actions {binding.actions.join(', ')}</p>
            )}
            {binding.intimidate !== undefined && (
              <p className="wb-help">
                intimidate {checkText(binding.intimidate)}
              </p>
            )}
            {binding.persuade !== undefined && (
              <p className="wb-help">persuade {checkText(binding.persuade)}</p>
            )}
            {binding.holds !== undefined && (
              <p className="wb-help">holds {binding.holds.join(', ')}</p>
            )}
            {binding.arrives !== undefined && (
              <p className="wb-help">
                held in reserve until {predicateText(binding.arrives)}
              </p>
            )}
          </>
        )}
      </div>

      {/* The creature's interaction and reserve facts (web#1176). They are
          neither inherited nor overridden — a faction never supplies them — so
          they are their own block rather than a row in Overrides. */}
      <div className="wb-policy-block">
        <h5>Interaction</h5>
        {onOrdersChange !== undefined ? (
          <>
            <CreatureCheckEditor
              label="Intimidate"
              testId="creature-intimidate"
              rows={binding?.intimidate ?? []}
              onAdd={(row) =>
                onOrdersChange(addMonsterCheck(binding, 'intimidate', row))
              }
              onPatch={(index, row) =>
                onOrdersChange(
                  patchMonsterCheck(binding, 'intimidate', index, row)
                )
              }
              onRemove={(index) =>
                onOrdersChange(removeMonsterCheck(binding, 'intimidate', index))
              }
            />
            <CreatureCheckEditor
              label="Persuade"
              testId="creature-persuade"
              rows={binding?.persuade ?? []}
              onAdd={(row) =>
                onOrdersChange(addMonsterCheck(binding, 'persuade', row))
              }
              onPatch={(index, row) =>
                onOrdersChange(
                  patchMonsterCheck(binding, 'persuade', index, row)
                )
              }
              onRemove={(index) =>
                onOrdersChange(removeMonsterCheck(binding, 'persuade', index))
              }
            />
            <CreatureHoldsEditor
              scope={scope}
              holds={binding?.holds ?? []}
              onAdd={(id) => onOrdersChange(addMonsterHold(binding, id))}
              onRemove={(id) => onOrdersChange(removeMonsterHold(binding, id))}
            />
            <ArrivesEditor
              scope={scope}
              room={room}
              arrives={binding?.arrives}
              onCommit={(next) =>
                onOrdersChange(setMonsterArrives(binding, next))
              }
            />
          </>
        ) : (
          <p className="wb-help" data-testid="creature-interaction-readonly">
            Checks, intel and the reserve predicate are authored through the
            creature’s own panel.
          </p>
        )}
      </div>

      <p className="wb-help" data-testid="faction-layer-rule">
        A faction’s `on:` is layered nearest key wins WHOLESALE: a placement
        that writes its own `time` replaces the faction’s `time` entirely — the
        entry lists are never merged.
      </p>
      <p className="wb-help" data-testid="temper-asymmetry">
        A faction’s `temper` is a word or a mix; a placement’s is one word, and
        the placement’s word wins — the mix is not dealt for it.
      </p>
    </div>
  );
}
