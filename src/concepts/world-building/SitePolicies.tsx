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
  answerTrigger,
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
import type {
  RoomGameplayData,
  RoomMonsterBinding,
  RoomMonsterPlacement,
} from './roomDraft';
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

/** One entry: its weight (an omitted weight IS 1 to the engine), the `say`
 * that goes with it, and the one word it does. */
function entryText(entry: AnswerEntryShape): string {
  const parts = [`weight ${entry.weight ?? 1}`];
  if (entry.when !== undefined) parts.push(`when ${whenText(entry.when)}`);
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
}: {
  trigger: string;
  entry: AnswerEntryShape;
  onCommit: (entry: AnswerEntryShape) => void;
  onRemove: () => void;
}) {
  const words = answerWordsForTrigger(trigger);
  const word = entryWord(entry) ?? words[0]?.key ?? '';
  const spec = answerWord(word);
  const value = (entry as Record<string, unknown>)[word];

  const withWordValue = (next: unknown): AnswerEntryShape => {
    const draft = { ...(entry as Record<string, unknown>) } as AnswerEntryShape;
    (draft as Record<string, unknown>)[word] = next;
    return draft;
  };

  return (
    <li className="wb-policy-entry" data-entry-word={word}>
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
              value={typeof value === 'string' ? value : ANSWER_AT_SELECTOR.key}
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
              {ANSWER_SELECTOR_WORDS.map((selector) => (
                <option key={selector.key} value={selector.key}>
                  {selector.label} ({selector.key})
                </option>
              ))}
              {word === ANSWER_AT_SELECTOR.onlyWord && (
                <option value={ANSWER_AT_SELECTOR.key}>
                  {ANSWER_AT_SELECTOR.label} ({ANSWER_AT_SELECTOR.key})
                </option>
              )}
            </select>
          </label>
          {isMapping(value) && Array.isArray(value.at) && (
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
        predicate all name this id. Renaming writes the declaration; the server
        refuses any reference that no longer resolves.
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
                  event.target.value === '' ? undefined : event.target.value,
              })
            )
          }
        />
      </label>
      <p className="wb-help">
        The faction knows what its mind knows. Whether this names a placement in
        the faction is the server’s to check.
      </p>

      <FactionTemperEditor
        temper={faction.temper}
        onCommit={(temper) =>
          onChange(patchSiteFaction(scope, faction.id, { temper }))
        }
      />

      <FactionTableEditor scope={scope} faction={faction} onChange={onChange} />

      <button
        type="button"
        className="wb-danger"
        aria-label={`Remove faction ${faction.id}`}
        onClick={() => onChange(removeSiteFaction(scope, faction.id))}
      >
        Remove faction
      </button>
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

/** The editable `Policies` body: the site's factions, their temperaments and
 * shared tables, and the dispositions between the sides. */
export function SitePolicies({
  scope,
  room,
  onChange,
  onNotice,
}: SitePoliciesProps) {
  const factions = scope.factions ?? [];
  const dispositions = scope.dispositions ?? [];
  return (
    <div data-testid="site-policies">
      <h4>Factions</h4>
      <div className="wb-actions">
        <button type="button" onClick={() => onChange(addSiteFaction(scope))}>
          Add faction
        </button>
      </div>
      {factions.length === 0 ? (
        <p className="wb-help">
          No factions are authored. Every monster is on the reserved `monsters`
          side.
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
      {factions.length === 0 && dispositions.length === 0 && (
        <p className="wb-help" data-testid="policies-none">
          No factions and no dispositions are authored on this site.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One selected creature (design slice 2, #1157) — still read-only
// ---------------------------------------------------------------------------

export interface CreatureOrdersProps {
  scope: SiteScope;
  monster: RoomMonsterPlacement;
  binding?: RoomMonsterBinding;
  /** When given, the creature's `faction` is editable — the ACTOR carries
   * identity and placement (Decision 4), and the shared table stays the
   * faction's to edit in `Policies`. */
  onFactionChange?: (factionId: string | undefined) => void;
}

/** One selected creature, read as document facts: the faction it belongs to,
 * what that faction SUPPLIES, and what this placement's own orders block
 * OVERRIDES — with the two asymmetries stated where an author reads them.
 *
 * A `faction` key that is ABSENT is the kind's default (rpg-project#477
 * Decision 4), and is deliberately never rendered as a faction named
 * `monsters`: membership in the default side is spelled by absence, and
 * pinning a name on it would have the author believe they declared one. */
export function CreatureOrders({
  scope,
  monster,
  binding,
  onFactionChange,
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
        {binding === undefined ? (
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
          </>
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
