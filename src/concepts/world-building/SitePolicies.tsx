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
  ANSWER_SEARCH,
  ANSWER_SELECTOR_WORDS,
  ANSWER_SOUND_KINDS,
  ANSWER_TEMPER,
  ANSWER_TRIGGERS,
  ANSWER_WHEN,
  answerTrigger,
  answerWhenLegalOn,
  answerWord,
  answerWordsForTrigger,
  GROUP_SENTENCES,
  HEARING_SENTENCES,
  isSearchHeading,
  patternOf,
  selectorWordLegalOn,
} from '@/author/answerVocabulary';
import {
  PREDICATE_FORMS,
  STANCES,
  type PredicateDoc,
  type Stance,
} from '@/author/factionVocabulary';
import { paletteNameForRef } from '@/author/paletteData';
import {
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ActionRefList } from '../encounter-studio/ActionRefList';
import { CopyId } from '../encounter-studio/CopyId';
import { AboutPanel, FieldHelp } from '../encounter-studio/FieldHelp';
import { StudioSection } from '../encounter-studio/StudioSection';
import { setMonsterActionAugment } from './actionAugments';
import {
  isNotCondition,
  isUseEntry,
  OPTION_VERDICTS,
  paramRefOf,
  selectorRouteParam,
  whenConditions,
  whenFromConditions,
  whenListensShape,
  whenNamesDeedShape,
  type AnswerEntryShape,
  type AnswerSelectorShape,
  type AnswerTableShape,
  type AnswerWaypointShape,
  type AnswerWhenCondition,
  type AnswerWhenShape,
  type OptionShape,
  type OptionVerdict,
} from './answerTableShape';
import {
  conditionShorthand,
  deedLabel,
  enemyBandPhrase,
  factLabel,
  heardLabel,
  threatLabel,
  whenShorthand,
} from './answerVocabulary';
import { heardPatternMatches, paramText, resolveUse } from './bundles';
import { BundleParamsContext, SiteBundlesContext } from './bundlesContext';
import { CheckApproachRows } from './CheckApproachRows';
import { turnsTo } from './engineLaws';
import { entryText } from './entryText';
import { factionNameOptions } from './factionNameOptions';
import { factionLayers } from './layeredOrders';
import {
  addMonsterAction,
  addMonsterHold,
  addMonsterOption,
  moveMonsterAction,
  removeMonsterAction,
  removeMonsterHold,
  removeMonsterOption,
  setMonsterArrives,
  setMonsterOption,
  setMonsterTable,
  setMonsterTemper,
} from './monsterOrderEdits';
import {
  addOptionApproach,
  addOptionRow,
  holdablePropIds,
  patchOption,
  patchOptionApproach,
  patchOptionRow,
  removeOptionApproach,
  removeOptionRow,
} from './optionEdits';
import { ParamChip, ParamSlot } from './ParamSlot';
import { PlacedMonstersContext } from './placedMonstersContext';
import { placementDisplayNames } from './placementNames';
import { FactionNameSelect, PredicateEditor } from './PredicateEditor';
import {
  REQUIRES_CHOICES,
  requiresChoice,
  requiresGate,
  requiresId,
  requiresOf,
  type RequiresChoice,
} from './predicateNot';
import {
  dispositionLine,
  pairMindNameIn,
  predicateSentence,
} from './predicateSentence';
import type {
  RoomDraftDocument,
  RoomGameplayData,
  RoomMonsterBinding,
  RoomMonsterPlacement,
} from './roomDraft';
import { WEAPON_REF_RE } from './roomDraft';
import { RouteEditor, WaypointChips } from './RouteEditor';
import { isRouteValue, waypointOf } from './routeEdits';
import { RowRefusalLines } from './RowRefusalLines';
import { rowPathLabel, useRowRefusalsAt } from './rowRefusals';
import { SelectorTarget } from './SelectorTarget';
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
import { useRowKeys } from './useRowKeys';

/** A faction's `temper:` as written — one sealed word, or the word→share mix
 * it deals one from per member. */
/** Placement id to the words it is shown by. The studio passes the names it
 * reads from the document (map names, cast names); without them a placement
 * reads as its kind (rpg-project#579). */
type PlacementNames = ReadonlyMap<string, string>;
function namesFor(
  room: RoomGameplayData,
  given: PlacementNames | undefined
): PlacementNames {
  return (
    given ??
    placementDisplayNames({
      declarations: room.monsterDeclarations,
      castName: paletteNameForRef,
    })
  );
}

function factionTemperText(temper: SiteTemper): string {
  if (typeof temper === 'string') return temper;
  return Object.entries(temper)
    .map(([word, share]) => `${word} ×${share}`)
    .join(' · ');
}

/** The read-only `on:` table a creature INHERITS or OVERRIDES — the slice-2
 * facts view, which stays a readout: the faction owns the table, so it is
 * edited in the `Policies` node and never from inside a creature's panel.
 *
 * EXPORTED (rpg-dnd5e-web#1201) so a creature's panel can show the ROOT TABLE
 * it names without a second readout: the whole point of a named table is that
 * the author can SEE it whole from where it is referenced, which is the hazard
 * it removes. */
export function AnswerTableReadout({ table }: { table: AnswerTableShape }) {
  return (
    <ul className="wb-policy-table">
      {Object.entries(table).map(([trigger, entries]) => (
        <li key={trigger}>
          <span className="wb-policy-trigger">{trigger}</span>
          <ul>
            {entries.map((entry, index) => (
              <li key={index}>{entryText(entry, trigger)}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a faction hands its members, trigger by trigger, as the compiler
 * layers it (`inheritedOrders`): its own rows over the table it names, the
 * nearer winning each trigger wholesale (rpg-project#576, B11).
 *
 * THE HAZARD IT REMOVES is reading one layer as the answer: a readout of the
 * faction's own rows alone reported "no shared table" for a faction that
 * names one. `ownRows` is false where the own rows are the editor right
 * above, so they are not listed twice.
 */
export function FactionInherits({
  scope,
  faction,
  ownRows,
}: {
  scope: SiteScope;
  faction: SiteFaction;
  ownRows: boolean;
}) {
  const declared =
    faction.table !== undefined && scope.tables?.[faction.table] !== undefined;
  const layers = factionLayers(scope, faction);
  const triggers = ANSWER_TRIGGERS.map((t) => t.key).filter(
    (key) => layers[key] !== undefined
  );
  return (
    <div
      className="wb-policy-inherits"
      data-testid={`faction-inherits-${faction.id}`}
    >
      {faction.table !== undefined &&
        (declared ? (
          <p className="wb-help">Inherits {faction.table}</p>
        ) : (
          <p className="wb-help" data-testid="faction-table-dangling">
            This faction names the table “{faction.table}”, and this site
            declares no table with that id. The server refuses it by name.
          </p>
        ))}
      {triggers.length === 0 && faction.table === undefined && (
        <p className="wb-help">No shared table is authored.</p>
      )}
      {triggers.map((trigger) => {
        const layer = layers[trigger]!;
        const fromTable = layer.source.kind === 'faction-table';
        if (!fromTable && !ownRows && layer.overridden === undefined)
          return null;
        return (
          <div key={trigger} className="wb-policy-trigger-block">
            <p className="wb-policy-trigger" data-layer={layer.source.kind}>
              <code>{trigger}</code>{' '}
              {fromTable
                ? `from ${faction.table}`
                : layer.overridden !== undefined
                  ? `from ${faction.id}’s own rows, which override ${faction.table}’s ${trigger} rows`
                  : `from ${faction.id}’s own rows`}
            </p>
            {(fromTable || ownRows) && (
              <ul className="wb-policy-entries">
                {layer.rows.map((entry, index) => (
                  <li key={index}>{entryText(entry, trigger)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ---------------------------------------------------------------------------
// The entry's `when:` — the conditions that put a row ON the table at all
// (rpg-dnd5e-web#1192, rpg-project#465 §2, rpg-toolkit#1871; the list form,
// `not`, `heard` and `fact` are rpg-project#569 R6/R8)
// ---------------------------------------------------------------------------

/** One condition's BASE as a form value — what it reads, before any `not`.
 * The four are EXCLUSIVE within a condition (the engine refuses a `when`
 * entry naming two), so this is one picker rather than checkboxes that could
 * express an illegal state. Two conditions are two entries of the list. */
type WhenBaseForm =
  | { kind: 'enemy'; band: string }
  /** `threat: none | walk | dash` (rpg-project#671 R18). */
  | { kind: 'threat'; word: string }
  | {
      kind: 'deed';
      deed: string;
      within: number;
      /** WHOSE deed — the scope's key and value, or undefined for the creature
       * itself. Absent is the third answer and has no spelling (see
       * `AnswerWhenShape`). */
      scope?: { key: string; value: string };
      /** `fell`'s `who`: the monster placement whose fall the row waits on
       * (rpg-project#716), or undefined for any fall. */
      who?: string;
    }
  | { kind: 'heard'; sound: string; within: number }
  | { kind: 'fact'; fact: string }
  /** A `not` inside a `not`: legal to the engine, carried intact, and not
   * something the one-level toggle can say — shown, never rewritten. */
  | { kind: 'nested'; condition: AnswerWhenCondition };

/** One condition as the form shows it: its base, and whether a `not` wraps
 * it. */
interface WhenConditionForm {
  negated: boolean;
  base: WhenBaseForm;
}

function baseFormOf(condition: AnswerWhenCondition): WhenBaseForm {
  if ('enemy' in condition) return { kind: 'enemy', band: condition.enemy };
  if ('threat' in condition) return { kind: 'threat', word: condition.threat };
  if ('heard' in condition)
    return {
      kind: 'heard',
      sound: condition.heard.kind,
      within: condition.heard.within,
    };
  if ('fact' in condition) return { kind: 'fact', fact: condition.fact };
  if ('not' in condition) return { kind: 'nested', condition };
  const [deed, span] = Object.entries(condition)[0] as [
    string,
    { within: number; on?: 'ally'; as?: 'actor'; who?: string },
  ];
  // THE SCOPE IS READ OFF THE BODY, not guessed: whichever of the two keys the
  // document carries is the one the form shows, and neither means the creature
  // itself.
  const scope =
    span.on !== undefined
      ? { key: 'on', value: span.on }
      : span.as !== undefined
        ? { key: 'as', value: span.as }
        : undefined;
  return { kind: 'deed', deed, within: span.within, scope, who: span.who };
}

function conditionFormOf(condition: AnswerWhenCondition): WhenConditionForm {
  if (isNotCondition(condition))
    return { negated: true, base: baseFormOf(condition.not) };
  return { negated: false, base: baseFormOf(condition) };
}

/** Write a deed body back: the span, plus the scope ONLY when one was chosen.
 * An omitted scope is "the creature itself", so the form must be able to say
 * that by writing no key at all rather than by writing a third word. */
function deedBody(
  within: number,
  scope: { key: string; value: string } | undefined,
  who?: string
): { within: number; on?: 'ally'; as?: 'actor'; who?: string } {
  // `who` FIRST when there is one: the castle's own spelling, `{ who: king,
  // within: 3, on: ally }`.
  const named = who !== undefined ? { who } : {};
  if (scope === undefined) return { ...named, within };
  return scope.key === 'on'
    ? { ...named, within, on: scope.value as 'ally' }
    : { ...named, within, as: scope.value as 'actor' };
}

function conditionOfBase(base: WhenBaseForm): AnswerWhenCondition {
  switch (base.kind) {
    case 'enemy':
      return { enemy: base.band };
    case 'threat':
      return { threat: base.word };
    case 'heard':
      return { heard: { kind: base.sound, within: base.within } };
    case 'fact':
      return { fact: base.fact };
    case 'nested':
      return base.condition;
    case 'deed':
      return {
        [base.deed]: deedBody(
          base.within,
          base.scope,
          ANSWER_WHEN.whoDeeds.includes(base.deed) ? base.who : undefined
        ),
      } as AnswerWhenCondition;
  }
}

function conditionOf(form: WhenConditionForm): AnswerWhenCondition {
  const base = conditionOfBase(form.base);
  return form.negated ? { not: base } : base;
}

/** Whether a written `when` names a DEED positively — the condition under
 * which the `actor` selector is legal ("`actor` names the actor of a deed and
 * this entry names none", `answer.go`). Used to keep the selector list honest
 * when a condition is cleared. */
function whenNamesDeed(when: AnswerWhenShape | undefined): boolean {
  return whenNamesDeedShape(when);
}

/** The `when` picker's value for the reading with NO scope word: "the creature
 * itself", which a document writes by omitting the key. A sentinel rather than
 * a real scope, because writing a word for it would invent a spelling the
 * engine does not read. */
const SELF_SCOPE = '__self__';

/** What the base picker shows for one condition: `any` (row one, and only
 * when the list is empty), `enemy:<band>`, `deed:<word>`, `heard`, `fact`. */
function pickerValue(base: WhenBaseForm | undefined): string {
  if (base === undefined) return 'any';
  if (base.kind === 'enemy') return `enemy:${base.band}`;
  if (base.kind === 'threat') return `threat:${base.word}`;
  if (base.kind === 'deed') return `deed:${base.deed}`;
  return base.kind;
}

/** A NEW base for a picker value, keeping what the author already typed where
 * the two share it: a span carries between a deed and a sound (both are
 * counted from 1), a scope carries between deeds. */
function baseForPicker(
  next: string,
  previous: WhenBaseForm | undefined
): WhenBaseForm {
  const span =
    previous?.kind === 'deed' || previous?.kind === 'heard'
      ? previous.within
      : ANSWER_WHEN.minimumWithin;
  if (next.startsWith('enemy:'))
    return { kind: 'enemy', band: next.slice('enemy:'.length) };
  if (next.startsWith('threat:'))
    return { kind: 'threat', word: next.slice('threat:'.length) };
  if (next === 'heard')
    return {
      kind: 'heard',
      sound:
        previous?.kind === 'heard'
          ? previous.sound
          : (ANSWER_SOUND_KINDS[0] ?? 'clang'),
      within: span,
    };
  if (next === 'fact')
    return {
      kind: 'fact',
      fact: previous?.kind === 'fact' ? previous.fact : '',
    };
  return {
    kind: 'deed',
    deed: next.slice('deed:'.length),
    within: span,
    scope: previous?.kind === 'deed' ? previous.scope : undefined,
    // `who` is a fall's alone: kept between falls, never carried to another
    // deed, which the engine would refuse.
    who: previous?.kind === 'deed' ? previous.who : undefined,
  };
}

/** One condition of the list. Row one's controls keep the names a single
 * `when` always had (`When for time entry`, `Within for time entry`), so a
 * table with one condition reads exactly as it did; later rows are numbered. */
function WhenConditionRow({
  trigger,
  index,
  form,
  offerAny,
  canRemove,
  onCommit,
  onRemove,
}: {
  trigger: string;
  index: number;
  /** Undefined on the empty list's one row: "(any time)". */
  form: WhenConditionForm | undefined;
  /** Offer "(any time)" in the picker — on the ONLY row, where choosing it
   * clears the condition exactly as the single picker always did. */
  offerAny: boolean;
  canRemove: boolean;
  onCommit: (form: WhenConditionForm | undefined) => void;
  onRemove: () => void;
}) {
  const n = index === 0 ? '' : ` ${index + 1}`;
  const base = form?.base;
  const picker = pickerValue(base);
  const negated = form?.negated ?? false;
  const commitBase = (next: WhenBaseForm) => onCommit({ negated, base: next });
  return (
    <li className="wb-policy-when-condition" data-condition-index={index}>
      {/* THE NEGATIVE IS A TOGGLE ON ONE CONDITION (R8): `not: { … }` wraps
          exactly one, never the list. Offered once a condition exists. */}
      {form !== undefined && form.base.kind !== 'nested' && (
        <label className="wb-policy-when-not">
          <input
            type="checkbox"
            aria-label={`Not${n} for ${trigger} entry`}
            checked={negated}
            onChange={(event) =>
              onCommit({ negated: event.target.checked, base: form.base })
            }
          />
          <span>not</span>
        </label>
      )}
      {base?.kind === 'nested' ? (
        <span className="wb-help" data-testid="when-nested-not">
          {conditionShorthand(base.condition)} — a `not` inside a `not`, kept as
          written
        </span>
      ) : (
        <select
          aria-label={`When${n} for ${trigger} entry`}
          value={picker}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'any') onCommit(undefined);
            else commitBase(baseForPicker(next, base));
          }}
        >
          {offerAny && (
            <option value="any">(any time) — always eligible</option>
          )}
          {ANSWER_WHEN.enemyBands.map((band) => (
            <option key={`enemy:${band}`} value={`enemy:${band}`}>
              {enemyBandPhrase(band)}
            </option>
          ))}
          {ANSWER_WHEN.deeds.map((deed) => (
            <option key={`deed:${deed}`} value={`deed:${deed}`}>
              {deedLabel(
                deed,
                base?.kind === 'deed' && base.scope !== undefined
                  ? ({ [base.scope.key]: base.scope.value } as {
                      on?: 'ally';
                      as?: 'actor';
                    })
                  : {}
              )}
            </option>
          ))}
          <option value="heard">{heardLabel()}</option>
          <option value="fact">{factLabel()}</option>
          {ANSWER_WHEN.threatWords.map((word) => (
            <option key={`threat:${word}`} value={`threat:${word}`}>
              {threatLabel(word)}
            </option>
          ))}
        </select>
      )}
      {base?.kind === 'deed' && (
        <>
          <span>within</span>
          <input
            type="number"
            step={1}
            min={ANSWER_WHEN.minimumWithin}
            aria-label={`Within${n} for ${trigger} entry`}
            value={String(base.within)}
            onChange={(event) => {
              // AN EMPTY FIELD COMMITS NOTHING. `Number('')` is 0 — a number
              // the author never typed — and a span has no legal absence
              // (`within: 0` is refused by name), so committing a fabricated
              // 0 would be the form inventing a number.
              if (event.target.value === '') return;
              commitBase({ ...base, within: Number(event.target.value) });
            }}
          />
          <span>rounds</span>
          <span className="wb-entry-perspective-label">Whose deed</span>
          {/*
            WHOSE DEED THIS IS (rpg-dnd5e-web#1199). A scope REFINES the deed
            rather than adding a second condition, so it sits with the span it
            belongs to and is offered on a DEED alone. "(the creature itself)"
            is the default and is what omitting the key means; selecting it
            DELETES the key, which is the only way to write that reading.
          */}
          <select
            aria-label={`Whose deed${n} for ${trigger} entry`}
            value={base.scope?.value ?? SELF_SCOPE}
            onChange={(event) => {
              const next = event.target.value;
              const scope =
                next === SELF_SCOPE
                  ? undefined
                  : {
                      key: ANSWER_WHEN.scopes.find((s) => s.value === next)
                        ?.key as string,
                      value: next,
                    };
              commitBase({ ...base, scope });
            }}
          >
            <option value={SELF_SCOPE}>(the creature itself)</option>
            {ANSWER_WHEN.scopes.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </select>
          {ANSWER_WHEN.whoDeeds.includes(base.deed) && (
            <WhoFellSelect
              label={`Who fell${n} for ${trigger} entry`}
              value={base.who}
              onChange={(who) => commitBase({ ...base, who })}
            />
          )}
        </>
      )}
      {base?.kind === 'heard' && (
        <>
          {/* THE FOUR KINDS ARE THE RULEBOOK'S SEALED VOCABULARY (R4): a
              kind and a span, never a maker — a sound names nobody. They are
              OFFERED, and the field also takes a pattern over them typed as
              `/clang|bell/` (rpg-project#670 R16), in the same place. */}
          <ParamSlot
            value={base.sound}
            label={`Sound${n} for ${trigger} entry`}
            onPick={(ref) => commitBase({ ...base, sound: ref })}
            onClear={() =>
              commitBase({ ...base, sound: ANSWER_SOUND_KINDS[0] ?? 'clang' })
            }
          >
            <input
              list={`sound-kinds${n}-${trigger}`}
              aria-label={`Sound${n} for ${trigger} entry`}
              placeholder="clang, or /clang|bell/"
              value={base.sound}
              onChange={(event) =>
                commitBase({ ...base, sound: event.target.value })
              }
            />
            <datalist
              id={`sound-kinds${n}-${trigger}`}
              data-testid={`Sound kinds${n} for ${trigger} entry`}
            >
              {ANSWER_SOUND_KINDS.map((kind) => (
                <option key={kind} value={kind} />
              ))}
            </datalist>
            {!heardPatternMatches(base.sound) && base.sound !== '' && (
              <span className="wb-entry-refusal" role="alert">
                {patternOf(base.sound) !== undefined
                  ? GROUP_SENTENCES.heardPatternNoSound(base.sound)
                  : HEARING_SENTENCES.unknownSoundKind(base.sound)}
              </span>
            )}
          </ParamSlot>
          <span>within</span>
          <ParamSlot
            value={base.within}
            label={`Heard within${n} for ${trigger} entry`}
            onPick={(ref) =>
              commitBase({ ...base, within: ref as unknown as number })
            }
            onClear={() =>
              commitBase({ ...base, within: ANSWER_WHEN.minimumWithin })
            }
          >
            <input
              type="number"
              step={1}
              min={ANSWER_WHEN.minimumWithin}
              aria-label={`Heard within${n} for ${trigger} entry`}
              value={String(base.within)}
              onChange={(event) => {
                if (event.target.value === '') return;
                commitBase({ ...base, within: Number(event.target.value) });
              }}
            />
          </ParamSlot>
          <span>rounds</span>
        </>
      )}
      {base?.kind === 'fact' && (
        <input
          aria-label={`Fact${n} for ${trigger} entry`}
          placeholder="fact id, e.g. alarm-raised, or /alarm-.*/"
          value={base.fact}
          onChange={(event) =>
            commitBase({ ...base, fact: event.target.value })
          }
        />
      )}
      {canRemove && (
        <button
          type="button"
          className="wb-danger"
          aria-label={`Remove condition${n} for ${trigger} entry`}
          onClick={onRemove}
        >
          Remove condition
        </button>
      )}
    </li>
  );
}

/** `fell`'s `who` (rpg-project#716): one of the monsters placed in the
 * document, or anyone. A hand-written id the document does not place is kept
 * as its own choice, so selecting is never a way to lose it; the engine
 * refuses it by name at Save & Play (`grammar.whenWho`). */
function WhoFellSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (who: string | undefined) => void;
}) {
  const monsters = useContext(PlacedMonstersContext);
  const dangling = value !== undefined && !monsters.has(value);
  return (
    <>
      <span className="wb-entry-perspective-label">Who</span>
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        <option value="">(anyone)</option>
        {[...monsters].map(([id, name]) => (
          <option key={id} value={id} title={id}>
            {name}
          </option>
        ))}
        {dangling && <option value={value}>{value} (not placed here)</option>}
      </select>
    </>
  );
}

/** The `when:` control — a LIST of conditions, every one of which must hold
 * (rpg-project#569 R8). LEGAL ON `time` ALONE — a social key IS already the
 * condition, so the caller does not render this at all on a verdict.
 *
 * THE FIRST CONTROL IN THE ROW, because it gates whether the row can fire
 * before it says what the row does. An empty list shows one row reading
 * `(any time)` — the honest empty state; picking a condition there starts the
 * list, and "Add condition" grows it.
 *
 * THE SPELLING IS `whenFromConditions`'s: one plain condition is written as
 * the single mapping every older file used, anything else as a list. */
function AnswerWhenEditor({
  trigger,
  when,
  onCommit,
}: {
  trigger: string;
  when: AnswerWhenShape | undefined;
  onCommit: (when: AnswerWhenShape | undefined) => void;
}) {
  const conditions = whenConditions(when);
  const forms = conditions.map(conditionFormOf);
  const commitForms = (next: WhenConditionForm[]) =>
    onCommit(whenFromConditions(next.map(conditionOf)));

  return (
    <div
      className="wb-policy-when"
      role="group"
      aria-label={`Condition for ${trigger} entry`}
    >
      <span>When</span>
      <ol className="wb-policy-when-list">
        {forms.length === 0 ? (
          <WhenConditionRow
            trigger={trigger}
            index={0}
            form={undefined}
            offerAny
            canRemove={false}
            onCommit={(form) => commitForms(form ? [form] : [])}
            onRemove={() => commitForms([])}
          />
        ) : (
          forms.map((form, index) => (
            <WhenConditionRow
              key={index}
              trigger={trigger}
              index={index}
              form={form}
              offerAny={forms.length === 1}
              canRemove
              onCommit={(next) =>
                commitForms(
                  next === undefined
                    ? forms.filter((_, i) => i !== index)
                    : forms.map((f, i) => (i === index ? next : f))
                )
              }
              onRemove={() => commitForms(forms.filter((_, i) => i !== index))}
            />
          ))
        )}
      </ol>
      {forms.length > 0 && (
        <button
          type="button"
          aria-label={`Add condition for ${trigger} entry`}
          onClick={() =>
            commitForms([
              ...forms,
              {
                negated: false,
                base: {
                  kind: 'enemy',
                  band: ANSWER_WHEN.enemyBands[0] ?? 'reach',
                },
              },
            ])
          }
        >
          Add condition
        </button>
      )}
      {forms.length > 1 && (
        <span className="wb-help">Every condition must hold.</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shared `on:` table
// ---------------------------------------------------------------------------

/** The entry with its one word taken away — "just say it". */
function withoutWord(entry: AnswerEntryShape): AnswerEntryShape {
  const next = { ...entry } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (answerWord(key)) delete next[key];
  }
  return next as AnswerEntryShape;
}

/** One entry row: its weight, its `say`, and its ONE word. Every control
 * writes what the author set; whether the entry is legal is the server's call,
 * and `when` is carried verbatim because the builder never reads it. */
/** What each search heading means, on the select (rpg-project#679 R10). */
const SEARCH_HEADING_LABELS: Record<
  (typeof ANSWER_SEARCH.headings)[number],
  string
> = {
  went: 'went (the way it was seen going)',
  faced: 'faced (the way it faced)',
  left: 'left (a quarter left of went)',
  right: 'right (a quarter right of went)',
};

/** The props every answer row takes, a word row or a group. */
type AnswerEntryRowProps = Parameters<typeof WordEntryRow>[0];

/**
 * One answer row. A `use:` row (rpg-project#670) is ONE LINE —
 * "pursuer · with distance 8 · ×2 · as toward" — that expands, read-only, to
 * the rows its bundle makes with the parameters filled; the bundle itself is
 * edited in the Bundles list. Every other row is today's editor.
 */
export function AnswerEntryRow(props: AnswerEntryRowProps) {
  if (isUseEntry(props.entry))
    return (
      <UseEntryRow
        trigger={props.trigger}
        entry={props.entry}
        onCommit={props.onCommit}
        onRemove={props.onRemove}
        label={props.label ?? props.trigger}
        controls={props.controls}
        at={props.at}
      />
    );
  return <WordEntryRow {...props} />;
}

/** A `use:` row: its line, the engine's refusal when its bundle cannot be
 * resolved, and its bundle's rows behind "Show rows". */
function UseEntryRow({
  trigger,
  entry,
  onCommit,
  onRemove,
  label,
  controls,
  at,
}: {
  trigger: string;
  entry: AnswerEntryShape & { use: string };
  onCommit?: (entry: AnswerEntryShape) => void;
  onRemove: () => void;
  label: string;
  controls?: ReactNode;
  at?: readonly string[];
}) {
  const bundles = useContext(SiteBundlesContext);
  const inBundle = useContext(BundleParamsContext);
  const [open, setOpen] = useState(false);
  const { refusals, focused, rowRef } = useRowRefusalsAt(at);
  // A ROUTE GIVEN TO A BUNDLE (rpg-project#720): `with: { path: [...] }` is
  // edited here the way a row's own route is, its waypoints as chips.
  const routes = Object.entries(entry.with ?? {}).filter(([, v]) =>
    isRouteValue(v)
  ) as [string, AnswerWaypointShape[]][];
  const [editingRoute, setEditingRoute] = useState(false);
  useEffect(() => {
    if (focused && routes.length > 0) setEditingRoute(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  // INSIDE A BUNDLE a `with` value may itself be a parameter, `$path`, which
  // is only a route once the outer bundle is used; the line shows it as a
  // chip, and the rows it makes are shown where the outer bundle is used.
  const deferred =
    inBundle !== undefined &&
    Object.values(entry.with ?? {}).some((v) => paramRefOf(v) !== undefined);
  const resolved = deferred
    ? { rows: [], refusal: undefined }
    : resolveUse(bundles, entry, trigger);
  return (
    <li
      ref={rowRef}
      className="wb-policy-entry wb-entry-collapsed wb-entry-use"
      data-entry-word="use"
    >
      <UseLine entry={entry} />
      {controls}
      {routes.length > 0 && onCommit && (
        <button
          type="button"
          aria-label={`Edit the route of ${label} entry ${entry.use}`}
          aria-expanded={editingRoute}
          onClick={() => setEditingRoute((was) => !was)}
        >
          {editingRoute ? 'Done with route' : 'Edit route'}
        </button>
      )}
      <button
        type="button"
        aria-label={`Show the rows of ${label} entry ${entry.use}`}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Hide rows' : 'Show rows'}
      </button>
      <button
        type="button"
        className="wb-danger"
        aria-label={`Remove ${label} entry`}
        onClick={onRemove}
      >
        Remove
      </button>
      {resolved.refusal && (
        <p className="wb-entry-refusal" role="alert">
          {resolved.refusal.message}
        </p>
      )}
      <RowRefusalLines refusals={refusals} />
      {editingRoute &&
        onCommit &&
        routes.map(([param, route]) => (
          <div key={param} className="wb-use-route">
            <span>
              with <code>{param}</code>
            </span>
            <RouteEditor
              mode="route"
              route={route}
              label={`${label} entry ${entry.use} ${param}`}
              pickLabel={`${rowPathLabel(at) ?? `${label} entry`} (${entry.use} ${param})`}
              onChange={(next) => {
                if (next.length === 0) return;
                onCommit({
                  ...entry,
                  with: {
                    ...entry.with,
                    [param]: next.map((w) => waypointOf(w, w)),
                  },
                });
              }}
            />
          </div>
        ))}
      {open && (
        <ul className="wb-use-rows" aria-label={`${entry.use} rows`}>
          {deferred ? (
            <li>filled in where this bundle is used</li>
          ) : (
            resolved.rows.map((row, index) => (
              <li key={index}>{entryText(row, trigger)}</li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/** A `use:` row as ONE line, its `with:` values as chips: "pursuer · with
 * [distance 8] · ×2 · as toward". A value that is itself a parameter, inside
 * a bundle, is a `$name` chip. Its text is [groupLineText]'s exactly. */
function UseLine({ entry }: { entry: AnswerEntryShape & { use: string } }) {
  const given = Object.entries(entry.with ?? {});
  return (
    <span className="wb-entry-summary">
      {entry.use}
      {given.length > 0 && (
        <>
          {' · with '}
          {given.map(([name, value], index) => (
            <Fragment key={name}>
              {index > 0 && ', '}
              <span className="wb-with-chip" data-param={name}>
                {name}{' '}
                {paramRefOf(value) !== undefined ? (
                  <ParamChip name={paramRefOf(value)!} />
                ) : isRouteValue(value) ? (
                  <WaypointChips route={value} label={`${entry.use} ${name}`} />
                ) : (
                  paramText(value)
                )}
              </span>
            </Fragment>
          ))}
        </>
      )}
      {entry.weight !== undefined && ` · ×${entry.weight}`}
      {entry.as !== undefined && ` · as ${entry.as}`}
      {entry.when !== undefined && ` · when ${whenShorthand(entry.when)}`}
    </span>
  );
}

function WordEntryRow({
  trigger,
  entry,
  onCommit,
  onRemove,
  label = trigger,
  excludeWords = [],
  allowNoWord = false,
  collapsed = false,
  controls,
  at,
}: {
  /** The row's engine paths (`tables.<id>.on.time[3]`): the validate-only
   * refusals under them are said at the row, and a jump to one opens it
   * (rpg-project#720, R17). */
  at?: readonly string[];
  /** Extra controls drawn on the row beside Edit and Remove — a bundle's
   * rows pass Move up / Move down (rpg-project#670). */
  controls?: ReactNode;
  /** Start as one summary line with Edit and Remove; Edit opens today's
   * controls (rpg-project#579). Opening one row closes none of the others. */
  collapsed?: boolean;
  trigger: string;
  entry: AnswerEntryShape;
  onCommit: (entry: AnswerEntryShape) => void;
  onRemove: () => void;
  /** What this row's controls are NAMED for — the trigger by default. An
   * option's verdict rows pass `<option id> <verdict>` so two options' rows
   * are two sets of controls (rpg-project#569). */
  label?: string;
  /** Words this row may not offer although the trigger takes them: a prop's
   * verdict rows exclude `flee` ("a prop cannot run"). */
  excludeWords?: readonly string[];
  /** Offer "just say it" — a row with a line and no word, which the engine
   * accepts on any key (`wordRequiredUnlessSaid`). An option's verdict rows
   * are mostly this: what the creature SAYS back. */
  allowNoWord?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const { refusals, focused, rowRef } = useRowRefusalsAt(at);
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);
  const words = answerWordsForTrigger(trigger).filter(
    (candidate) => !excludeWords.includes(candidate.key)
  );
  const word = entryWord(entry) ?? (allowNoWord ? '' : (words[0]?.key ?? ''));
  const spec = answerWord(word);
  const value = (entry as Record<string, unknown>)[word];
  /** `when` is legal on `time` alone; a social key IS the condition. */
  const whenLegal = answerWhenLegalOn(trigger);
  /** `actor` needs a deed to have been the actor of. Offered only when this
   * entry's `when` names one, so the list never offers an illegal choice —
   * and the engine's own sentence stays the backstop for a hand-written file. */
  const actorLegal = whenNamesDeed(entry.when);
  /** `sound` needs a row that LISTENS — a top-level `heard` (R10; a `heard`
   * inside a `not` is not listening) — so it is offered only then, exactly as
   * `actor` waits for a deed. Never on `attack` (a sound cannot be struck),
   * read from the declaration's own `refusedOn`. */
  const soundLegal = whenListensShape(entry.when);
  const selectorWords = ANSWER_SELECTOR_WORDS.filter(
    (selector) =>
      (selector.key !== 'actor' || actorLegal) &&
      (selector.key !== 'sound' || soundLegal) &&
      selectorWordLegalOn(selector.key, word)
  );

  const withWordValue = (next: unknown): AnswerEntryShape => {
    const draft = { ...(entry as Record<string, unknown>) } as AnswerEntryShape;
    (draft as Record<string, unknown>)[word] = next;
    return draft;
  };

  /** Set or clear the condition. CLEARING IT ALSO CLEARS AN `actor` SELECTOR
   * — and a `sound` one once the row no longer listens — because each is
   * refused by name without its condition and leaving it behind would publish
   * a document the engine rejects. The one place this form edits a second
   * field, and only to avoid writing a known-bad state. Any other selector is
   * left exactly as the author set it. */
  const withWhen = (when: AnswerWhenShape | undefined): void => {
    const next: AnswerEntryShape = { ...entry };
    if (when === undefined) delete next.when;
    else next.when = when;
    // AND `sound` WITHOUT A LISTENING ROW, for the same reason: the engine
    // refuses it by name, so removing or negating the row's `heard` must not
    // leave it behind.
    if (
      spec?.value === 'selector' &&
      ((value === 'actor' && !whenNamesDeed(when)) ||
        (value === 'sound' && !whenListensShape(when)))
    ) {
      (next as Record<string, unknown>)[word] =
        ANSWER_SELECTOR_WORDS[0]?.key ?? 'enemy';
    }
    onCommit(next);
  };

  if (!open)
    return (
      <li
        ref={rowRef}
        className="wb-policy-entry wb-entry-collapsed"
        data-entry-word={word}
      >
        <span className="wb-entry-summary">{entryText(entry, trigger)}</span>
        {controls}
        <button
          type="button"
          aria-label={`Edit ${label} entry`}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="wb-danger"
          aria-label={`Remove ${label} entry`}
          onClick={onRemove}
        >
          Remove
        </button>
        <RowRefusalLines refusals={refusals} />
      </li>
    );
  return (
    <li
      ref={rowRef}
      className="wb-policy-entry wb-entry-sentence-card"
      data-entry-word={word}
    >
      <div className="wb-entry-sentence">
        {whenLegal && (
          <AnswerWhenEditor
            trigger={trigger}
            when={entry.when}
            onCommit={withWhen}
          />
        )}
        <span className="wb-entry-arrow" aria-hidden="true">
          →
        </span>
        <label className="wb-entry-action">
          <span>Do</span>
          <select
            aria-label={`Do for ${label} entry`}
            value={word}
            onChange={(event) =>
              onCommit(
                event.target.value === ''
                  ? withoutWord(entry)
                  : setAnswerEntryWord(entry, event.target.value)
              )
            }
          >
            {allowNoWord && <option value="">Just say it</option>}
            {words.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.commandLabel}
              </option>
            ))}
          </select>
        </label>
        {spec?.value === 'string' && (
          <label>
            <span>{word}</span>
            <ParamSlot
              value={value}
              label={`${word} for ${label} entry`}
              onPick={(ref) => onCommit(withWordValue(ref))}
              onClear={() => onCommit(withWordValue(''))}
            >
              <input
                aria-label={`${word} for ${label} entry`}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) =>
                  onCommit(withWordValue(event.target.value))
                }
              />
            </ParamSlot>
          </label>
        )}
        {spec?.value === 'search' && (
          // `search: { distance, heading }` (rpg-project#668 R4,
          // rpg-project#679 R10): cells on from the lost cell, and which way.
          // The engine's six and `went` show when the file names none; an
          // entry that is not a whole number of at least one is not written.
          // Each control keeps the other key as written, so editing one never
          // drops the other.
          <>
            <label className="wb-entry-target">
              <span>Cells</span>
              <ParamSlot
                value={isMapping(value) ? value.distance : undefined}
                label={`Cells for ${label} entry`}
                onPick={(ref) =>
                  onCommit(
                    withWordValue({
                      ...(isMapping(value) ? value : {}),
                      distance: ref,
                    })
                  )
                }
                onClear={() => {
                  const body = { ...(isMapping(value) ? value : {}) };
                  delete body.distance;
                  onCommit(withWordValue(body));
                }}
              >
                <input
                  type="number"
                  min={ANSWER_SEARCH.minimumDistance}
                  aria-label={`Cells for ${label} entry`}
                  value={
                    isMapping(value) && typeof value.distance === 'number'
                      ? value.distance
                      : ANSWER_SEARCH.defaultDistance
                  }
                  onChange={(event) => {
                    const distance = Number(event.target.value);
                    if (
                      Number.isInteger(distance) &&
                      distance >= ANSWER_SEARCH.minimumDistance
                    )
                      onCommit(
                        withWordValue({
                          ...(isMapping(value) ? value : {}),
                          distance,
                        })
                      );
                  }}
                />
              </ParamSlot>
            </label>
            <label className="wb-entry-target">
              <span>Heading</span>
              <ParamSlot
                value={isMapping(value) ? value.heading : undefined}
                label={`Heading for ${label} entry`}
                onPick={(ref) =>
                  onCommit(
                    withWordValue({
                      ...(isMapping(value) ? value : {}),
                      heading: ref,
                    })
                  )
                }
                onClear={() => {
                  const body = { ...(isMapping(value) ? value : {}) };
                  delete body.heading;
                  onCommit(withWordValue(body));
                }}
              >
                <select
                  aria-label={`Heading for ${label} entry`}
                  value={
                    isMapping(value) && isSearchHeading(value.heading)
                      ? value.heading
                      : ANSWER_SEARCH.defaultHeading
                  }
                  onChange={(event) => {
                    if (isSearchHeading(event.target.value))
                      onCommit(
                        withWordValue({
                          ...(isMapping(value) ? value : {}),
                          heading: event.target.value,
                        })
                      );
                  }}
                >
                  {ANSWER_SEARCH.headings.map((heading) => (
                    <option key={heading} value={heading}>
                      {SEARCH_HEADING_LABELS[heading]}
                    </option>
                  ))}
                </select>
              </ParamSlot>
            </label>
          </>
        )}
        {spec?.value === 'selector' &&
          selectorRouteParam(value as AnswerSelectorShape) !== undefined && (
            // A ROUTE PARAMETER, `path: $path` inside a bundle
            // (rpg-project#670): the route is given where the bundle is used.
            <span className="wb-entry-target" data-testid="entry-place">
              <span>To</span> the route{' '}
              <ParamChip
                name={selectorRouteParam(value as AnswerSelectorShape)!}
                clearLabel={`Clear the route parameter from ${label} entry`}
                onClear={() =>
                  onCommit(
                    withWordValue(ANSWER_SELECTOR_WORDS[0]?.key ?? 'enemy')
                  )
                }
              />
            </span>
          )}
        {spec?.value === 'selector' &&
          selectorRouteParam(value as AnswerSelectorShape) === undefined && (
            // A FIGURE, A CELL OR A ROUTE (rpg-project#720): the sealed words,
            // and on `toward` an authored cell or route picked on the Layout,
            // shown as chips with each waypoint's wait and facing.
            <SelectorTarget
              word={word}
              label={`${label} entry`}
              pickLabel={rowPathLabel(at) ?? `${label} entry`}
              value={value}
              selectorWords={selectorWords}
              onCommit={(next) => onCommit(withWordValue(next))}
              wrap={(select) => (
                <ParamSlot
                  value={undefined}
                  label={`Route for ${label} entry`}
                  onPick={(ref) => onCommit(withWordValue({ path: ref }))}
                  onClear={() => undefined}
                >
                  {select}
                </ParamSlot>
              )}
            />
          )}
      </div>
      <div className="wb-entry-secondary">
        <label className="wb-entry-dialogue">
          <span>
            Say <span className="wb-help">(optional)</span>
          </span>
          <input
            aria-label={`Say (optional) for ${label} entry`}
            placeholder="Optional dialogue"
            value={entry.say ?? ''}
            onChange={(event) => {
              const next: AnswerEntryShape = { ...entry };
              if (event.target.value === '') delete next.say;
              else next.say = event.target.value;
              onCommit(next);
            }}
          />
        </label>
        <label
          className="wb-entry-weight"
          title="Relative chance among eligible entries, not execution order."
        >
          <span>Weight</span>
          <ParamSlot
            value={entry.weight}
            label={`Weight for ${label} entry`}
            onPick={(ref) =>
              onCommit({ ...entry, weight: ref as unknown as number })
            }
            onClear={() => {
              const next: AnswerEntryShape = { ...entry };
              delete next.weight;
              onCommit(next);
            }}
          >
            <input
              type="number"
              step={1}
              aria-label={`Weight for ${label} entry`}
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
          </ParamSlot>
        </label>
        {controls}
        <button
          type="button"
          className="wb-danger wb-entry-remove"
          aria-label={`Remove ${label} entry`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <p className="wb-help wb-entry-weight-help">
        Weight changes relative chance among eligible entries, not execution
        order.
      </p>
      <p className="wb-help">{entryText(entry, trigger)}</p>
      <RowRefusalLines refusals={refusals} />
      {collapsed && (
        <button
          type="button"
          aria-label={`Done editing ${label} entry`}
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      )}
    </li>
  );
}

/** A list of entry rows keyed so each row's editor follows it when a weight
 * edit re-sorts the list (R12). */
export function EntryList<T extends object>({
  rows,
  children,
}: {
  rows: readonly T[];
  children: (row: T, index: number, key: string) => ReactNode;
}) {
  const keys = useRowKeys(rows);
  return (
    <ul className="wb-policy-entries">
      {rows.map((row, index) => children(row, index, keys[index]!))}
    </ul>
  );
}

/** A NAMED ROOT TABLE, CHOSEN FROM WHAT THE SITE DECLARES (rpg-toolkit#1897,
 * rpg-dnd5e-web#1201).
 *
 * A CLOSED LIST IS RIGHT HERE, and it is the opposite of `CreatureWeaponEditor`
 * — which refuses to offer a vocabulary because the engine carries weapon refs
 * and NEVER interprets them. A table name is different in kind: the engine
 * RESOLVES it, and refuses by name an id the document does not declare
 * (`bindingTable`/`factionTable`). So the universe is exactly the root's
 * `tables:` keys, which this panel can see, and offering anything else would be
 * offering a document the server rejects.
 *
 * A NAME THAT RESOLVES TO NOTHING IS STILL SHOWN. A hand-written file may name
 * a table this site does not declare — `IntelPanel`'s treatment of a `holds`
 * that outlived its record, for the same reason: the builder must not silently
 * rewrite the author's bytes, and the engine's refusal is the sentence worth
 * surfacing. It appears as its own option so selecting it is not a way to lose
 * it. */
export function TableNameSelect({
  scope,
  value,
  label,
  placeholder,
  onChange,
}: {
  scope: SiteScope;
  value: string | undefined;
  label: string;
  placeholder: string;
  onChange: (next: string | undefined) => void;
}) {
  const declared = Object.keys(scope.tables ?? {});
  const dangling = value !== undefined && !declared.includes(value);
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) =>
        onChange(event.target.value === '' ? undefined : event.target.value)
      }
    >
      <option value="">{placeholder}</option>
      {declared.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
      {dangling && <option value={value}>{value} (not declared here)</option>}
    </select>
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
  /** `time` FIRST, for the reason `TablesPanel`'s picker states: it is the
   * trigger a behavior table is mostly about, and the only one the `when`
   * editor is legal on. (The social keys that once came first retired to
   * options, rpg-project#569, so `time` is now the only key; the default
   * stays for the next trigger the engine adds.)
   * FOUND IN REVIEW (independent-gate): the creature's picker was fixed and
   * the faction's was not. */
  const [newTrigger, setNewTrigger] = useState(
    available.includes('time') ? 'time' : (available[0] ?? '')
  );
  return (
    <div className="wb-policy-table-editor">
      <p className="wb-help">Shared table its members inherit.</p>
      {authored.map((trigger) => (
        <div key={trigger} className="wb-policy-trigger-block">
          <p className="wb-policy-trigger">
            <code>{trigger}</code>{' '}
            {answerTrigger(trigger)?.label ?? 'Unknown trigger'}
          </p>
          <EntryList rows={table[trigger] ?? []}>
            {(entry, index, key) => (
              <AnswerEntryRow
                key={key}
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
            )}
          </EntryList>
        </div>
      ))}
      <FactionInherits scope={scope} faction={faction} ownRows={false} />
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
  room,
  faction,
  onChange,
  onNotice,
  placementNames,
}: {
  scope: SiteScope;
  room?: RoomGameplayData;
  placementNames?: PlacementNames;
  faction: SiteFaction;
  onChange: (nextScope: SiteScope) => void;
  onNotice?: (message: string) => void;
}) {
  const [typedId, setTypedId] = useState(faction.id);
  useEffect(() => setTypedId(faction.id), [faction.id, scope]);
  const commitId = () => {
    if (typedId === faction.id) return;
    if (typedId.trim() === '') {
      setTypedId(faction.id);
      onNotice?.('Faction id cannot be empty; the declaration was kept.');
      return;
    }
    if (scope.factions?.some((entry) => entry.id === typedId)) {
      setTypedId(faction.id);
      onNotice?.(
        'That faction id already exists; both declarations were kept.'
      );
      return;
    }
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
              list={room ? `faction-mind-${faction.id}` : undefined}
              value={faction.mind ?? ''}
              placeholder="Choose a placed creature or enter its id"
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
          {room && (
            <datalist id={`faction-mind-${faction.id}`}>
              {room.monsterDeclarations.map((monster) => (
                <option
                  key={monster.id}
                  value={monster.id}
                  label={namesFor(room, placementNames).get(monster.id)}
                  title={monster.id}
                >
                  {namesFor(room, placementNames).get(monster.id)}
                </option>
              ))}
            </datalist>
          )}
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

          {/* A FACTION NAMES A ROOT TABLE (rpg-project#501 §6.2, "i think we
              add table to faction"), and it may ALSO write its own `on:` — the
              engine layers the named table UNDER the inline one, key by key,
              through the same `encounter.Layer` every other layer uses. The
              builder carries both rather than deciding a layering rule it does
              not own. */}
          <label>
            <span>Shared table</span>
            <TableNameSelect
              scope={scope}
              value={faction.table}
              label={`Table for ${faction.id}`}
              placeholder="none — write its own below"
              onChange={(table) =>
                onChange(patchSiteFaction(scope, faction.id, { table }))
              }
            />
          </label>
          <p className="wb-help">
            A table declared at the site root, written once and named here. The
            server refuses a name this site does not declare.
          </p>

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

/** The `until:` predicate editor. Four forms, exactly one key; the value is
 * written as typed and the server judges whether the pair may carry it. */
function UntilEditor({
  scope,
  room,
  disposition,
  onCommit,
  placementNames,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  placementNames?: PlacementNames;
  disposition: SiteDisposition;
  onCommit: (until: PredicateDoc | undefined) => void;
}) {
  const until = disposition.until;
  return (
    <div className="wb-policy-until">
      <PredicateEditor
        value={until}
        onChange={onCommit}
        forms={PREDICATE_FORMS}
        name="Until"
        label="Until"
        none="No authored condition"
        scope={scope}
        room={room}
        names={namesFor(room, placementNames)}
      />
      <p className="wb-help">
        {until === undefined
          ? 'The hostility never ends.'
          : `Until ${predicateSentence(until, {
              names: namesFor(room, placementNames),
              mindName:
                'fact' in until
                  ? pairMindNameIn(
                      scope,
                      room,
                      namesFor(room, placementNames),
                      disposition.between
                    )
                  : undefined,
            })}; then ${turnsTo(disposition.stance)}.`}
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
  placementNames,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  placementNames?: PlacementNames;
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
            placementNames={placementNames}
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

/** The dispositions that name one creature's faction, each as a sentence —
 * the creature view's read-only list. No predicate is shown as JSON
 * (rpg-project#576, B12). */
export function AuthoredDispositions({
  document,
  faction,
}: {
  document: Readonly<RoomDraftDocument>;
  faction: string | undefined;
}) {
  const named = (document.scope.dispositions ?? []).filter(
    (entry) => faction !== undefined && entry.between.includes(faction)
  );
  if (named.length === 0)
    return <p className="wb-help">No disposition names its faction.</p>;
  return (
    <ul data-testid="authored-dispositions">
      {named.map((entry, index) => (
        <li key={index}>{dispositionLine(entry, document)}</li>
      ))}
    </ul>
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
  /** Placement id to its shown name; the kind's name when absent. */
  placementNames?: PlacementNames;
}

/** The site's FACTIONS: who fights as one side, each with its temperament
 * and its shared answer table. Its own top-level node — a faction is a
 * thing, and "Policies" was a wrapper that named nothing the rows did not
 * already name (rpg-dnd5e-web#1178 follow-up). */
export function FactionsPanel({
  scope,
  room,
  onChange,
  onNotice,
  placementNames,
}: Omit<SitePoliciesProps, 'room'> & { room?: RoomGameplayData }) {
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
          No factions are authored on this site. Unassigned creatures keep their
          kind’s default. Dispositions can still name the reserved sides.
        </p>
      ) : (
        <ul className="wb-policy-list">
          {factions.map((faction) => (
            <FactionRow
              key={faction.id}
              scope={scope}
              room={room}
              placementNames={placementNames}
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
 * condition that changes their relationship. Its own top-level node, beside
 * Factions — the pair a disposition is *about* is what it reads, and it is
 * a different noun from a faction. */
export function DispositionsPanel({
  scope,
  room,
  onChange,
  placementNames,
}: Omit<SitePoliciesProps, 'onNotice'>) {
  const dispositions = scope.dispositions ?? [];
  return (
    <div data-testid="site-dispositions">
      <h4>Dispositions</h4>
      <div className="wb-actions">
        <button
          type="button"
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
              key={index}
              scope={scope}
              room={room}
              placementNames={placementNames}
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
      <p className="wb-help">
        Weapons{' '}
        <FieldHelp field="Weapons">What it fights with, in order.</FieldHelp>
      </p>
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
  /** Placement id to its shown name; the kind's name when absent. */
  placementNames?: PlacementNames;
  /** The "Selected creature" heading and name line. The studio's inspector
   * already names the selection, so it leaves them out. */
  titled?: boolean;
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
  placementNames,
}: {
  scope: SiteScope;
  room: RoomGameplayData;
  placementNames?: PlacementNames;
  arrives: PredicateDoc | undefined;
  onCommit: (next: PredicateDoc | undefined) => void;
}) {
  return (
    <div className="wb-creature-arrives" data-testid="creature-arrives">
      <PredicateEditor
        value={arrives}
        onChange={onCommit}
        forms={PREDICATE_FORMS}
        name="Arrives"
        label="In reserve until"
        none="Standing here from the first frame"
        scope={scope}
        room={room}
        names={namesFor(room, placementNames)}
      />
      <p className="wb-help" data-testid="creature-arrives-note">
        {arrives === undefined
          ? 'This creature is in the run from the first frame.'
          : `Held in reserve until ${predicateSentence(arrives, {
              names: namesFor(room, placementNames),
            })}.`}
      </p>
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
  placementNames,
  titled = true,
}: CreatureOrdersProps) {
  const faction = binding?.faction
    ? (scope.factions ?? []).find((entry) => entry.id === binding.faction)
    : undefined;
  /** The root table this creature NAMES, resolved against what the site
   * declares. `undefined` covers both "names nothing" and "names something this
   * site does not declare" — the second is reported where the control is, the
   * same distinction `IntelPanel` draws for a `holds` that outlived its
   * record. RESOLVING IT IS NOT DECIDING IT: the engine owns whether the name
   * is acceptable, and this only decides what to SHOW. */
  const namedTable =
    binding?.table !== undefined ? scope.tables?.[binding.table] : undefined;
  return (
    <div className="wb-creature-orders" aria-label="Selected creature">
      <AboutPanel>
        <p data-testid="faction-layer-rule">
          A faction’s `on:` is layered nearest key wins WHOLESALE: a placement
          that writes its own `time` replaces the faction’s `time` entirely —
          the entry lists are never merged.
        </p>
        <p data-testid="temper-asymmetry">
          A faction’s `temper` is a word or a mix; a placement’s is one word,
          and the placement’s word wins — the mix is not dealt for it.
        </p>
      </AboutPanel>
      {titled && (
        <>
          <h4>Selected creature</h4>
          <p className="wb-help">
            {namesFor(room, placementNames).get(monster.id) ??
              paletteNameForRef(monster.ref)}{' '}
            <CopyId id={monster.id} label="placement" />
          </p>
        </>
      )}
      <dl className="wb-creature-orders-grid">
        <div>
          <dt>Faction</dt>
          <dd>
            {onFactionChange ? (
              <select
                aria-label="Creature faction"
                value={binding?.faction ?? ''}
                onChange={(event) =>
                  onFactionChange(
                    event.target.value === '' ? undefined : event.target.value
                  )
                }
              >
                <option value="">Kind’s default</option>
                {binding?.faction && !faction && (
                  <option value={binding.faction}>
                    {binding.faction} (not declared)
                  </option>
                )}
                {(scope.factions ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id}
                  </option>
                ))}
              </select>
            ) : (
              (binding?.faction ??
              'None — this creature keeps its kind’s default.')
            )}
          </dd>
        </div>
      </dl>

      <StudioSection
        title="Inherits"
        level="subsection"
        className="wb-policy-block"
      >
        {binding?.faction === undefined ? (
          <p className="wb-help" data-testid="creature-inherits-none">
            Nothing authored here — its kind’s default supplies the table.
          </p>
        ) : faction === undefined ? (
          <p className="wb-help" data-testid="creature-inherits-unknown">
            This site declares no faction with the id “{binding?.faction}”.
          </p>
        ) : (
          <>
            {faction.temper !== undefined && (
              <p className="wb-help">
                temper {factionTemperText(faction.temper)}
              </p>
            )}
            <FactionInherits scope={scope} faction={faction} ownRows />
          </>
        )}
      </StudioSection>

      <StudioSection
        title="Overrides"
        level="subsection"
        className="wb-policy-block"
      >
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
            {/* ADD AND DROP, THIS PLACEMENT ONLY (rpg-project#721): applied by
                the session after its kind's stat block and its own weapons. */}
            {(['addActions', 'dropActions'] as const).map((key) => (
              <ActionRefList
                key={key}
                kind={key}
                refs={binding?.[key] ?? []}
                onChange={(next) =>
                  onOrdersChange(setMonsterActionAugment(binding, key, next))
                }
              />
            ))}
            <CreatureTemperEditor
              temper={binding?.temper}
              onCommit={(temper) =>
                onOrdersChange(setMonsterTemper(binding, temper))
              }
            />
            {/* WHAT IT ANSWERS WITH, BY NAME (rpg-toolkit#1897, web#1201).
                THE INLINE TABLE EDITOR IS GONE from this panel, because a
                creature's orders are DECLARED ONCE AND NAMED — that is the
                whole reason tables moved to the root, and leaving a second
                place to paste them re-opens the hazard the move removes:
                `time:` replaces the kind's whole default table, so an inline
                entry silently discards what the kind carried. Kirk's ruling
                (rpg-project#501 §6.6, web#1201): "there should be no inline
                table defined on a monster anymore."

                `on:` IS STILL READ AND STILL ROUND-TRIPS. A hand-written file
                with one opens, and the engine still reads it — it is a legal
                BASE for `table` to lay over. Refusing it here would make an
                editable file unopenable while the server accepts it, which is
                `holds`' and `arrives'` law (web#1176): CARRIED, NOT OFFERED.
                If one is present the author sees it read-only below. */}
            {binding?.on !== undefined && (
              <div data-testid="creature-inline-table-readonly">
                <p className="wb-help">
                  This creature also carries an inline table, which this build
                  no longer authors. The server reads it: it is layered over
                  anything it names.
                </p>
                <AnswerTableReadout table={binding.on} />
              </div>
            )}
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
            {binding.addActions !== undefined && (
              <p className="wb-help">
                addActions {binding.addActions.join(', ')}
              </p>
            )}
            {binding.dropActions !== undefined && (
              <p className="wb-help">
                dropActions {binding.dropActions.join(', ')}
              </p>
            )}
            {binding.holds !== undefined && (
              <p className="wb-help">holds {binding.holds.join(', ')}</p>
            )}
            {binding.arrives !== undefined && (
              <p className="wb-help">
                held in reserve until{' '}
                {predicateSentence(binding.arrives, {
                  names: namesFor(room, placementNames),
                })}
              </p>
            )}
          </>
        )}
      </StudioSection>

      {/* WHAT A CHARACTER CAN SAY TO IT (rpg-project#569). The priced checks
          that were here (and left in rpg-dnd5e-web#1201) came back where they
          belong: on the LINE that rolls them, with what the creature answers
          on either verdict. Neither inherited nor overridden — a faction never
          supplies a line — so this is its own block. */}
      <StudioSection
        title="Options"
        level="subsection"
        className="wb-policy-block"
        about={<p>The lines a character can say to this creature.</p>}
      >
        {onOrdersChange !== undefined ? (
          <OptionsEditor
            titled={false}
            owner={monster.id}
            options={binding?.options ?? []}
            room={room}
            isProp={false}
            onAdd={() => onOrdersChange(addMonsterOption(binding))}
            onChange={(index, option) =>
              onOrdersChange(setMonsterOption(binding, index, option))
            }
            onRemove={(index) =>
              onOrdersChange(removeMonsterOption(binding, index))
            }
          />
        ) : (binding?.options ?? []).length === 0 ? (
          <p className="wb-help" data-testid="creature-options-none">
            Nobody can speak to this creature.
          </p>
        ) : (
          <ul className="wb-policy-table">
            {(binding?.options ?? []).map((option) => (
              <li key={option.id} className="wb-help">
                {optionText(option)}
              </li>
            ))}
          </ul>
        )}
      </StudioSection>

      {/* The creature's reserve and holdings facts (web#1176). They are
          neither inherited nor overridden — a faction never supplies them — so
          they are their own block rather than a row in Overrides. */}
      <StudioSection
        title="Reserve and holdings"
        level="subsection"
        className="wb-policy-block"
      >
        {onOrdersChange !== undefined ? (
          <>
            <CreatureHoldsEditor
              scope={scope}
              holds={binding?.holds ?? []}
              onAdd={(id) => onOrdersChange(addMonsterHold(binding, id))}
              onRemove={(id) => onOrdersChange(removeMonsterHold(binding, id))}
            />
            <ArrivesEditor
              scope={scope}
              room={room}
              placementNames={placementNames}
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
      </StudioSection>

      <StudioSection
        title="Answers with"
        level="subsection"
        className="wb-policy-block"
      >
        {onOrdersChange !== undefined ? (
          <>
            <label>
              <span>Table</span>
              <TableNameSelect
                scope={scope}
                value={binding?.table}
                label={`Table for ${monster.id}`}
                placeholder="none — what its kind or faction supplies stands"
                onChange={(table) =>
                  onOrdersChange(setMonsterTable(binding, table))
                }
              />
            </label>
            {/* A REFERENCE IS SHOWN WHOLE, and that is the hazard it removes:
                `time:` replaces the kind's entire default table, so an author
                who cannot see the table cannot tell what they are replacing. */}
            {namedTable !== undefined && (
              <div data-testid="creature-named-table">
                <AnswerTableReadout table={namedTable} />
              </div>
            )}
            {binding?.table !== undefined && namedTable === undefined && (
              <p className="wb-help" data-testid="creature-table-dangling">
                This creature names the table “{binding.table}”, and this site
                declares no table with that id. The server refuses it by name;
                it is kept here rather than silently rewritten.
              </p>
            )}
            {/* THE EMPTY STATE IS STATED, like every other section's: a
                creature naming no table is not an error and not a gap — what
                its kind and faction supply stands, which is the state most
                creatures are in. */}
            {binding?.table === undefined && (
              <p className="wb-help" data-testid="creature-table-none">
                No named table — this creature answers from what its kind and
                faction supply.
              </p>
            )}
          </>
        ) : binding?.table !== undefined ? (
          <p className="wb-help">Answers with the table “{binding.table}”.</p>
        ) : (
          <p className="wb-help" data-testid="creature-table-none">
            No named table — this creature answers from what its kind and
            faction supply.
          </p>
        )}
      </StudioSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPTIONS — the lines a character can say (rpg-project#569)
// ---------------------------------------------------------------------------

/** What gates a line, as the picker names it. */
const REQUIRES_FORMS = REQUIRES_CHOICES;

const VERDICT_HEADINGS: Record<OptionVerdict, string> = {
  success: 'When the check is beaten',
  failure: 'When the check is missed',
};

/**
 * A binding's OPTIONS editor — a creature's or a prop's (rpg-project#569).
 *
 * Each line is an id, the words the character says, the approaches through
 * its check (the lock's own rows, `CheckApproachRows`), what gates it, and the
 * rows answered on each verdict — the SAME entry editor a table uses
 * (`AnswerEntryRow`), under the verdict's key, so a verdict row offers what
 * the engine takes there: a line, `fact`, and `flee` (a creature's only).
 *
 * IT DECIDES NOTHING. Whether a check can be beaten, whether a fact will ever
 * be known, and which row fires are the engine's; this writes the document.
 */
export function OptionsEditor({
  owner,
  titled = true,
  options,
  room,
  isProp,
  onAdd,
  onChange,
  onRemove,
}: {
  /** The binding's id — what every control here is named for. */
  owner: string;
  /** The "Options" heading; CreatureOrders titles its own sub-section. */
  titled?: boolean;
  options: readonly OptionShape[];
  room: RoomGameplayData;
  /** A prop's lines: its rows may not `flee`. */
  isProp: boolean;
  onAdd: () => void;
  onChange: (index: number, option: OptionShape) => void;
  onRemove: (index: number) => void;
}) {
  const holdable = holdablePropIds(room);
  return (
    <div className="wb-options" data-testid={`options-${owner}`}>
      {titled && <h6>Options — what a character can say</h6>}
      {options.length === 0 && (
        <p className="wb-help" data-testid={`options-none-${owner}`}>
          {isProp
            ? 'Nobody can speak to this prop yet.'
            : 'Nobody can speak to this creature yet — a creature with no lines cannot be talked to.'}
        </p>
      )}
      {options.map((option, index) => {
        const n = index + 1;
        const of = `line ${n} of ${owner}`;
        // `not:` around either read (rpg-project#719): the choice carries
        // whether it is negated, and the fact or prop controls read through.
        const requiresChoiceNow = requiresChoice(option.requires);
        const negated = requiresChoiceNow.startsWith('not-');
        const requiresForm = requiresChoiceNow.replace('not-', '') as
          | ''
          | 'fact'
          | 'holds';
        const heldId =
          requiresForm === 'holds' ? requiresId(option.requires) : undefined;
        const commit = (next: OptionShape) => onChange(index, next);
        return (
          <div
            key={index}
            className="wb-option wb-policy-block"
            data-testid={`option-${owner}-${index}`}
          >
            <label>
              <span>Id</span>
              <input
                aria-label={`Line ${n} id for ${owner}`}
                value={option.id}
                onChange={(event) =>
                  commit(patchOption(option, { id: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Says</span>
              <textarea
                aria-label={`Line ${n} for ${owner}`}
                placeholder="What the character says"
                rows={Math.max(2, Math.ceil(option.say.length / 36))}
                value={option.say}
                onChange={(event) =>
                  commit(patchOption(option, { say: event.target.value }))
                }
              />
            </label>
            <div className="wb-option-check">
              <span>Check — any one of these</span>
              <CheckApproachRows
                id={of}
                rows={option.check}
                onPatch={(approach, patch) =>
                  commit(patchOptionApproach(option, approach, patch))
                }
                onRemove={(approach) =>
                  commit(removeOptionApproach(option, approach))
                }
                onAdd={() => commit(addOptionApproach(option))}
              />
            </div>
            <label>
              <span>Requires</span>
              <select
                aria-label={`Line ${n} requires for ${owner}`}
                value={requiresChoiceNow}
                onChange={(event) => {
                  const choice = event.target.value as RequiresChoice;
                  commit(
                    patchOption(option, {
                      requires: requiresOf(
                        choice,
                        choice.endsWith('holds') ? (holdable[0] ?? '') : ''
                      ),
                    })
                  );
                }}
              >
                {REQUIRES_FORMS.map((form) => (
                  <option
                    key={form.value}
                    value={form.value}
                    disabled={
                      form.value.endsWith('holds') &&
                      holdable.length === 0 &&
                      requiresForm !== 'holds'
                    }
                  >
                    {form.label}
                  </option>
                ))}
              </select>
            </label>
            {requiresForm === 'fact' && (
              <label>
                <span>Fact</span>
                <input
                  aria-label={`Line ${n} requires fact for ${owner}`}
                  value={requiresId(option.requires)}
                  onChange={(event) =>
                    commit(
                      patchOption(option, {
                        requires: requiresOf(
                          negated ? 'not-fact' : 'fact',
                          event.target.value
                        ),
                      })
                    )
                  }
                />
              </label>
            )}
            {requiresForm === 'holds' && (
              <label>
                <span>Prop</span>
                <select
                  aria-label={`Line ${n} requires prop for ${owner}`}
                  value={heldId ?? ''}
                  onChange={(event) =>
                    commit(
                      patchOption(option, {
                        requires: requiresOf(
                          negated ? 'not-holds' : 'holds',
                          event.target.value
                        ),
                      })
                    )
                  }
                >
                  {heldId !== undefined && !holdable.includes(heldId) && (
                    <option value={heldId}>
                      {heldId || '(none)'} — nobody can pick it up
                    </option>
                  )}
                  {holdable.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {holdable.length === 0 && (
              <p className="wb-help" data-testid={`option-no-holdable-${of}`}>
                No placed prop can be picked up, so no line can require carrying
                one — mark a prop holdable in its orders.
              </p>
            )}
            {OPTION_VERDICTS.map((verdict) => (
              <div
                key={verdict}
                className="wb-policy-trigger-block"
                data-testid={`option-${owner}-${index}-${verdict}`}
              >
                <p className="wb-policy-trigger">
                  <code>{verdict}</code> {VERDICT_HEADINGS[verdict]}
                </p>
                <EntryList rows={option[verdict] ?? []}>
                  {(row, rowIndex, key) => (
                    <AnswerEntryRow
                      key={key}
                      trigger={verdict}
                      label={`${of} ${verdict}`}
                      entry={row}
                      allowNoWord
                      excludeWords={isProp ? ['flee'] : []}
                      onCommit={(next) =>
                        commit(patchOptionRow(option, verdict, rowIndex, next))
                      }
                      onRemove={() =>
                        commit(removeOptionRow(option, verdict, rowIndex))
                      }
                    />
                  )}
                </EntryList>
                <button
                  type="button"
                  aria-label={`Add ${verdict} row to ${of}`}
                  onClick={() => commit(addOptionRow(option, verdict))}
                >
                  Add a {verdict} row
                </button>
              </div>
            ))}
            <button
              type="button"
              className="wb-danger"
              aria-label={`Remove line ${n} from ${owner}`}
              onClick={() => onRemove(index)}
            >
              Remove line
            </button>
          </div>
        );
      })}
      <div className="wb-actions">
        <button
          type="button"
          aria-label={`Add a line to ${owner}`}
          onClick={onAdd}
        >
          Add a line
        </button>
      </div>
    </div>
  );
}

/** A line as one sentence, for the read-only readout. */
function optionText(option: OptionShape): string {
  const check = option.check
    .map((approach) => `${approach.ability} dc ${approach.dc}`)
    .join(' or ');
  const gate = requiresGate(option.requires);
  return `${option.id}: “${option.say}” · ${check}${gate}`;
}
