/**
 * SitePolicies — the site's `factions` and `dispositions` as READ-ONLY
 * document facts, plus the inherited-vs-overridden split for one selected
 * creature (rpg-dnd5e-web#1157, design slice 2).
 *
 * WHY READ-ONLY FIRST. The design orders legibility before editing for one
 * reason: "inheritance is what will confuse authors, so making it legible
 * precedes making it editable" (`ideas/site-authoring/design.md` §UI
 * surfaces). Nothing here edits, defaults, reorders or interprets. It renders
 * what the toolkit already accepts — the reference is the engine's own pinned
 * example, `fixtures/worldBuilderV4Site.yaml` — and it never decides which
 * entry fires, never sums a weight, and never reads a `when`.
 *
 * EVERY WORD COMES FROM THE DOCUMENT OR THE ONE VOCABULARY. The entry words
 * are found by ASKING `answerVocabulary.ts` (so a word the engine adds shows
 * up with no change here), and a predicate is named by
 * `factionVocabulary.ts`'s `predicateForm`. Nothing restates the grammar, and
 * absence is rendered as the authored state it is — never as an error.
 */
import { ANSWER_WORDS, answerWord } from '@/author/answerVocabulary';
import { predicateForm, type PredicateDoc } from '@/author/factionVocabulary';
import { paletteNameForRef } from '@/author/paletteData';
import type {
  AnswerEntryShape,
  AnswerTableShape,
  AnswerWhenShape,
} from './answerTableShape';
import type { RoomMonsterBinding, RoomMonsterPlacement } from './roomDraft';
import type {
  SiteDisposition,
  SiteFaction,
  SiteScope,
  SiteTemper,
} from './siteScope';

/** A faction's `temper:` as written — one sealed word, or the word→share mix
 * it deals one from per member. Both shapes are legal on a faction and only
 * on a faction, so both are rendered. */
function factionTemperText(temper: SiteTemper): string {
  if (typeof temper === 'string') return temper;
  return Object.entries(temper)
    .map(([word, share]) => `${word} ×${share}`)
    .join(' · ');
}

/** The one word an entry carries, by ASKING the vocabulary rather than by
 * listing keys here. `ANSWER_ENTRY_RULES.maximumWords` guarantees at most
 * one, so the first match is the entry's whole outcome word. */
function entryWord(entry: AnswerEntryShape): string | undefined {
  return ANSWER_WORDS.map((word) => word.key).find(
    (key) => (entry as Record<string, unknown>)[key] !== undefined
  );
}

/** What the entry's word acts on, by the SHAPE the declaration gives the
 * word — `string` carries an opaque id, `selector` a sealed word or an
 * authored `at:` cell, and `none` carries nothing so it renders bare. The
 * shape dimension is read from `answerVocabulary.ts`, not restated here. */
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

/** One `on:` table — a shared table a faction's members inherit, or a
 * placement's own override. Trigger key to the entries on it. */
function AnswerTable({ table }: { table: AnswerTableShape }) {
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

function FactionFacts({ faction }: { faction: SiteFaction }) {
  return (
    <li data-faction-id={faction.id}>
      <p className="wb-policy-name">{faction.id}</p>
      <dl className="wb-document-facts">
        {faction.mind !== undefined && (
          <div>
            <dt>Mind</dt>
            <dd>{faction.mind}</dd>
          </div>
        )}
        {faction.temper !== undefined && (
          <div>
            <dt>Temper</dt>
            <dd>{factionTemperText(faction.temper)}</dd>
          </div>
        )}
      </dl>
      {faction.on === undefined ? (
        <p className="wb-help">No shared table is authored for its members.</p>
      ) : (
        <>
          <p className="wb-help">Shared table its members inherit</p>
          <AnswerTable table={faction.on} />
        </>
      )}
    </li>
  );
}

function DispositionFacts({ disposition }: { disposition: SiteDisposition }) {
  return (
    <li data-disposition={disposition.between.join('|')}>
      <p className="wb-policy-name">
        {disposition.between[0]} ↔ {disposition.between[1]}
      </p>
      <dl className="wb-document-facts">
        <div>
          <dt>Stance</dt>
          <dd>{disposition.stance}</dd>
        </div>
        {disposition.until !== undefined && (
          <div>
            <dt>Until</dt>
            <dd>{predicateText(disposition.until)}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

/** The read-only `Policies` body: the site's factions, their shared tables
 * and temperaments, and the dispositions between them. */
export function SitePolicies({ scope }: { scope: SiteScope }) {
  const factions = scope.factions ?? [];
  const dispositions = scope.dispositions ?? [];
  if (factions.length === 0 && dispositions.length === 0) {
    return (
      <p className="wb-help" data-testid="policies-none">
        No factions and no dispositions are authored on this site.
      </p>
    );
  }
  return (
    <div data-testid="site-policies">
      <h4>Factions</h4>
      {factions.length === 0 ? (
        <p className="wb-help">No factions are authored.</p>
      ) : (
        <ul className="wb-policy-list">
          {factions.map((faction) => (
            <FactionFacts key={faction.id} faction={faction} />
          ))}
        </ul>
      )}
      <h4>Dispositions</h4>
      {dispositions.length === 0 ? (
        <p className="wb-help">No dispositions are authored.</p>
      ) : (
        <ul className="wb-policy-list">
          {dispositions.map((disposition) => (
            <DispositionFacts
              key={`${disposition.between[0]}:${disposition.between[1]}`}
              disposition={disposition}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export interface CreatureOrdersProps {
  scope: SiteScope;
  monster: RoomMonsterPlacement;
  binding?: RoomMonsterBinding;
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
            {monster.faction ??
              'None — this creature keeps its kind’s default.'}
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
              <AnswerTable table={faction.on} />
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
            {binding.on !== undefined && <AnswerTable table={binding.on} />}
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
