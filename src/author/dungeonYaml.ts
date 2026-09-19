/**
 * dungeonYaml — the builder's in-memory model of a `dungeonspec`
 * version-2 file, its parser and its emitter (rpg-project#256, design §2).
 *
 * The YAML is the artifact; the canvas is a view of it. Everything in the
 * model is AXIAL (`hexOffset.ts`'s `Axial`); the file's `[col,row]` pairs
 * exist only inside `parseDungeon` (in) and `emitDungeon` (out), through
 * `fromOffset` / `toOffset` under the document's own `orientation`.
 *
 * The emitter is deterministic and hand-written rather than a generic
 * YAML dump: cells sorted, one ROW per line (so a repaint diffs as a line
 * change — the convention design §2 names), walls sorted, flow-style
 * placements. `emitDungeon(parseDungeon(emitDungeon(doc)))` is
 * byte-identical to `emitDungeon(doc)` (`dungeonYaml.test.ts`), which is
 * what makes `GetDungeon`'s verbatim bytes and the builder's own output
 * the same text.
 *
 * THE ENGINE'S GRADE IS THE VERDICT (rpg-project#481 R3). Validation is the
 * SERVER's job: `PutDungeon{validate_only}` compiles the bytes and answers
 * with path-addressed `FieldError`s, and those are the sentences the author
 * reads. This module refuses only what it CANNOT DRAW — a version it does
 * not write, a cell that is not two integers, a wall with no line — and
 * CARRIES EVERYTHING ELSE VERBATIM: a key it has never heard of, a trigger,
 * an outcome word, a selector, a temperament, a stance, a predicate form.
 *
 * WHY CARRYING, NOT REFUSING. A closed set transcribed here is a mirror, and
 * a mirror drifts: rpg-dnd5e-web#1119 was the builder refusing the only
 * authored file in the project, and #1145 refused a `temper` the engine
 * takes. Both were the web declining a file the engine plays. A value the
 * codec carries reaches the compiler, and the compiler names it at its own
 * path in its own words — one refusal, from the owner, instead of two.
 *
 * The vocabulary declarations (`answerVocabulary.ts`, `factionVocabulary.ts`)
 * are still read here, but only to recognise the shapes this module models
 * (a selector to convert, a span to hold). They are OFFERS a palette makes,
 * never rules this parser enforces.
 */

import { refSlug } from '@/utils/refs';
import { parse as parseYamlText } from 'yaml';
import {
  ANSWER_WHEN,
  ANSWER_WORD_KEYS,
  answerWord,
  suggestKey,
} from './answerVocabulary';
import {
  MONSTERS,
  PARTY,
  PREDICATE_FORMS,
  type PredicateDoc,
  type Stance,
} from './factionVocabulary';
import {
  isPositionOffset,
  latticeKey,
  latticeOf,
  latticeWalk,
  positionCrossing,
  positionKey,
  positionSpellings,
  sealedBy,
  wallCrossings,
  wallFootprint,
  type Lattice,
  type Offset,
  type PositionRef,
} from './hexGeometry';
import {
  axialKey,
  axialNeighbors,
  compareAxial,
  edgeKey,
  fromOffset,
  toOffset,
  type Axial,
  type Edge,
  type OffsetPair,
  type Orientation,
} from './hexOffset';

export type { PositionRef } from './hexGeometry';

// The faction and disposition vocabulary moved to `factionVocabulary.ts`
// (rpg-dnd5e-web#1136) so the single-room site scope can read the same closed
// sets without importing this version-2 document model. RE-EXPORTED here
// unchanged, so every existing consumer keeps importing it from
// `dungeonYaml` and there is exactly one declaration.
export {
  MONSTERS,
  PARTY,
  PREDICATE_FORMS,
  PREDICATE_SHAPE,
  predicateForm,
  STANCES,
} from './factionVocabulary';
export type { PredicateDoc, PredicateForm, Stance } from './factionVocabulary';

export type VoidKind = 'opaque' | 'transparent';

export interface RegionDoc {
  id: string;
  name: string;
  /** Presentation ref the assets resolve (`crypt`…). Never mechanics. */
  archetype: string;
  lighting: { intensity: number };
  cells: Axial[];
  /** Hidden space — "the room hides with its door" (rpg-project#351).
   * DECLARED HERE, NEVER CASCADED from a concealed door: the room and its
   * door are separate authored facts (dungeonspec.RegionSpec.Concealed).
   * Server-validated coherence (a walk-in room cannot be a secret; a room
   * only reachable through a concealed door must be concealed too) is not
   * repeated client-side — this module only refuses what it cannot
   * represent. Omitted means not concealed; only ever written `true`. */
  concealed?: boolean;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** One authored check's approach: an ability or skill, an optional tool,
 * and the DC that route must beat — mirrors dungeonspec's `ApproachSpec`
 * (rpg-project#350). Every field is opaque; this module never interprets
 * `ability` or `tool`. */
export interface ApproachDoc {
  ability: string;
  tool?: string;
  /** A whole number the row editor can hold. NOT a vocabulary rule: the
   * builder edits a DC with a number input, so a `dc` that is not one is a
   * row it cannot draw, and that refusal stays. */
  dc: number;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** A door's lock or its find check: the accepted approaches through it,
 * success by any listed one, each priced with its own DC. Mirrors
 * dungeonspec's `CheckSpec` — a bare list, not a wrapping object, because
 * the builder authors a check as approach rows and the file reads as the
 * rows it is. */
export type CheckDoc = ApproachDoc[];

export interface DoorDoc {
  id: string;
  /** The position the door stands on — a side midpoint of some wall
   * (design §3.4, F10/F11). The door IS that side's crossing: one door,
   * one crossing, and a wider doorway is two doors. `edges` is retired
   * with the pair form. */
  at: PositionRef;
  /** Omitted = open doorway; `closed` = shut, not locked; `locked` wins. */
  closed?: boolean;
  /** NIL, NOT LEN 0, IS "NOT LOCKED" (dungeonspec.DoorSpec.Locked's law):
   * an authored-but-empty list is a lock with no way through it, refused
   * server-side by name — this module still represents it (round-trips
   * unchanged) rather than silently reading it as open. */
  locked?: CheckDoc;
  /** The find check that hides this door — COMPOSES with plain, closed,
   * or locked underneath; whether a door is shut and whether anyone knows
   * it is there are separate authored facts (rpg-project#350). Same
   * nil-vs-empty law as `locked`. */
  concealed?: CheckDoc;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** A placement's authored offset: `[x, y]` or `[x, y, height]`
 * (rpg-project#272 — the third component raises the prop off the
 * floor). */
export type PlacementOffset = [number, number] | [number, number, number];

/**
 * ONE KEY THIS CODEC DOES NOT MODEL, HELD AS THE AUTHOR WROTE IT.
 *
 * Every block that can carry one keeps a list of these in the author's own
 * order, and the emitter writes them back after the keys it does model. That
 * is the whole mechanism behind "the engine's grade is the verdict": a key
 * the builder has never heard of reaches the compiler in the bytes, and the
 * compiler answers `factions[0].tempre: …` at its own path — where a refusal
 * here would have stopped the file at the door with the builder's guess.
 *
 * It is NOT a place to put keys this module knows: a modelled key that
 * landed here would round-trip but never be editable, so the parser adds an
 * entry only for a key no branch above it claimed.
 */
export interface RawField {
  key: string;
  value: unknown;
}

/** The four predicate forms, or a predicate shape this grammar has not
 * learned — held whole so the compiler can name it. `{ raw }` is what an
 * author gets for two keys in one map, a form this build has no reader for,
 * or a body of the wrong type; the panels show it read-only in the file's
 * own words and offer no editor for it. */
export type PredicateHolder = PredicateDoc | { raw: unknown };

/** Whether a held predicate is one of the four forms the editors can edit. */
export function isPredicateDoc(p: PredicateHolder): p is PredicateDoc {
  return !('raw' in p);
}

/**
 * One entry of an answer table: what the creature does, and what it says,
 * under the condition it is on the table for. `weight` is optional and
 * OMITTED IS 1 — the engine keeps it a pointer upstream precisely so an
 * authored `0` differs from an absent key, so this module must not default
 * it. `word` is at most one word of the sealed vocabulary
 * (`answerVocabulary.ts`); an entry with no word must still carry `say`, or
 * it does nothing at all.
 *
 * `when` IS THE ENTRY'S OWN CONDITION, not a word: a `time` entry whose
 * `when` does not hold is not on the table for that roll — absent rather than
 * weighted zero. See `AnswerWhenDoc`.
 */
export interface AnswerEntryDoc {
  weight?: number;
  say?: string;
  when?: AnswerWhenDoc;
  /** The words this entry carries, in the author's order. The engine's rule
   * is at most one — and an entry that breaks it is the ENGINE's to name, so
   * a file with two is held with both and graded there, not stopped here. */
  words?: AnswerWordDoc[];
  /** Keys no branch above claimed — a word this build has not learned, a
   * misspelling, a field from a newer engine. Carried, so the compiler names
   * them. See [RawField]. */
  extra?: RawField[];
  /** An entry that is not a mapping at all — a bare string, a list. Held
   * whole; the engine reads what the author wrote and says so. */
  raw?: unknown;
}

/**
 * A `when:` — an enemy band, a deed with a span, or a condition this build
 * has no reader for (`answerVocabulary.ts`'s `ANSWER_WHEN`,
 * `dungeonspec.WhenSpec`).
 *
 * The language is the file's own: an enemy band is `{ enemy: reach }`, and a
 * deed is `{ fled: { within: 3 } }` — the deed's own past-tense name, not a
 * generic `deed` key.
 *
 * `{ kind: 'raw' }` IS NOT AN ERROR STATE. Two keys in one map, a deed this
 * build does not hold, a band outside the four: each is a condition the
 * ENGINE reads and grades, so the codec holds the map whole and lets it
 * travel. The two modelled arms exist because the builder edits them, not
 * because the other spellings are illegal here.
 */
export type AnswerWhenDoc =
  | { kind: 'enemy'; band: string }
  | { kind: 'deed'; deed: string; within: number }
  | { kind: 'raw'; raw: unknown };

/** What a selector word or an authored cell names
 * (`answerVocabulary.ts`'s selectors). EXACTLY ONE of the two is set: a word
 * (`enemy`/`attacker`/`actor`) or a cell, and the cell is legal on `toward`
 * alone. */
export interface AnswerSelectorDoc {
  /** The scalar as written — one of the sealed words, or a word this build
   * has not learned. Which it is, is the engine's to say. */
  word?: string;
  /** The authored cell, AXIAL like every other cell in the model — the file's
   * `[col,row]` spelling is `parseDungeon`'s and `emitDungeon`'s business. */
  at?: Axial;
  /** A selector shape the codec does not model — a mapping that is not
   * `{ at: [col,row] }`, or a list. Held whole and graded by the engine. */
  raw?: unknown;
}

/** One word plus what it carries. `fact` carries an opaque id; `flee` and
 * `hold` carry nothing and are written `{}`; `attack`/`toward`/`away` carry a
 * selector. Kept word-agnostic so a word the engine adds arrives through the
 * vocabulary declaration rather than a new field here. */
export interface AnswerWordDoc {
  word: string;
  /** `fact`'s opaque id. */
  value?: string;
  /** The selector on `attack`/`toward`/`away`. */
  selector?: AnswerSelectorDoc;
  /** The body as written, for a word whose value is not the shape the
   * declaration gives it — `fact: [1]`, `flee: 5`. Carried so the engine
   * reports the mismatch at the word's own path. */
  raw?: unknown;
}

/** One share of a faction's `temper:` mix — a word and how much of the die it
 * takes. An array rather than a map so the author's own order survives the
 * round trip, the same law `AnswerTableDoc` keeps for triggers. */
export interface TemperShareDoc {
  word: string;
  share: unknown;
}

/** A `temper:` (`answerVocabulary.ts`'s `ANSWER_TEMPER`, `dungeonspec`
 * `TemperSpec`). A WORD ON A PLACEMENT, A WORD OR A MIX ON A FACTION — a
 * placement names one creature, so there is nobody to deal a spread to. */
export interface TemperDoc {
  /** The single word as written, on either a placement or a faction. Whether
   * it is a temperament this build ships is the engine's answer, not this
   * module's — #1145 was that refusal, here, on a word the engine takes. */
  word?: string;
  /** The mix, in the author's own order. A mix on a PLACEMENT is carried
   * too: "a placement names one creature" is a rule, and rules are graded
   * where they are owned. */
  mix?: TemperShareDoc[];
  /** A temper that is neither a scalar nor a mapping. Held whole. */
  raw?: unknown;
}

/** One trigger and the entries it fires, in the author's own order. The
 * trigger key is whatever the file wrote: a key this build does not roll is
 * carried and named by the compiler, never refused here. */
export interface AnswerTriggerDoc {
  trigger: string;
  entries: AnswerEntryDoc[];
  /** The value under the trigger when it is not a list of entries — held
   * whole, so `intimidated: 5` reaches the engine as written. */
  raw?: unknown;
}

/**
 * A placement's answer table (`on:` in the file) — the surface Kirk named
 * as the point of the feature: *"This is also a place where the dungeon
 * author can put text the goblin would say for each outcome."*
 *
 * A LIST, not a map, because the author's trigger order is part of what
 * they wrote: re-emitting a parsed file must not reshuffle it, and the
 * engine's own `map[string][]AnswerSpec` gives no order to fall back on.
 */
export type AnswerTableDoc = AnswerTriggerDoc[];

export interface PlacementDoc {
  ref: string;
  at: Axial;
  /** REQUIRED on props, REFUSED on monsters (server rule). Written
   * explicitly whenever present — never defaulted. */
  blocksMovement?: boolean;
  blocksLos?: boolean;
  /** Props only, REFUSED on monsters (server rule, rpg-project#261).
   * The authored word verbatim — one of the EIGHT true-compass names,
   * the same eight under both orientations (rpg-project#272;
   * `facingYaw.ts`'s `FACING_NAMES`). Omitted means the asset's own
   * default orientation. This module only checks the SHAPE (a string);
   * whether it's a compass name is the server's call, surfaced as a
   * `place[i].facing` `FieldError` like any other field. */
  facing?: string;
  /** Props only, REFUSED on monsters. A within-cell visual nudge, each
   * component a fraction of the cell size in `[-0.5, 0.5]` — VISUAL
   * ONLY (design's "presentation never decides mechanics" law: the
   * prop still occupies its whole cell for movement and LOS). Omitted
   * means centered; `[0, 0]` means the same thing but stays written if
   * the caller wrote it (no silent collapsing). An OPTIONAL third
   * component is height above the floor in the same cell-size unit,
   * `[0, 3]` — deliberately not bound to the planar clamp
   * (rpg-project#272). Bounds are the server's call, surfaced the same
   * way as `facing`'s.
   */
  offset?: PlacementOffset;
  /** Monsters only; opaque to the builder. */
  targeting?: string;
  boss?: boolean;
  /** THE AUTHOR'S NAME for this placement — the third id the dialect
   * carries, after a region's and a door's (rpg-project#368 P2). Optional
   * and unique within the dungeon; required only by whatever BINDS to it
   * (a scenario binding, and the pick-up verb, which names its target by
   * this id and nothing else). Refused on collision by the server, naming
   * both lines; the builder refuses one inline before it is typed into
   * the file. Omitted means the author named none, which is most props. */
  id?: string;
  /** The INTEL RECORD ids this placement carries from spawn
   * (rpg-project#372 §2). Legal on MONSTERS AND PROPS alike (R6, from
   * Kirk's walk: "tech could get intel by holding something too … not the
   * hardest monster to kill in the game") — a scroll on a table is intel
   * a party can reach without winning a fight first.
   *
   * This replaced `knows`, which named a door directly. Knowledge is
   * spelled ONCE now, as a record — the monster holds the record and the
   * record says what it reveals — so a record that later reveals a region
   * or a treasure's location needs no second spelling here (design R1:
   * "if we don't have a use case for it then it goes"). `knows` is refused
   * by name at parse.
   *
   * Carried verbatim; this module never checks that a listed record
   * exists, and the same record may be held by several monsters (intel
   * COPIES on loot, it does not move). NIL, NOT LEN 0, is "holds
   * nothing": an authored-but-empty list round-trips unchanged rather
   * than being silently read as absent. */
  holds?: string[];
  /** Props only, REFUSED on monsters. Whether a member can pick this prop
   * up off the floor (rpg-project#368 §5). Defaulting to false — a thing
   * nobody declared stays scenery — so it is written ONLY when true, which
   * keeps every dungeon that uses none emitting the bytes it always did.
   *
   * THE WORD IS HOLD, NOT TAKE (design R10): this flag makes a run-scoped
   * `holds:` fact possible, and *take* is reserved for the act that lands
   * a thing in a character's inventory. The file key is `holdable:`, which
   * is what dungeonspec parses. The pinned protos still call the RPC
   * `Take` — that half renames in a wave-0 follow-up and is confined to
   * `useSessionHold.ts` and `holdingBeat.ts` on the game side. */
  holdable?: boolean;
  /** Monsters only, REFUSED on props. The declared faction this monster
   * fights for (rpg-project#375 §2). ABSENT MEANS `monsters` — the reserved
   * side every unauthored monster is on, hostile to the party — so a
   * dungeon that names no faction emits the bytes it always did and plays
   * exactly as it always has (R4). Written only when the author chose one;
   * the panel shows `monsters` for an absent value and writes nothing.
   * Carried verbatim; that the faction is declared is `factionRules.ts`'s
   * inline refusal and the compiler's, not this module's. */
  faction?: string;
  /** Monsters and props. The predicate that brings this placement into the
   * run — until it holds the placement is in reserve: no cell, no turn,
   * absent from every projection (rpg-project#375 §3.7). PARSED AND
   * EMITTED HERE, NOT YET AUTHORED: the editor for it is step B of the
   * hold-out slice (design §10); this module carries the field so a file
   * written with it round-trips rather than being refused by a builder one
   * step behind the compiler. `at` still MUST be floor — it is where the
   * placement lands when the predicate holds. */
  arrives?: PredicateHolder;
  /** Monsters only, REFUSED on props: the authored check that intimidates
   * this creature — the accepted approaches and their DCs, the same shape a
   * door's lock uses (`CheckDoc`). Success by any listed approach. Absent
   * means the verb is not offered against it here. */
  intimidate?: CheckDoc;
  /** Persuade's twin, on the same machine (`front-room-goblin.md`). */
  persuade?: CheckDoc;
  /** Monsters only. The arms the author names for this placement, carried
   * verbatim — `dnd5e:weapons:scimitar` and friends. PARSED AND EMITTED
   * HERE, NOT YET AUTHORED, on `arrives`'s rule: this module carries the
   * field so a file written with it round-trips rather than being refused
   * by a builder one step behind the compiler. The editor for it is
   * rpg-project#448, "an author names what a placed monster can do". */
  actions?: string[];
  /** Monsters only. The answer table: per verb and verdict, the weighted
   * entries the world rolls between. See `AnswerTableDoc` — a list, in the
   * author's order. */
  on?: AnswerTableDoc;
  /** Monsters only, REFUSED on props. This placement's temperament, one of
   * the sealed words (`ANSWER_TEMPER`) — `temper: coward`. A WORD HERE, A MIX
   * ON THE FACTION: a placement names one creature, so dealing a spread for
   * it would be an author rolling for a goblin they have already described.
   * Carried verbatim — including a word this build does not ship and a MIX
   * written where a word belongs: both are the compiler's to grade, and a
   * refusal here is what #1145 was. The panel's select offers the three and
   * shows anything else read-only. */
  temper?: TemperDoc;
  /** Keys this codec does not model, held as written ([RawField]) — the
   * deleted `knows:`, a field from a newer engine, a misspelling. Each
   * reaches the compiler and comes back named at `place[i].<key>`. */
  extra?: RawField[];
}

/**
 * The party's entry point: a floor cell, and optionally which way they are
 * looking when they arrive (rpg-project#374 design, "The walks" — Kirk:
 * "we always start looking the wrong way and have to spin around").
 *
 * TWO SPELLINGS PARSE, ONE IS EMITTED. `start: [c, r]` is the bare pair
 * every dungeon written before this used, and it stays legal: it means a
 * start whose facing the author did not state. `start: { at: [c, r],
 * facing: e }` states one. This module emits the BARE PAIR whenever there
 * is no facing and the map whenever there is, so a file that states no
 * facing keeps the bytes it has always had — which is what the toolkit's
 * own fixtures are, and what their byte-pins check.
 *
 * The one consequence, accepted deliberately: a hand-written
 * `start: { at: [c, r] }` with no facing re-emits as `start: [c, r]`. The
 * same document, different bytes. Carrying the spelling through the model
 * to avoid that would be state that goes stale for no reader's benefit.
 *
 * FACING IS PRESENTATION, NOT A RULE (`AtlasStart.facing`'s own doc
 * comment): it aims the camera on the first frame and decides nothing
 * about where a member may walk or what they can see. Omitted means the
 * author stated none, which is the zero value telling the truth.
 */
export interface StartDoc {
  at: Axial;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
  /** One of the eight true-compass names, or absent. Carried verbatim —
   * this module never checks that the word is one of the eight; that is
   * the server's call, surfaced as a `start.facing` `FieldError` the way
   * `place[].facing` already is. */
  facing?: string;
}

/** One authored way out of the dungeon: an id and a floor cell — the
 * shape `start` already has (rpg-project#368 §3.1).
 *
 * STRUCTURE, NOT SCENARIO. A dungeon has ways out whatever the party is
 * there for, so exits sit beside `start` rather than inside a scenario's
 * bindings. `start` is NOT implicitly one of these: nothing is defaulted,
 * and a dungeon whose entrance is also its exit authors that in one line.
 */
export interface ExitDoc {
  id: string;
  at: Axial;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** One authored piece of intel: an id, and what learning it reveals
 * (rpg-project#372 §2).
 *
 * A DECLARATION, LIKE A DOOR. It sits in the dungeon file, a monster is
 * given it through `place[].holds`, and Loot applies its `reveals` to the
 * looter. Nothing about it is scenario machinery: a DM sets up intel for
 * whatever their story needs, and a scenario binds only the nouns its own
 * quest has (design R3, R5).
 *
 * `reveals` is CARRIED OPAQUELY, a map this module never interprets —
 * `{ door: <door id> }` is the only key the engine reads in this cut, and
 * the set grows one key per use case (a region, a treasure's location, a
 * lock's approach). Modelling it as a map rather than a `door` field is
 * what lets a file written against a newer rulebook round-trip here
 * unchanged, exactly as `scenarios` bindings do. */
export interface IntelDoc {
  id: string;
  reveals: Record<string, string>;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** One declared faction: who fights as one side (rpg-project#375 §2).
 *
 * `mind` is the hub knowledge spreads through — the faction knows what
 * its mind knows (R3), so a fact carried into the mind's region is what
 * flips an `until: { fact }`. It MUST name a monster placed in this
 * faction. Optional: a faction of one has its member as mind; a faction
 * of many with an `until: { fact }` and no mind is refused ("name a mind,
 * or the faction cannot learn") — inline here, by name from the compiler.
 * Carried verbatim; whether the id names a member is `factionRules.ts`'s
 * question, not the parser's. */
export interface FactionDoc {
  id: string;
  mind?: string;
  /** The author's ORDERS for every placement in this faction — the same `on:`
   * block a placement writes, inherited (design §1, layer 2).
   *
   * LAYERED, NEAREST KEY WINS WHOLESALE. A placement that writes its own
   * `time` key replaces this one's entirely — there is no merging of entry
   * lists, so an author never has to reason about what was added to what, and
   * the cost of overriding a key is visible in the file. That rule is the
   * engine's and the panel's to render; this module carries both tables
   * verbatim so the nearest-key decision has something to be made from. */
  on?: AnswerTableDoc;
  /** The temperament every placement in this faction has, or a MIX to deal one
   * from per member. A placement that names its own word wins, and the mix is
   * not dealt for it. */
  temper?: TemperDoc;
  /** Keys this codec does not model, held as written ([RawField]). `tempre`
   * lands here and comes back named by the compiler, at `factions[0].tempre`
   * — the probe the design doc runs. */
  extra?: RawField[];
}

/** One disposition: how two factions stand to each other, and the
 * predicate that ends the hostility (rpg-project#375 §2).
 *
 * `between` is UNORDERED in meaning and kept IN THE AUTHOR'S ORDER in the
 * bytes — a pair is a list the author wrote, not a map, so the emitter has
 * nothing to sort and re-emits what was parsed. One disposition per pair;
 * the second is refused inline and by the compiler. `until` is legal only
 * with `stance: hostile` and, when it holds, the stance becomes `neutral`.
 * Omitted means the stance never changes. */
export interface DispositionDoc {
  /** Two names, in the author's order. NOT a vocabulary rule: the panel
   * draws a disposition as two named sides, so a `between` that is not two
   * strings is one it cannot draw, and that refusal stays. */
  between: [string, string];
  /** The stance word as written. Whether it is one of the three is the
   * engine's answer; the panel offers the three and shows anything else
   * read-only. */
  stance: string;
  until?: PredicateHolder;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** One authored way the run ends: a name, and when (rpg-project#375 R10).
 *
 * THE PREDICATE GRAMMAR'S THIRD CONSUMER: `until` ends a hostility,
 * `arrives` brings a placement in, and `when` ends the run — one spelling,
 * one type. A scenario's own field is sugar for one of these:
 * `scenarios: { hold-out: { convince: raiders } }` declares exactly the
 * ending `{ id: hold-out, when: { stance: { between: [raiders, party], is:
 * neutral } } }` would. The id is what the `ended` beat names — required
 * and unique; `when` is required, nothing is defaulted. Written after
 * `exits` and before `scenarios`, the compiler's own order. */
export interface EndingDoc {
  id: string;
  /** Absent when the file wrote none — "an ending that does not say when it
   * fires" is the compiler's refusal to make, and it makes it. */
  when?: PredicateHolder;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** One scenario's bindings: the form's field keys mapped to the ids the
 * author picked. CARRIED OPAQUELY — the builder learns the keys from
 * `ListScenarios` and never interprets one, exactly as dungeonspec
 * carries them and the scenario package's own `New(cfg)` validates them
 * (ruled 2026-09-01). A key this client has never heard of round-trips
 * unchanged rather than being dropped. */
export type ScenarioBindings = Record<string, string>;

/** One authored wall: a STRAIGHT LINE between two positions, and the
 * file holds nothing else (rpg-project#360 slice 2, design §1.5, §3.2).
 *
 * The pair form — a wall as the list of hex-to-hex crossings it blocks —
 * is DELETED, not deprecated. It could not say what the author drew: on
 * a hex grid every degree-2 corner turns 60°, so a room corner and a
 * zigzag step were the same angle and the client had to guess the line
 * back out of the crossings with a tolerance. A wall now IS its line,
 * and the crossings it blocks, the cells it passes through and the cells
 * it seals are all derived from these two points — by the compiler for
 * the record, by `hexGeometry.ts` for the picker's preview.
 *
 * `start` and `end` are two of the seven positions (§3.3). A CORNER is
 * two walls carrying the same position at an end (F5) — the designer
 * writes a join by copying the position, and neither this module nor the
 * compiler has a corner concept. */
export interface WallDoc {
  start: PositionRef;
  end: PositionRef;
  /** The wall's display name, for the human reading the file and the
   * errors about it — "north wall" beats `walls[7]` for the streamers
   * who author these. Carried, never interpreted. */
  name?: string;
  /** Raise-only MULTIPLIER of the standard rendered wall height, in
   * `[1, 3]` (rpg-project#273's ruling: walls raise, they never lower).
   * Omitted means standard — exactly what writing `1` means. Bounds are
   * the server's call, surfaced as a `walls[i].height` `FieldError` like
   * any other field; this module only checks the SHAPE (a finite
   * number). VISUAL ONLY: a wall blocks movement and sight identically —
   * and cannot be seen past — at every height. */
  height?: number;
  /** Keys this codec does not model, held as written ([RawField]). */
  extra?: RawField[];
}

/** A wall's two ends on the lattice — the form every derivation takes
 * them in. */
export const wallLattice = (
  o: Orientation,
  wall: WallDoc
): { a: Lattice; b: Lattice } => ({
  a: latticeOf(o, wall.start),
  b: latticeOf(o, wall.end),
});

/** Every crossing the document's walls block, derived (C7) — the
 * client's mirror of what the compiler computes, and the ONLY way the
 * builder learns which hex-to-hex steps a wall stops now that the file
 * no longer lists them. A door's own crossing is NOT subtracted here: a
 * door stands IN a wall, and the compiler is what hands the crossing
 * back to the door (rpg-project#355, unchanged by the line form). */
export function wallCrossingKeys(doc: DungeonDoc): Set<string> {
  // FLOOR TO FLOOR ONLY, matching C2: a wall's ends stick out past the
  // room it caps, and the crossings out there run into void, which is
  // impassable already. Reporting them would put a wall where the
  // compiler puts nothing.
  const floor = floorKeys(doc);
  const keys = new Set<string>();
  for (const wall of doc.walls) {
    const { a, b } = wallLattice(doc.orientation, wall);
    for (const edge of wallCrossings(doc.orientation, a, b)) {
      if (!floor.has(axialKey(edge[0])) || !floor.has(axialKey(edge[1]))) {
        continue;
      }
      keys.add(edgeKey(edge));
    }
  }
  return keys;
}

/** Every cell one wall on its own seals — the cells its line halves
 * (design §4.3). What walls seal in COMBINATION is the compiler's answer
 * and arrives as `sealed` off the wire; this is the closed-form preview
 * the picker shows before the author commits. Floor only: a wall through
 * void seals nothing, there being nothing there to stand on. */
export function sealedKeys(doc: DungeonDoc): Set<string> {
  const floor = floorKeys(doc);
  const keys = new Set<string>();
  for (const wall of doc.walls) {
    const { a, b } = wallLattice(doc.orientation, wall);
    for (const cell of sealedBy(doc.orientation, a, b)) {
      const key = axialKey(cell);
      if (floor.has(key)) keys.add(key);
    }
  }
  return keys;
}

export interface DungeonDoc {
  version: 2;
  key: string;
  name: string;
  orientation: Orientation;
  void: VoidKind;
  regions: RegionDoc[];
  /** Floor nobody stands on — the cells belonging to no region at all
   * (rpg-project#360 slice 1, design §1.4/§3.1).
   *
   * A cell carries two facts, an OWNER and whether it is STANDABLE, and
   * scenery is the second without the first: floor for a wall to stand on
   * and a prop to sit on, never floor for feet. A cell is in exactly one
   * of a region, `scenery`, or void — the brush enforces that here
   * (`paintScenery`/`paintCell`) so the file can never carry the overlap
   * F1 refuses.
   *
   * ALWAYS PRESENT IN THE MODEL, WRITTEN ONLY WHEN IT HAS CELLS. The
   * field is optional in the file ("omitted = none", §3.1), which is what
   * keeps a dungeon that uses no scenery emitting the same bytes it
   * always did — and keeps it compiling on a server whose decoder does
   * not know the key yet. An empty list here is that absence, not a
   * different state. */
  scenery: Axial[];
  /** Where the party comes in, and which way they are looking when they
   * get there (`StartDoc`). NULL WHEN NOBODY AUTHORED ONE — the start is a
   * pointer end to end (rpg-project#374 design, "The walks"): a
   * zero-valued start would claim the party arrives at the origin looking
   * nowhere, so its absence is spelled as absence and the wire omits it. */
  start: StartDoc | null;
  walls: WallDoc[];
  doors: DoorDoc[];
  place: PlacementDoc[];
  /** The ways out (`ExitDoc`). ALWAYS PRESENT IN THE MODEL, WRITTEN ONLY
   * WHEN IT HAS ENTRIES — `scenery`'s own convention, and for its reason:
   * a dungeon that authors none emits exactly the bytes it always did and
   * keeps compiling on a server whose decoder has not learned the key. */
  exits: ExitDoc[];
  /** The intel records this dungeon declares (`IntelDoc`). ALWAYS PRESENT
   * IN THE MODEL, WRITTEN ONLY WHEN IT HAS ENTRIES — `exits`'s convention,
   * and for its reason: a dungeon that declares none emits exactly the
   * bytes it always did. */
  intel: IntelDoc[];
  /** The factions this dungeon declares (`FactionDoc`). ALWAYS PRESENT IN
   * THE MODEL, WRITTEN ONLY WHEN IT HAS ENTRIES — `intel`'s convention,
   * for its reason: a dungeon that declares none emits exactly the bytes
   * it always did, and its monsters stay `monsters`. */
  factions: FactionDoc[];
  /** The declared dispositions (`DispositionDoc`), in DOCUMENT order.
   * Same presence rule. What is NOT declared is defaulted by the engine,
   * never written here: `party` and `monsters` mutually hostile, a
   * declared faction hostile to `party` unless told otherwise, declared
   * factions neutral to each other (§2). */
  dispositions: DispositionDoc[];
  /** The authored endings (`EndingDoc`), in DOCUMENT order. ALWAYS PRESENT
   * IN THE MODEL, WRITTEN ONLY WHEN IT HAS ENTRIES, for `exits`'s reason. */
  endings: EndingDoc[];
  /** Scenario id -> that scenario's bindings. A dungeon may bind several;
   * the run ends when any bound ending fires. Written only when non-empty,
   * for `exits`'s reason. Emitted with both levels of keys SORTED, so the
   * bytes do not depend on the order an author happened to fill the form
   * in — the same determinism `cells` and `walls` already have. */
  scenarios: Record<string, ScenarioBindings>;
  /** Top-level keys this codec does not model, held as written
   * ([RawField]) — a block a newer engine reads and this builder has not
   * learned. Emitted last, so the keys it does model keep their order. */
  extra?: RawField[];
}

export const MONSTER_REF_PREFIX = 'dnd5e:monsters:';
export const isMonsterRef = (ref: string): boolean =>
  ref.startsWith(MONSTER_REF_PREFIX);

export class DungeonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DungeonParseError';
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * A key this codec does not model is REFUSED here — reserved for the small
 * shapes the canvas draws out of numbers alone (a wall end's
 * `{ cell, offset }`, a region's `{ intensity }`). There is nowhere in those
 * to hold a key, and a wall end carrying one is a line the picker cannot
 * preview.
 *
 * EVERY BLOCK AN AUTHOR WRITES GAMEPLAY IN USES [extraFields] INSTEAD
 * (rpg-project#481 R3). The suggestion survives because a refusal that says
 * what was meant still beats one that does not.
 */
function expectKeys(obj: Raw, allowed: string[], path: string): void {
  for (const k of Object.keys(obj)) {
    if (allowed.includes(k)) continue;
    const meant = suggestKey(k, allowed);
    throw new DungeonParseError(
      `${path}: unknown key "${k}"${meant ? ` — did you mean "${meant}"?` : ''}`
    );
  }
}

/**
 * The keys of `obj` this codec does not model, IN THE AUTHOR'S ORDER, or
 * undefined when there are none.
 *
 * This is the whole of "the builder keeps word lists, not rules" on the
 * unknown-key axis: what was a `DungeonParseError` at the door is now a
 * value held in the document and written back out, so the bytes the author
 * wrote are the bytes the compiler grades. `undefined` rather than `[]`
 * keeps a document with nothing extra byte-identical and `toEqual`-identical
 * to one parsed before this field existed.
 */
function extraFields(
  obj: Raw,
  modelled: readonly string[]
): RawField[] | undefined {
  const extra: RawField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (modelled.includes(key)) continue;
    extra.push({ key, value });
  }
  return extra.length > 0 ? extra : undefined;
}

function str(obj: Raw, key: string, path: string, fallback?: string): string {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new DungeonParseError(`${path}.${key}: required`);
  }
  if (typeof v !== 'string') {
    throw new DungeonParseError(`${path}.${key}: expected a string`);
  }
  return v;
}

function pair(v: unknown, path: string): OffsetPair {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !Number.isInteger(v[0]) ||
    !Number.isInteger(v[1])
  ) {
    throw new DungeonParseError(`${path}: expected [col,row]`);
  }
  return [v[0] as number, v[1] as number];
}

/** A within-cell offset — two numbers, unlike `pair`'s two integers.
 * Bounds (`[-0.5, 0.5]`) are the server's call, not checked here — see
 * `PlacementDoc.offset`'s own doc comment. `Number.isFinite`, not
 * `typeof === 'number'`: NaN/Infinity are still typeof "number" and
 * would otherwise pass the shape check, then break the parse/emit
 * round trip this module promises (Copilot review, PR #795). */
function offsetPair(v: unknown, path: string): PlacementOffset {
  if (
    !Array.isArray(v) ||
    (v.length !== 2 && v.length !== 3) ||
    !v.every((c) => Number.isFinite(c))
  ) {
    throw new DungeonParseError(`${path}: expected [x,y] or [x,y,height]`);
  }
  return v.length === 2
    ? [v[0] as number, v[1] as number]
    : [v[0] as number, v[1] as number, v[2] as number];
}

/** One `{ cell: [col,row], offset: [x,y] }` position (design §3.2/§3.3).
 * The offset MUST be one of the seven (F8) — an offset outside the set
 * is not a position this builder can place, name or draw, so it is
 * refused here by value rather than carried to the server as a
 * pretend one. */
function position(v: unknown, path: string, o: Orientation): PositionRef {
  if (!isRecord(v)) {
    throw new DungeonParseError(
      `${path}: expected { cell: [col,row], offset: [x,y] }`
    );
  }
  expectKeys(v, ['cell', 'offset'], path);
  const cell = fromOffset(o, pair(v.cell, `${path}.cell`));
  const raw = v.offset;
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    !raw.every((c) => Number.isFinite(c))
  ) {
    throw new DungeonParseError(`${path}.offset: expected [x,y]`);
  }
  const offset: Offset = [raw[0] as number, raw[1] as number];
  if (!isPositionOffset(o, offset)) {
    throw new DungeonParseError(
      `${path}.offset: [${offset[0]},${offset[1]}] is not one of the seven ` +
        `positions of a ${o}-top hex — a wall end and a door stand on a side ` +
        `midpoint or the centre, nowhere else (${POSITION_HELP[o]})`
    );
  }
  return { cell, offset };
}

/** The seven, spelled for a refusal a streamer can act on. */
const POSITION_HELP: Record<Orientation, string> = {
  pointy:
    '[0,0], [0.5,0], [-0.5,0], [0.25,-0.375], [-0.25,-0.375], ' +
    '[0.25,0.375], [-0.25,0.375]',
  flat:
    '[0,0], [0,0.5], [0,-0.5], [0.375,0.25], [0.375,-0.25], ' +
    '[-0.375,0.25], [-0.375,-0.25]',
};

/**
 * THE DELETED `knows:` FIELD IS NO LONGER REFUSED HERE (rpg-project#481 R3).
 *
 * `knows` was removed from the grammar (rpg-project#372 R1) — a monster HOLDS
 * an intel record now — and this module used to refuse it at the door in the
 * compiler's own words. That is the same shape as every other vocabulary
 * mirror: a sentence authored twice, which drifts the moment the engine's
 * changes. `knows` now rides `PlacementDoc.extra` to the compiler, which
 * names it at `place[i].knows` with the sentence it owns.
 *
 * `refusePairForm` below KEEPS its refusal, and the difference is the line
 * this module draws: a wall written in the deleted pair form has no line, and
 * a wall with no line is one the picker cannot preview or the canvas draw.
 * That is "can't draw", not "won't play".
 */

/** The pair form, refused at the header (F4). A `walls[]` entry written
 * as a bare `[[col,row],[col,row]]` or carrying `between`/`edges`, or a
 * `doors[]` entry carrying `edges`, is version 2's DELETED wall form —
 * not a field this loader failed to learn. Refused before anything else
 * is read, so the author gets the one sentence that explains the whole
 * file rather than a per-entry shape complaint. */
function refusePairForm(raw: Raw): void {
  const pairShaped = (w: unknown): boolean =>
    Array.isArray(w) ||
    (isRecord(w) && (w.between !== undefined || w.edges !== undefined));
  const walls = Array.isArray(raw.walls) ? raw.walls : [];
  const doors = Array.isArray(raw.doors) ? raw.doors : [];
  const badWall = walls.findIndex(pairShaped);
  const badDoor = doors.findIndex((d) => isRecord(d) && d.edges !== undefined);
  if (badWall === -1 && badDoor === -1) return;
  const where = badWall !== -1 ? `walls[${badWall}]` : `doors[${badDoor}]`;
  // THE COMPILER'S OWN SENTENCE, word for word (dungeonspec's constant),
  // prefixed with the field path the way it prefixes one. A refusal a
  // streamer meets twice — once here on load, once from the server —
  // must read the same both times, or the two look like two different
  // problems.
  throw new DungeonParseError(
    `${where}: \`edges\` is the deleted pair form: a wall is now a line, ` +
      '`start` and `end`, each a cell and one of the seven offsets, and a ' +
      'door is `at` one position on it.'
  );
}

function list(v: unknown, path: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v))
    throw new DungeonParseError(`${path}: expected a list`);
  return v;
}

/** One `{ ability, tool?, dc }` row — mirrors dungeonspec's `ApproachSpec`
 * parse. `tool` is written only when present, same optional-field
 * convention as every other doc type here. */
function approach(v: unknown, path: string): ApproachDoc {
  if (!isRecord(v)) throw new DungeonParseError(`${path}: expected a map`);
  if (!Number.isInteger(v.dc)) {
    throw new DungeonParseError(`${path}.dc: expected an integer`);
  }
  const out: ApproachDoc = {
    ability: str(v, 'ability', path),
    dc: v.dc as number,
  };
  if (v.tool !== undefined && v.tool !== null) {
    out.tool = str(v, 'tool', path);
  }
  const extra = extraFields(v, ['ability', 'tool', 'dc']);
  if (extra) out.extra = extra;
  return out;
}

/** A bare list of approach rows — a door's `locked` or `concealed`. An
 * authored-but-empty list parses through unchanged (this module only
 * refuses what it cannot represent; "at least one approach" is the
 * server's refusal to make, not the loader's). */
function checkList(v: unknown, path: string): CheckDoc {
  if (!Array.isArray(v)) {
    throw new DungeonParseError(`${path}: expected a list`);
  }
  return v.map((a, i) => approach(a, `${path}[${i}]`));
}

/**
 * THE LINE RESOLVER IS GONE (rpg-project#481 R3).
 *
 * `lineResolver`/`LineOf` re-read the document as an AST so a refusal could
 * append `(line N)` the way `dungeonspec`'s validator does. Every refusal
 * that carried a line was a gameplay verdict, and those are the compiler's
 * now — it resolves the line from the node it is holding, which is the only
 * place the number can be right. Nothing here needs the AST any more.
 */

/**
 * What `yaml.Node.Value` would hold for this parsed value — the text of a
 * SCALAR, and the empty string for anything else.
 *
 * The engine, reading a raw node, sees `""` where the author wrote a mapping
 * or a sequence (`body.Value` on a non-scalar is empty). Two refusals quote
 * that text — `` `enemy: ` is not a condition this build reads `` and
 * `"5" is not a temperament this build ships` — so the web has to see what
 * the node saw, not what `JSON.stringify` would print.
 */
function scalarText(v: unknown): string {
  return typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
    ? String(v)
    : '';
}

/**
 * A placement's or a faction's answer table (`on:`).
 *
 * NOTHING HERE IS A VERDICT (rpg-project#481 R3). The trigger keys and the
 * entry words are the ENGINE's closed sets, and the engine grades them: this
 * reads the shapes the builder edits — a trigger with a list of entries, an
 * entry with a weight, a line, a condition and its words — and holds
 * everything else exactly as the author wrote it. A trigger this build does
 * not roll, an entry that is not a mapping, a key nobody designed: each
 * travels in the bytes and comes back as a `FieldError` at its own path.
 *
 * WHY. A closed set transcribed in the web is a mirror of the engine's, and
 * a mirror drifts one release at a time. #1119 was this parser refusing the
 * only authored `on:` block in the project; #1145 was a `temper` the engine
 * takes. Both were a file the server plays and the builder would not open.
 */
function answerTable(v: Raw, orientation: Orientation): AnswerTableDoc {
  const table: AnswerTableDoc = [];
  for (const [trigger, entriesRaw] of Object.entries(v)) {
    // A trigger whose value is not a list of entries is held whole: the
    // author wrote something, and the compiler is what reads it.
    if (!Array.isArray(entriesRaw)) {
      table.push({ trigger, entries: [], raw: entriesRaw });
      continue;
    }
    table.push({
      trigger,
      entries: entriesRaw.map((e) => answerEntry(e, orientation)),
    });
  }
  return table;
}

/**
 * One entry: `{ weight?, say?, when?, <words> }`, and whatever else is there.
 *
 * THE ENTRY RULES ARE THE ENGINE'S TO ENFORCE, not this module's to mirror:
 * one word per entry, a wordless entry that still says something, a weight of
 * at least 1, `fact` with something to teach, a word legal on its trigger.
 * Every one of those was a refusal here and is now a value carried to the
 * compiler, which answers at the same path in its own sentence.
 *
 * `trigger` and the line resolver are no longer parameters: the only things
 * they were read for were the word-legality verdict and the `(line N)` suffix
 * on it, and both belong to the compiler now.
 */
function answerEntry(v: unknown, orientation: Orientation): AnswerEntryDoc {
  // An entry that is not a mapping is not a shape this model holds — so it
  // holds it whole rather than declining the file.
  if (!isRecord(v)) return { raw: v };

  const entry: AnswerEntryDoc = {};
  if (v.weight !== undefined && v.weight !== null) {
    // An authored weight is KEPT as authored — including a redundant `1` —
    // because omitted is 1 to the engine and the two are different bytes.
    // A weight that is not a whole number rides `extra` to the compiler.
    if (typeof v.weight === 'number' && Number.isInteger(v.weight)) {
      entry.weight = v.weight;
    }
  }
  if (v.say !== undefined && v.say !== null && typeof v.say === 'string') {
    entry.say = v.say;
  }
  if (v.when !== undefined && v.when !== null) {
    entry.when = answerWhen(v.when);
  }
  // The words, found by ASKING THE VOCABULARY rather than by listing keys
  // here: a word the engine adds is read by this loop with no change, and a
  // word it has not added yet rides `extra` instead of stopping the file.
  const words = ANSWER_WORD_KEYS.filter(
    (k) => v[k] !== undefined && v[k] !== null
  );
  if (words.length > 0) {
    entry.words = words.map((word) =>
      answerWordValue(word, v[word], orientation)
    );
  }
  // Anything this entry did not model — a misspelling, a word from a newer
  // build, a weight that is not whole, a `say` that is not a string.
  const held = ['when', ...words];
  if (entry.weight !== undefined) held.push('weight');
  if (entry.say !== undefined) held.push('say');
  const extra = extraFields(v, held);
  if (extra) entry.extra = extra;
  return entry;
}

/**
 * A `when:` — an enemy band, a deed with a span, or held whole.
 *
 * The two modelled arms are the two the builder edits. Two keys in one map,
 * a deed this build does not hold, a band outside the four, a span of zero:
 * each was a refusal and is now `{ kind: 'raw' }`, because `WhenSpec` is the
 * engine's type and `WhenSpec.UnmarshalYAML` is where its sentences live.
 */
function answerWhen(v: unknown): AnswerWhenDoc {
  if (!isRecord(v)) return { kind: 'raw', raw: v };
  const keys = Object.keys(v);
  if (keys.length !== 1) return { kind: 'raw', raw: v };
  const key = keys[0];

  if (key === 'enemy') {
    const band = scalarText(v.enemy);
    return ANSWER_WHEN.enemyBands.includes(band)
      ? { kind: 'enemy', band }
      : { kind: 'raw', raw: v };
  }

  if (!ANSWER_WHEN.deeds.includes(key)) return { kind: 'raw', raw: v };
  const body = v[key];
  if (!isRecord(body)) return { kind: 'raw', raw: v };
  if (Object.keys(body).length !== 1 || !Number.isInteger(body.within)) {
    return { kind: 'raw', raw: v };
  }
  return { kind: 'deed', deed: key, within: body.within as number };
}

/** One selector: a scalar as written, `{ at: [col,row] }`, or held whole.
 * Which scalars name something this build resolves, and which word a cell is
 * legal on, are the engine's answers (`SelectorSpec`, `entrySelector`). */
function answerSelector(
  v: unknown,
  path: string,
  orientation: Orientation
): AnswerSelectorDoc {
  if (typeof v === 'string') return { word: v };
  if (isRecord(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === 'at' && isPair(v.at)) {
      return { at: fromOffset(orientation, pair(v.at, `${path}.at`)) };
    }
  }
  return { raw: v };
}

/** Two integers — the one cell spelling this model converts to axial. Any
 * other `at:` body is carried as written instead. */
function isPair(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    Number.isInteger(v[0]) &&
    Number.isInteger(v[1])
  );
}

/** One outcome word's value, by the shape the declaration gives it: an opaque
 * id for `fact`, a MAPPING for `flee`/`hold`, a selector for
 * `attack`/`toward`/`away`. A body that is not that shape is held whole. */
function answerWordValue(
  word: string,
  raw: unknown,
  orientation: Orientation
): AnswerWordDoc {
  const shape = answerWord(word)?.value;
  if (shape === 'string') {
    return typeof raw === 'string' ? { word, value: raw } : { word, raw };
  }
  if (shape === 'selector') {
    const selector = answerSelector(raw, word, orientation);
    return selector.raw !== undefined ? { word, raw } : { word, selector };
  }
  // `value: 'none'` — `FleeSpec`/`HoldSpec` are structs and take a mapping.
  // A MAPPING IS CARRIED WHATEVER IS IN IT, because the engine accepts it:
  // its custom unmarshaler never runs `KnownFields` inside `FleeSpec`. A
  // scalar or a sequence is carried too, and refused where it is refused.
  return isRecord(raw) && Object.keys(raw).length === 0
    ? { word }
    : { word, raw };
}

/**
 * A `temper:` — a word, a mix, or held whole (`dungeonspec.TemperSpec`).
 *
 * NEITHER THE WORDS NOR THE SHAPE IS A RULE HERE. Which three temperaments
 * this build ships, whether a share can be dealt, and whether a mix is legal
 * on a placement are all `TemperSpec.UnmarshalYAML`'s and `validate.go`'s.
 * rpg-dnd5e-web#1145 was this function refusing a `temper` the engine takes.
 */
function temper(v: unknown): TemperDoc {
  if (typeof v === 'string') return { word: v };
  // A NON-STRING SCALAR reaches `TemperSpec.UnmarshalYAML` as a scalar node
  // and is read there as a word — but `temper: 5` and `temper: "5"` are
  // different bytes, and collapsing them would rewrite the author's file on
  // save. Held whole, it re-emits as the author typed it.
  if (!isRecord(v)) return { raw: v };
  const mix: TemperShareDoc[] = Object.entries(v).map(([word, share]) => ({
    word,
    share,
  }));
  return { mix };
}

/** `[faction, faction]` — two strings, carried verbatim. NOT a vocabulary
 * rule: the panel draws a disposition as two named sides, so a `between`
 * that is not two strings is one it cannot draw. */
function factionPair(v: unknown, path: string): [string, string] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !v.every((x) => typeof x === 'string')
  ) {
    throw new DungeonParseError(`${path}: expected [faction, faction]`);
  }
  return [v[0] as string, v[1] as string];
}

/**
 * One predicate — one of the four forms, or the map held whole.
 *
 * The forms are modelled because [PredicateEditor] edits them. A map with
 * two keys, a form this grammar has not learned, a `round` that is not a
 * number: each is a predicate the ENGINE reads, so it travels as written and
 * the editors show it read-only.
 */
function predicate(v: unknown): PredicateHolder {
  if (!isRecord(v)) return { raw: v };
  const keys = Object.keys(v);
  if (keys.length !== 1) return { raw: v };
  const form = keys[0];
  if (!(PREDICATE_FORMS as readonly string[]).includes(form)) return { raw: v };

  if (form === 'round') {
    return Number.isInteger(v.round)
      ? { round: v.round as number }
      : { raw: v };
  }
  if (form === 'down' || form === 'fact') {
    return typeof v[form] === 'string'
      ? ({ [form]: v[form] } as PredicateDoc)
      : { raw: v };
  }
  const s = v.stance;
  if (!isRecord(s)) return { raw: v };
  const between = s.between;
  if (
    Object.keys(s).length !== 2 ||
    typeof s.is !== 'string' ||
    !Array.isArray(between) ||
    between.length !== 2 ||
    !between.every((x) => typeof x === 'string')
  ) {
    return { raw: v };
  }
  return {
    stance: {
      between: [between[0] as string, between[1] as string],
      is: s.is as Stance,
    },
  };
}

export function parseDungeon(text: string): DungeonDoc {
  let raw: unknown;
  try {
    raw = parseYamlText(text);
  } catch (err) {
    throw new DungeonParseError(
      err instanceof Error ? err.message : 'YAML did not parse'
    );
  }
  if (!isRecord(raw)) throw new DungeonParseError('document: expected a map');
  // THE ROOT'S OWN UNMODELLED KEYS, held rather than refused: a block a newer
  // engine reads is a block this builder has not learned, and learning it is
  // not a precondition for opening the file (rpg-project#481 R3).
  const documentExtra = extraFields(raw, [
    'version',
    'key',
    'name',
    'orientation',
    'void',
    'regions',
    'scenery',
    'start',
    'walls',
    'doors',
    'place',
    'exits',
    'scenarios',
    'intel',
    'factions',
    'dispositions',
    'endings',
  ]);
  if (raw.version !== 2) {
    throw new DungeonParseError(
      `version: this builder writes dungeonspec version 2; got ${JSON.stringify(raw.version)} (version 1 is deleted, not supported)`
    );
  }
  refusePairForm(raw);
  const orientation = str(raw, 'orientation', 'document');
  if (orientation !== 'pointy' && orientation !== 'flat') {
    throw new DungeonParseError('orientation: expected pointy | flat');
  }
  const voidKind = str(raw, 'void', 'document');
  if (voidKind !== 'opaque' && voidKind !== 'transparent') {
    throw new DungeonParseError('void: expected opaque | transparent');
  }

  const regions = list(raw.regions, 'regions').map((r, i): RegionDoc => {
    const path = `regions[${i}]`;
    if (!isRecord(r)) throw new DungeonParseError(`${path}: expected a map`);
    const lighting = r.lighting;
    let intensity = 0;
    if (lighting !== undefined && lighting !== null) {
      if (!isRecord(lighting)) {
        throw new DungeonParseError(`${path}.lighting: expected a map`);
      }
      expectKeys(lighting, ['intensity'], `${path}.lighting`);
      if (typeof lighting.intensity !== 'number') {
        throw new DungeonParseError(
          `${path}.lighting.intensity: expected a number`
        );
      }
      intensity = lighting.intensity;
    }
    const cells: Axial[] = [];
    for (const [ri, row] of list(r.cells, `${path}.cells`).entries()) {
      for (const [ci, c] of list(row, `${path}.cells[${ri}]`).entries()) {
        cells.push(
          fromOffset(orientation, pair(c, `${path}.cells[${ri}][${ci}]`))
        );
      }
    }
    const region: RegionDoc = {
      id: str(r, 'id', path),
      name: str(r, 'name', path, ''),
      archetype: str(r, 'archetype', path, ''),
      lighting: { intensity },
      cells,
    };
    if (r.concealed !== undefined && r.concealed !== null) {
      if (typeof r.concealed !== 'boolean') {
        throw new DungeonParseError(`${path}.concealed: expected a boolean`);
      }
      if (r.concealed) region.concealed = true;
    }
    const extra = extraFields(r, [
      'id',
      'name',
      'archetype',
      'lighting',
      'cells',
      'concealed',
    ]);
    if (extra) region.extra = extra;
    return region;
  });

  // Same row encoding as `regions[].cells` — rows of `[col,row]` — so the
  // author reads one shape for floor whoever owns it. Absent is empty.
  const scenery: Axial[] = [];
  for (const [ri, row] of list(raw.scenery, 'scenery').entries()) {
    for (const [ci, c] of list(row, `scenery[${ri}]`).entries()) {
      scenery.push(fromOffset(orientation, pair(c, `scenery[${ri}][${ci}]`)));
    }
  }

  // BOTH SPELLINGS PARSE (`StartDoc`): the bare pair every older dungeon
  // uses, and the map that states a facing. Neither is preferred here —
  // the emitter picks one, and it picks by whether there is a facing.
  let start: StartDoc | null = null;
  if (raw.start !== undefined && raw.start !== null) {
    if (Array.isArray(raw.start)) {
      start = { at: fromOffset(orientation, pair(raw.start, 'start')) };
    } else if (isRecord(raw.start)) {
      start = { at: fromOffset(orientation, pair(raw.start.at, 'start.at')) };
      const extra = extraFields(raw.start, ['at', 'facing']);
      if (extra) start.extra = extra;
      // EMPTY FACING IS NO FACING — the zero value telling the truth, not
      // a third state. `AtlasStart.facing`'s own law says empty means the
      // author stated none, and every reader downstream collapses it that
      // way; carrying `facing: ''` in the model would let it re-emit as
      // `facing: ""` and print "the camera looks  on the first frame".
      const facing = raw.start.facing;
      if (facing !== undefined && facing !== null) {
        const word = str(raw.start, 'facing', 'start');
        if (word !== '') start.facing = word;
      }
    } else {
      throw new DungeonParseError(
        'start: expected [col,row] or { at: [col,row], facing? }'
      );
    }
  }

  const walls = list(raw.walls, 'walls').map((w, i): WallDoc => {
    const path = `walls[${i}]`;
    if (!isRecord(w)) {
      throw new DungeonParseError(
        `${path}: expected { start, end, height?, name? }`
      );
    }
    const wall: WallDoc = {
      start: position(w.start, `${path}.start`, orientation),
      end: position(w.end, `${path}.end`, orientation),
    };
    if (w.name !== undefined && w.name !== null) {
      if (typeof w.name !== 'string') {
        throw new DungeonParseError(`${path}.name: expected a string`);
      }
      wall.name = w.name;
    }
    if (w.height !== undefined && w.height !== null) {
      if (!Number.isFinite(w.height)) {
        throw new DungeonParseError(`${path}.height: expected a number`);
      }
      wall.height = w.height as number;
    }
    const extra = extraFields(w, ['start', 'end', 'height', 'name']);
    if (extra) wall.extra = extra;
    return wall;
  });

  const doors = list(raw.doors, 'doors').map((d, i): DoorDoc => {
    const path = `doors[${i}]`;
    if (!isRecord(d)) throw new DungeonParseError(`${path}: expected a map`);
    const door: DoorDoc = {
      id: str(d, 'id', path),
      at: position(d.at, `${path}.at`, orientation),
    };
    if (d.closed !== undefined && d.closed !== null) {
      if (typeof d.closed !== 'boolean') {
        throw new DungeonParseError(`${path}.closed: expected a boolean`);
      }
      if (d.closed) door.closed = true;
    }
    if (d.locked !== undefined && d.locked !== null) {
      door.locked = checkList(d.locked, `${path}.locked`);
    }
    if (d.concealed !== undefined && d.concealed !== null) {
      door.concealed = checkList(d.concealed, `${path}.concealed`);
    }
    const extra = extraFields(d, ['id', 'at', 'closed', 'locked', 'concealed']);
    if (extra) door.extra = extra;
    return door;
  });

  const place = list(raw.place, 'place').map((p, i): PlacementDoc => {
    const path = `place[${i}]`;
    if (!isRecord(p)) throw new DungeonParseError(`${path}: expected a map`);
    const placement: PlacementDoc = {
      ref: str(p, 'ref', path),
      at: fromOffset(orientation, pair(p.at, `${path}.at`)),
    };
    for (const [yamlKey, docKey] of [
      ['blocks_movement', 'blocksMovement'],
      ['blocks_los', 'blocksLos'],
      ['boss', 'boss'],
    ] as const) {
      const v = p[yamlKey];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'boolean') {
        throw new DungeonParseError(`${path}.${yamlKey}: expected a boolean`);
      }
      placement[docKey] = v;
    }
    if (p.facing !== undefined && p.facing !== null) {
      placement.facing = str(p, 'facing', path);
    }
    if (p.offset !== undefined && p.offset !== null) {
      placement.offset = offsetPair(p.offset, `${path}.offset`);
    }
    if (p.targeting !== undefined && p.targeting !== null) {
      placement.targeting = str(p, 'targeting', path);
    }
    if (p.id !== undefined && p.id !== null) {
      placement.id = str(p, 'id', path);
    }
    // NIL, NOT LEN 0, IS "HOLDS NOTHING" (`PlacementDoc.holds`'s law, the
    // same one `DoorDoc.locked` keeps): an authored empty list is carried
    // through rather than silently read as absent, so what the author
    // wrote is what the server judges.
    if (p.holds !== undefined && p.holds !== null) {
      placement.holds = list(p.holds, `${path}.holds`).map((d, j) => {
        if (typeof d !== 'string') {
          throw new DungeonParseError(`${path}.holds[${j}]: expected a string`);
        }
        return d;
      });
    }
    if (p.holdable !== undefined && p.holdable !== null) {
      if (typeof p.holdable !== 'boolean') {
        throw new DungeonParseError(`${path}.holdable: expected a boolean`);
      }
      if (p.holdable) placement.holdable = true;
    }
    // Carried verbatim, monster or prop: the "monsters only" rule is the
    // compiler's refusal to make and `factionRules.ts`'s to render, so a
    // file that breaks it loads and shows the line rather than bouncing.
    if (p.faction !== undefined && p.faction !== null) {
      placement.faction = str(p, 'faction', path);
    }
    if (p.arrives !== undefined && p.arrives !== null) {
      placement.arrives = predicate(p.arrives);
    }
    // The social surface. `intimidate`/`persuade` are the same check shape a
    // door's lock uses, so they share its parser; the "monsters only" rule
    // is the compiler's refusal to make, as it is for `faction`.
    if (p.intimidate !== undefined && p.intimidate !== null) {
      placement.intimidate = checkList(p.intimidate, `${path}.intimidate`);
    }
    if (p.persuade !== undefined && p.persuade !== null) {
      placement.persuade = checkList(p.persuade, `${path}.persuade`);
    }
    // Carried verbatim and NOT read: what a weapon ref means is the
    // compiler's and the catalogue's business (rpg-project#448).
    if (p.actions !== undefined && p.actions !== null) {
      placement.actions = list(p.actions, `${path}.actions`).map((a, j) => {
        if (typeof a !== 'string') {
          throw new DungeonParseError(
            `${path}.actions[${j}]: expected a string`
          );
        }
        return a;
      });
    }
    // An `on:` that is a map is the table the builder edits; anything else
    // rides `extra` to the compiler, whole.
    if (isRecord(p.on)) {
      placement.on = answerTable(p.on, orientation);
    }
    // A word here and a mix on the faction is the ENGINE'S asymmetry
    // (`TemperSpec`), and the engine is where it is enforced: a mix written
    // on a placement is carried and graded there. #1145 was the refusal.
    if (p.temper !== undefined && p.temper !== null) {
      placement.temper = temper(p.temper);
    }
    const extra = extraFields(p, [
      'ref',
      'at',
      'blocks_movement',
      'blocks_los',
      'facing',
      'offset',
      'targeting',
      'boss',
      'id',
      'holds',
      'holdable',
      'faction',
      'arrives',
      'intimidate',
      'persuade',
      'actions',
      // `on` is modelled only when it is a map — otherwise it belongs in
      // `extra`, so it is named here and re-added below.
      ...(isRecord(p.on) ? ['on'] : []),
      'temper',
    ]);
    if (extra) placement.extra = extra;
    return placement;
  });

  // The ways out. `at` is a plain `[col,row]`, exactly like `start`.
  const exits = list(raw.exits, 'exits').map((e, i): ExitDoc => {
    const path = `exits[${i}]`;
    if (!isRecord(e)) {
      throw new DungeonParseError(`${path}: expected { id, at: [col,row] }`);
    }
    const exit: ExitDoc = {
      id: str(e, 'id', path),
      at: fromOffset(orientation, pair(e.at, `${path}.at`)),
    };
    const extra = extraFields(e, ['id', 'at']);
    if (extra) exit.extra = extra;
    return exit;
  });

  // The intel records this dungeon declares. `reveals` is read as a map of
  // strings and nothing here knows what a key means — `door` is the only
  // one the engine reads today, and the set grows one key per use case.
  const intel = list(raw.intel, 'intel').map((r, i): IntelDoc => {
    const path = `intel[${i}]`;
    if (!isRecord(r)) {
      throw new DungeonParseError(`${path}: expected { id, reveals }`);
    }
    const reveals: Record<string, string> = {};
    if (r.reveals !== undefined && r.reveals !== null) {
      if (!isRecord(r.reveals)) {
        throw new DungeonParseError(`${path}.reveals: expected a map`);
      }
      for (const [key, value] of Object.entries(r.reveals)) {
        if (typeof value !== 'string') {
          throw new DungeonParseError(
            `${path}.reveals.${key}: expected a string`
          );
        }
        reveals[key] = value;
      }
    }
    const record: IntelDoc = { id: str(r, 'id', path), reveals };
    const extra = extraFields(r, ['id', 'reveals']);
    if (extra) record.extra = extra;
    return record;
  });

  // The factions this dungeon declares. `mind` is read as a string and
  // nothing here checks that it names a member — that is a refusal the
  // panel renders inline (`factionRules.ts`) and the compiler makes by
  // name, so a half-authored file still loads.
  //
  // A FACTION IS LAYER TWO OF A CREATURE'S POLICY (rpg-project#465): its `on:`
  // is inherited by every placement in it, nearest key wins wholesale, and its
  // `temper:` may be a word or a MIX dealt once per member. Both are carried
  // verbatim; which key the nearest layer wins is the panel's and the
  // compiler's to render, not this module's to decide.
  const factions = list(raw.factions, 'factions').map((f, i): FactionDoc => {
    const path = `factions[${i}]`;
    if (!isRecord(f)) {
      throw new DungeonParseError(`${path}: expected { id, mind? }`);
    }
    const faction: FactionDoc = { id: str(f, 'id', path) };
    if (f.mind !== undefined && f.mind !== null) {
      faction.mind = str(f, 'mind', path);
    }
    if (isRecord(f.on)) {
      faction.on = answerTable(f.on, orientation);
    }
    if (f.temper !== undefined && f.temper !== null) {
      faction.temper = temper(f.temper);
    }
    const extra = extraFields(f, [
      'id',
      'mind',
      ...(isRecord(f.on) ? ['on'] : []),
      'temper',
    ]);
    if (extra) faction.extra = extra;
    return faction;
  });

  // The dispositions, in the author's order. `stance` is a closed set this
  // module has to interpret (the panel's select needs a value it knows), so
  // an unknown word is refused here the way `orientation`'s is; `between`
  // is two strings carried verbatim, and `until` is a predicate.
  const dispositions = list(raw.dispositions, 'dispositions').map(
    (d, i): DispositionDoc => {
      const path = `dispositions[${i}]`;
      if (!isRecord(d)) {
        throw new DungeonParseError(
          `${path}: expected { between: [a, b], stance, until? }`
        );
      }
      const disposition: DispositionDoc = {
        between: factionPair(d.between, `${path}.between`),
        // The stance word AS WRITTEN. Which three this build folds is the
        // engine's sealed set, so an unknown one travels and is named there.
        stance: str(d, 'stance', path),
      };
      if (d.until !== undefined && d.until !== null) {
        disposition.until = predicate(d.until);
      }
      const extra = extraFields(d, ['between', 'stance', 'until']);
      if (extra) disposition.extra = extra;
      return disposition;
    }
  );

  // The authored endings: an id and a predicate. `when` is REQUIRED — an
  // ending that does not say when it fires is not one this module can
  // represent — and everything about whether it can fire is the compiler's.
  const endings = list(raw.endings, 'endings').map((e, i): EndingDoc => {
    const path = `endings[${i}]`;
    if (!isRecord(e)) {
      throw new DungeonParseError(
        `${path}: expected { id, when: <predicate> }`
      );
    }
    const ending: EndingDoc = { id: str(e, 'id', path, '') };
    // "The ending does not say when it fires" is the COMPILER'S refusal, and
    // it makes it: an ending with no `when` is held and graded there.
    if (e.when !== undefined && e.when !== null) {
      ending.when = predicate(e.when);
    }
    const extra = extraFields(e, ['id', 'when']);
    if (extra) ending.extra = extra;
    return ending;
  });

  // CARRIED OPAQUELY. Every binding value is read as a string and nothing
  // here knows what a key means — that is the scenario package's question,
  // asked through `New(cfg)` on the server (ruled 2026-09-01). A key this
  // build has never heard of survives the round trip untouched.
  const scenarios: Record<string, ScenarioBindings> = {};
  if (raw.scenarios !== undefined && raw.scenarios !== null) {
    if (!isRecord(raw.scenarios)) {
      throw new DungeonParseError('scenarios: expected a map');
    }
    for (const [id, bindings] of Object.entries(raw.scenarios)) {
      const path = `scenarios.${id}`;
      if (bindings === undefined || bindings === null) {
        scenarios[id] = {};
        continue;
      }
      if (!isRecord(bindings)) {
        throw new DungeonParseError(`${path}: expected a map`);
      }
      const out: ScenarioBindings = {};
      for (const [key, value] of Object.entries(bindings)) {
        if (typeof value !== 'string') {
          throw new DungeonParseError(`${path}.${key}: expected a string`);
        }
        out[key] = value;
      }
      scenarios[id] = out;
    }
  }

  return {
    version: 2,
    key: str(raw, 'key', 'document', ''),
    name: str(raw, 'name', 'document', ''),
    orientation,
    void: voidKind,
    regions,
    scenery,
    start,
    walls,
    doors,
    place,
    exits,
    scenarios,
    intel,
    factions,
    dispositions,
    endings,
    ...(documentExtra ? { extra: documentExtra } : {}),
  };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/** A YAML plain scalar is safe when it cannot be read as anything but a
 * string and carries no indicator characters; everything else is
 * double-quoted (JSON quoting is valid YAML). Deterministic either way. */
function scalar(s: string): string {
  const plain =
    /^[A-Za-z][A-Za-z0-9 _.'()/-]*$/.test(s) &&
    !/\s$/.test(s) &&
    !/^(true|false|null|yes|no|on|off|y|n)$/i.test(s);
  return plain ? s : JSON.stringify(s);
}

const fmtPair = ([c, r]: OffsetPair): string => `[${c},${r}]`;

/**
 * ANY parsed value, written back as flow YAML — the other half of carrying a
 * value verbatim ([RawField]). A key held on the way in has to come out
 * again, or the document the compiler grades is not the document the author
 * wrote.
 *
 * Flow style throughout: these are values this module does not model, so it
 * has no shape to lay out and no business inventing one. Map keys keep the
 * author's order for the same reason `AnswerTableDoc` is a list — a map has
 * no order of its own, and re-sorting one would move bytes nobody asked to
 * move.
 */
function rawText(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return scalar(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(rawText).join(', ')}]`;
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return `{ ${entries
      .map(([k, value]) => `${scalar(k)}: ${rawText(value)}`)
      .join(', ')} }`;
  }
  // A YAML value is one of the above; anything else came from a caller
  // building a document by hand, and `null` is the honest reading of it.
  return 'null';
}

/** The carried keys of one block, as `key: value` fields for a flow map, in
 * the author's own order. Empty when the block carried none. */
function extraText(extra: RawField[] | undefined): string[] {
  return (extra ?? []).map((f) => `${scalar(f.key)}: ${rawText(f.value)}`);
}

/** One `{ ability, tool?, dc }` row, key order matching
 * dungeonspec.ApproachSpec's own field order (ability, tool, dc). */
function fmtApproach(a: ApproachDoc): string {
  const fields = [`ability: ${scalar(a.ability)}`];
  if (a.tool !== undefined) fields.push(`tool: ${scalar(a.tool)}`);
  fields.push(`dc: ${a.dc}`);
  fields.push(...extraText(a.extra));
  return `{ ${fields.join(', ')} }`;
}

/** One `when:` as the file writes it — the enemy band, or the deed's own
 * past-tense name with its span. The language is the author's, not a generic
 * `deed:` key this module invented. */
function whenText(when: AnswerWhenDoc): string {
  if (when.kind === 'raw') return rawText(when.raw);
  return when.kind === 'enemy'
    ? `{ enemy: ${when.band} }`
    : `{ ${when.deed}: { within: ${when.within} } }`;
}

/** One selector as the file writes it: a word, or the authored cell — axial
 * in the model, `[col,row]` in the bytes, like every other cell. */
function selectorText(selector: AnswerSelectorDoc, o: Orientation): string {
  if (selector.at !== undefined)
    return `{ at: ${fmtPair(toOffset(o, selector.at))} }`;
  if (selector.word !== undefined) return scalar(selector.word);
  return rawText(selector.raw);
}

/** One outcome word and what it carries, by the shape the declaration gave
 * it. A `none` word is written `{}` — the form the engine's own doc gives it,
 * so the first option it grows is an addition and not a break. */
function answerWordText(word: AnswerWordDoc, o: Orientation): string {
  if (word.value !== undefined) return `${word.word}: ${scalar(word.value)}`;
  if (word.selector !== undefined) {
    return `${word.word}: ${selectorText(word.selector, o)}`;
  }
  // A body the declaration's shape did not fit — held on the way in, written
  // back on the way out, so the compiler grades what the author wrote.
  if (word.raw !== undefined) return `${word.word}: ${rawText(word.raw)}`;
  return `${word.word}: {}`;
}

/** One authored answer entry, as the file writes it: the weight, then the
 * line the creature says, then its condition, then its ONE word — the order
 * the author-facing reference gives (`{ weight, say, when, <one word> }`), so
 * a re-emitted table reads like the one the author wrote. */
function answerEntryText(entry: AnswerEntryDoc, o: Orientation): string {
  const fields: string[] = [];
  if (entry.weight !== undefined) fields.push(`weight: ${entry.weight}`);
  if (entry.say !== undefined) fields.push(`say: ${scalar(entry.say)}`);
  if (entry.when !== undefined) fields.push(`when: ${whenText(entry.when)}`);
  for (const word of entry.words ?? []) fields.push(answerWordText(word, o));
  fields.push(...extraText(entry.extra));
  return fields.join(', ');
}

/** One `temper:` as the file writes it — a word, or the faction's mix in the
 * author's own order. */
function temperText(t: TemperDoc): string {
  if (t.word !== undefined) return scalar(t.word);
  if (t.mix === undefined) return rawText(t.raw);
  if (t.mix.length === 0) return '{}';
  return `{ ${t.mix
    .map((share) => `${scalar(share.word)}: ${rawText(share.share)}`)
    .join(', ')} }`;
}

/** One answer table in BLOCK form, at the indentation of its `on:` key. A map
 * of lists of maps is legal YAML in flow style and unreadable, and the author
 * is the one who reads this file — so a placement or a faction carrying a
 * table switches to block form, while one carrying none emits exactly the
 * bytes it always did. */
function answerTableLines(
  table: AnswerTableDoc,
  indent: string,
  o: Orientation
): string[] {
  if (table.length === 0) return [`${indent}on: {}`];
  const lines = [`${indent}on:`];
  for (const trigger of table) {
    // A trigger whose value was never a list is written back as it came in.
    if (trigger.raw !== undefined) {
      lines.push(
        `${indent}  ${scalar(trigger.trigger)}: ${rawText(trigger.raw)}`
      );
      continue;
    }
    if (trigger.entries.length === 0) {
      lines.push(`${indent}  ${scalar(trigger.trigger)}: []`);
      continue;
    }
    lines.push(`${indent}  ${scalar(trigger.trigger)}:`);
    for (const entry of trigger.entries) {
      // An entry that was not a mapping keeps the shape it had.
      lines.push(
        entry.raw !== undefined
          ? `${indent}    - ${rawText(entry.raw)}`
          : `${indent}    - { ${answerEntryText(entry, o)} }`
      );
    }
  }
  return lines;
}

/** One predicate as the file writes it — a one-key flow map, the key's
 * spelling being the form (`PredicateDoc`). Exported for the panels that
 * show a predicate read-only in the file's own words. */
export function predicateText(p: PredicateHolder): string {
  if ('raw' in p) return rawText(p.raw);
  if ('round' in p) return `{ round: ${p.round} }`;
  if ('down' in p) return `{ down: ${scalar(p.down)} }`;
  if ('fact' in p) return `{ fact: ${scalar(p.fact)} }`;
  const [a, b] = p.stance.between;
  return `{ stance: { between: [${scalar(a)}, ${scalar(b)}], is: ${p.stance.is} } }`;
}

function compareOffset(a: OffsetPair, b: OffsetPair): number {
  return a[1] - b[1] || a[0] - b[0];
}

/**
 * The file's ORDER, computed once: cells sorted by row then column and
 * grouped one row per line, walls sorted, door edges sorted. `emitDungeon`
 * writes this and `resolveErrorPath` reads it, so a server path like
 * `regions[1].cells[0][3]` names the same cell the emitter put there.
 */
export interface EmittedLayout {
  regions: { region: RegionDoc; rows: Axial[][] }[];
  /** `scenery`'s rows, in the emitted order — the same row-per-line shape
   * a region's cells take, so `scenery[i][j]` in a compiler path names
   * the cell the emitter put there. */
  scenery: Axial[][];
  walls: WallDoc[];
  doors: DoorDoc[];
  /** The exits in the emitted order, which is the DOCUMENT order — the
   * same treatment `doors` gets, so `exits[i]` in a compiler path names
   * the entry the emitter put there. */
  exits: ExitDoc[];
}

/** Cells sorted by row then column and grouped one ROW per entry — the
 * file's cell shape, shared by a region's `cells` and by `scenery` so
 * both read and diff the same way. */
function cellRows(o: Orientation, cells: Axial[]): Axial[][] {
  const sorted = [...cells].sort((a, b) =>
    compareOffset(toOffset(o, a), toOffset(o, b))
  );
  const rows: Axial[][] = [];
  for (const cell of sorted) {
    const last = rows[rows.length - 1];
    if (last && toOffset(o, last[0])[1] === toOffset(o, cell)[1]) {
      last.push(cell);
    } else rows.push([cell]);
  }
  return rows;
}

export function emittedLayout(doc: DungeonDoc): EmittedLayout {
  const o = doc.orientation;
  return {
    regions: doc.regions.map((region) => ({
      region,
      rows: cellRows(o, region.cells),
    })),
    scenery: cellRows(o, doc.scenery),
    walls: sortedWalls(o, doc.walls),
    doors: doc.doors,
    exits: doc.exits,
  };
}

/** A number as the file writes it — plain decimal, never exponential
 * and never a trailing `.0`, so `0.25` and `-0.375` read back as the
 * same dyadic values the position set is made of. */
const fmtNum = (n: number): string => String(n);

function fmtPosition(o: Orientation, p: PositionRef): string {
  return `{ cell: ${fmtPair(toOffset(o, p.cell))}, offset: [${fmtNum(
    p.offset[0]
  )}, ${fmtNum(p.offset[1])}] }`;
}

/** Walls in a stable order: by their start position, then their end —
 * so `walls[i]` in the emitted file and in a compiler error path name
 * the same wall, and re-emitting a parsed file is byte-identical.
 * Compared on the LATTICE, not on the `{cell, offset}` spelling, so two
 * walls that meet at a corner sort by where they actually are. */
function sortedWalls(o: Orientation, walls: WallDoc[]): WallDoc[] {
  const rank = (p: PositionRef): [number, number] => {
    const l = latticeOf(o, p);
    return [l.v, l.u];
  };
  return [...walls].sort((x, y) => {
    const [xv, xu] = rank(x.start);
    const [yv, yu] = rank(y.start);
    if (xv !== yv || xu !== yu) return xv - yv || xu - yu;
    const [xev, xeu] = rank(x.end);
    const [yev, yeu] = rank(y.end);
    return xev - yev || xeu - yeu;
  });
}

export function emitDungeon(doc: DungeonDoc): string {
  const o = doc.orientation;
  const layout = emittedLayout(doc);
  const out: string[] = [];
  out.push('version: 2');
  out.push(`key: ${scalar(doc.key)}`);
  out.push(`name: ${scalar(doc.name)}`);
  out.push(`orientation: ${o}`);
  out.push(`void: ${doc.void}`);

  if (doc.regions.length === 0) {
    out.push('regions: []');
  } else {
    out.push('regions:');
    for (const { region, rows } of layout.regions) {
      out.push(`  - id: ${scalar(region.id)}`);
      out.push(`    name: ${scalar(region.name)}`);
      out.push(`    archetype: ${scalar(region.archetype)}`);
      out.push(`    lighting: { intensity: ${region.lighting.intensity} }`);
      if (rows.length === 0) {
        out.push('    cells: []');
      } else {
        out.push('    cells:');
        for (const row of rows) {
          out.push(
            `      - [${row.map((c) => fmtPair(toOffset(o, c))).join(',')}]`
          );
        }
      }
      if (region.concealed) {
        out.push('    concealed: true');
      }
      for (const field of extraText(region.extra)) out.push(`    ${field}`);
    }
  }

  // Written ONLY when it has cells (design §3.1: "optional; omitted =
  // none"). A dungeon with no scenery emits exactly the bytes it always
  // did — which is what keeps every existing file byte-identical and
  // keeps it compiling on a server that has not learned the key yet.
  if (layout.scenery.length > 0) {
    out.push('scenery:');
    for (const row of layout.scenery) {
      out.push(
        `      - [${row.map((c) => fmtPair(toOffset(o, c))).join(',')}]`
      );
    }
  }

  if (doc.start) {
    const [c, r] = toOffset(o, doc.start.at);
    // THE BARE PAIR WHEN THERE IS NO FACING. Every dungeon written before
    // facing existed keeps the bytes it has always had, which is what the
    // toolkit fixtures are and what their byte-pins check.
    const startFields: string[] = [];
    if (doc.start.facing !== undefined) {
      startFields.push(`facing: ${scalar(doc.start.facing)}`);
    }
    startFields.push(...extraText(doc.start.extra));
    out.push(
      startFields.length === 0
        ? `start: [${c}, ${r}]`
        : `start: { at: [${c}, ${r}], ${startFields.join(', ')} }`
    );
  }

  if (doc.walls.length === 0) {
    out.push('walls: []');
  } else {
    out.push('walls:');
    for (const w of layout.walls) {
      // One line per end, `start` above `end`, so a wall that moves
      // diffs as the end that moved (design §3.2's own shape).
      out.push(`  - start: ${fmtPosition(o, w.start)}`);
      out.push(`    end: ${fmtPosition(o, w.end)}`);
      if (w.name !== undefined) out.push(`    name: ${scalar(w.name)}`);
      if (w.height !== undefined) out.push(`    height: ${w.height}`);
      for (const field of extraText(w.extra)) out.push(`    ${field}`);
    }
  }

  if (doc.doors.length === 0) {
    out.push('doors: []');
  } else {
    out.push('doors:');
    for (const d of layout.doors) {
      out.push(`  - id: ${scalar(d.id)}`);
      out.push(`    at: ${fmtPosition(o, d.at)}`);
      if (d.locked !== undefined) {
        out.push(`    locked: [${d.locked.map(fmtApproach).join(', ')}]`);
      } else if (d.closed) {
        out.push('    closed: true');
      }
      if (d.concealed !== undefined) {
        out.push(`    concealed: [${d.concealed.map(fmtApproach).join(', ')}]`);
      }
      for (const field of extraText(d.extra)) out.push(`    ${field}`);
    }
  }

  if (doc.place.length === 0) {
    out.push('place: []');
  } else {
    out.push('place:');
    for (const p of doc.place) {
      // `id` LEADS the entry, the way a door's and a region's do — it is
      // the author's name for this line, and the thing a refusal about it
      // will quote.
      const fields = p.id !== undefined ? [`id: ${scalar(p.id)}`] : [];
      fields.push(`ref: ${JSON.stringify(p.ref)}`);
      fields.push(`at: ${fmtPair(toOffset(o, p.at))}`);
      // The side, right after the cell — design §1's own order — and
      // only when the author chose one: absent IS `monsters`.
      if (p.faction !== undefined) {
        fields.push(`faction: ${scalar(p.faction)}`);
      }
      // A placement's temperament is ONE word (`ANSWER_TEMPER`), so it rides
      // the flat fields beside `faction`.
      if (p.temper !== undefined) {
        fields.push(`temper: ${temperText(p.temper)}`);
      }
      if (p.blocksMovement !== undefined) {
        fields.push(`blocks_movement: ${p.blocksMovement}`);
      }
      if (p.blocksLos !== undefined) fields.push(`blocks_los: ${p.blocksLos}`);
      if (p.facing !== undefined) fields.push(`facing: ${scalar(p.facing)}`);
      if (p.offset !== undefined) {
        fields.push(`offset: [${p.offset.join(', ')}]`);
      }
      if (p.holdable) fields.push('holdable: true');
      if (p.targeting !== undefined) {
        fields.push(`targeting: ${scalar(p.targeting)}`);
      }
      if (p.holds !== undefined) {
        fields.push(`holds: [${p.holds.map(scalar).join(', ')}]`);
      }
      if (p.boss) fields.push('boss: true');
      if (p.arrives !== undefined) {
        fields.push(`arrives: ${predicateText(p.arrives)}`);
      }
      // The social checks and the named arms are FLAT, so they ride the
      // same flow map every other field uses.
      if (p.intimidate !== undefined) {
        fields.push(
          `intimidate: [${p.intimidate.map(fmtApproach).join(', ')}]`
        );
      }
      if (p.persuade !== undefined) {
        fields.push(`persuade: [${p.persuade.map(fmtApproach).join(', ')}]`);
      }
      if (p.actions !== undefined) {
        fields.push(`actions: [${p.actions.map(scalar).join(', ')}]`);
      }
      // The keys this codec never modelled, written back in the author's own
      // order, after the ones it did ([RawField]).
      fields.push(...extraText(p.extra));
      // The answer table is NESTED — a map of lists of maps — and a flow map
      // holding that is legal YAML and unreadable, while the author is the
      // one who reads this file. So an entry carrying a table is written in
      // BLOCK form. An entry WITHOUT one emits exactly what every entry
      // emitted before this field existed, so no existing dungeon's bytes
      // move (`arrives`'s law, and this module's).
      if (p.on === undefined) {
        out.push(`  - { ${fields.join(', ')} }`);
        continue;
      }
      const [lead, ...rest] = fields;
      out.push(`  - ${lead}`);
      for (const field of rest) out.push(`    ${field}`);
      for (const line of answerTableLines(p.on, '    ', o)) out.push(line);
    }
  }

  // Written ONLY when there are any (`DungeonDoc.factions`'s law), one flow
  // map per line in DOCUMENT order — design §1's own shape. A dungeon that
  // declares none emits the bytes it always did.
  //
  // A FACTION THAT CARRIES ORDERS OR A MIX IS WRITTEN IN BLOCK FORM, for the
  // placement entry's reason: `on:` is a map of lists of maps, and a flow map
  // holding that is legal YAML and unreadable. A faction with only an id and a
  // mind — every faction written before rpg-project#465 — keeps its one-line
  // form and its bytes.
  if (doc.factions.length > 0) {
    out.push('factions:');
    for (const f of doc.factions) {
      const fields = [`id: ${scalar(f.id)}`];
      if (f.mind !== undefined) fields.push(`mind: ${scalar(f.mind)}`);
      if (f.temper !== undefined)
        fields.push(`temper: ${temperText(f.temper)}`);
      fields.push(...extraText(f.extra));
      if (f.on === undefined) {
        out.push(`  - { ${fields.join(', ')} }`);
        continue;
      }
      const [lead, ...rest] = fields;
      out.push(`  - ${lead}`);
      for (const field of rest) out.push(`    ${field}`);
      for (const line of answerTableLines(f.on, '    ', o)) out.push(line);
    }
  }

  // The pair IN THE AUTHOR'S ORDER (`DispositionDoc.between`): a list the
  // author wrote, so re-emitting a parsed file is byte-identical without
  // this module deciding which of two unordered names comes first.
  if (doc.dispositions.length > 0) {
    out.push('dispositions:');
    for (const d of doc.dispositions) {
      const fields = [
        `between: [${scalar(d.between[0])}, ${scalar(d.between[1])}]`,
        `stance: ${scalar(d.stance)}`,
      ];
      if (d.until !== undefined) {
        fields.push(`until: ${predicateText(d.until)}`);
      }
      fields.push(...extraText(d.extra));
      out.push(`  - { ${fields.join(', ')} }`);
    }
  }

  // Written ONLY when there are any, so a dungeon that declares no intel
  // emits exactly the bytes it always did. Records in DOCUMENT order —
  // the author's own order, the way `doors` and `exits` keep theirs — and
  // each record's `reveals` keys SORTED, so the bytes do not depend on
  // which target the author happened to pick first.
  if (doc.intel.length > 0) {
    out.push('intel:');
    for (const record of doc.intel) {
      out.push(`  - id: ${scalar(record.id)}`);
      const keys = Object.keys(record.reveals).sort();
      if (keys.length === 0) {
        // A record that reveals nothing yet — the state a brand new one
        // is in before its target is picked. `{}` says that in one token.
        out.push('    reveals: {}');
      } else {
        out.push(
          `    reveals: { ${keys
            .map((key) => `${scalar(key)}: ${scalar(record.reveals[key])}`)
            .join(', ')} }`
        );
      }
      for (const field of extraText(record.extra)) out.push(`    ${field}`);
    }
  }

  // Written ONLY when there are any (`DungeonDoc.exits`'s own law), so a
  // dungeon that authors no way out emits the bytes it always did. `at` is
  // spelled exactly like `start` above — one authored cell, one shape.
  if (doc.exits.length > 0) {
    out.push('exits:');
    for (const e of layout.exits) {
      const [c, r] = toOffset(o, e.at);
      const fields = [`id: ${scalar(e.id)}`, `at: [${c}, ${r}]`];
      fields.push(...extraText(e.extra));
      out.push(`  - { ${fields.join(', ')} }`);
    }
  }

  // Written ONLY when there are any, after `exits` and before `scenarios`
  // — the compiler's own order — one flow map per line in DOCUMENT order.
  if (doc.endings.length > 0) {
    out.push('endings:');
    for (const e of doc.endings) {
      const fields = [`id: ${scalar(e.id)}`];
      if (e.when !== undefined) fields.push(`when: ${predicateText(e.when)}`);
      fields.push(...extraText(e.extra));
      out.push(`  - { ${fields.join(', ')} }`);
    }
  }

  // BOTH LEVELS SORTED. A map has no order of its own, and the author
  // filled the form in whatever order they clicked; sorting is what makes
  // the bytes a function of the document rather than of the session. It is
  // also the order the compiler enumerates these in, so its refusal list
  // and this file read down in step.
  const scenarioIds = Object.keys(doc.scenarios).sort();
  if (scenarioIds.length > 0) {
    out.push('scenarios:');
    for (const id of scenarioIds) {
      out.push(`  ${scalar(id)}:`);
      const bindings = doc.scenarios[id];
      const keys = Object.keys(bindings).sort();
      if (keys.length === 0) {
        // A scenario bound with nothing filled in yet. `{}` says that in
        // one token; a key with no value would be a different document.
        out[out.length - 1] = `  ${scalar(id)}: {}`;
        continue;
      }
      for (const key of keys) {
        out.push(`    ${scalar(key)}: ${scalar(bindings[key])}`);
      }
    }
  }

  // The root keys this codec never modelled, LAST, so every key it does
  // model keeps the position it has always had and no existing file's bytes
  // move ([RawField]).
  for (const field of extraText(doc.extra)) out.push(field);

  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every floor cell → the id of the region that owns it. A cell painted
 * into two regions (a file the server will refuse) keeps the FIRST
 * owner here; the brush never produces one (`paintCell`). */
export function floorOwners(doc: DungeonDoc): Map<string, string> {
  const owners = new Map<string, string>();
  for (const region of doc.regions) {
    for (const cell of region.cells) {
      const key = axialKey(cell);
      if (!owners.has(key)) owners.set(key, region.id);
    }
  }
  return owners;
}

/** The scenery cells as keys — floor with no owner. */
export function sceneryKeys(doc: DungeonDoc): Set<string> {
  return new Set(doc.scenery.map(axialKey));
}

export const isScenery = (doc: DungeonDoc, cell: Axial): boolean =>
  sceneryKeys(doc).has(axialKey(cell));

/** Every FLOOR cell — owned or scenery (design §1.1: "Floor is any cell
 * with an owner or a scenery mark"). What a wall may stand on, what a
 * door may cross, what a prop may sit on. */
export function floorKeys(doc: DungeonDoc): Set<string> {
  const keys = sceneryKeys(doc);
  for (const key of floorOwners(doc).keys()) keys.add(key);
  return keys;
}

export const isFloor = (doc: DungeonDoc, cell: Axial): boolean =>
  floorKeys(doc).has(axialKey(cell));

/** Whether FEET may be here. Owned floor only: scenery is floor nobody
 * stands on (design §1.3), so the start and every monster need this and
 * a prop needs only `isFloor`. Slice 1's whole difference between the
 * two predicates; slice 2 subtracts the cells walls seal as well. */
export const isStandable = (doc: DungeonDoc, cell: Axial): boolean =>
  floorOwners(doc).has(axialKey(cell));

/** Crossing key → door id, for every door. A door IS one crossing
 * (F11): the one across the side its position is the midpoint of. A
 * door parked on a centre — a position that is the midpoint of no side —
 * opens nothing and is listed nowhere here; the server refuses it by
 * name. */
export function doorEdgeOwners(doc: DungeonDoc): Map<string, string> {
  const owners = new Map<string, string>();
  for (const door of doc.doors) {
    const edge = positionCrossing(
      doc.orientation,
      latticeOf(doc.orientation, door.at)
    );
    if (edge) owners.set(edgeKey(edge), door.id);
  }
  return owners;
}

/** The crossing a door opens, or null for one standing on a centre. */
export const doorCrossing = (doc: DungeonDoc, door: DoorDoc): Edge | null =>
  positionCrossing(doc.orientation, latticeOf(doc.orientation, door.at));

/**
 * The `{cell, offset}` spelling this document should WRITE for a lattice
 * point: the one whose cell is floor.
 *
 * A side midpoint has two spellings, one per cell sharing the side, and
 * they are the same point — but only one of them may name a cell that is
 * on the map. A wall capping a room's north edge ends half a hex above
 * row 0, and the orientation-only canonical spelling can name row −1: a
 * cell nobody painted, that no error can highlight and no reader can
 * find. Naming it from the floor cell instead keeps every coordinate in
 * the file inside the dungeon.
 *
 * When both cells are floor there is nothing to choose between them and
 * the canonical spelling stands; when neither is, the point is off the
 * map either way and the canonical spelling stands too. Only the
 * asymmetric case moves, which is the case that matters.
 */
export function nameFromFloor(doc: DungeonDoc, l: Lattice): PositionRef | null {
  const o = doc.orientation;
  const floor = floorKeys(doc);
  const spellings = positionSpellings(o, l);
  return (
    spellings.find((p) => floor.has(axialKey(p.cell))) ?? spellings[0] ?? null
  );
}

/** Whether a wall passes through a position — F10's test, and what the
 * door tool offers on. Exact: the position is on the wall's own lattice
 * walk, not near it. */
export function wallsThrough(doc: DungeonDoc, at: PositionRef): number[] {
  const o = doc.orientation;
  const target = positionKey(o, at);
  const out: number[] = [];
  doc.walls.forEach((wall, i) => {
    const { a, b } = wallLattice(o, wall);
    const walk = latticeWalk(a, b);
    if (walk?.some((l) => latticeKey(l) === target)) out.push(i);
  });
  return out;
}

export function placementAt(
  doc: DungeonDoc,
  cell: Axial
): { index: number; placement: PlacementDoc } | null {
  const key = axialKey(cell);
  const index = doc.place.findIndex((p) => axialKey(p.at) === key);
  return index === -1 ? null : { index, placement: doc.place[index] };
}

// ---------------------------------------------------------------------------
// Concealment derivation (rpg-dnd5e-web#893) — "concealment links to the
// door": a region's hidden status is DERIVED from which doors are marked
// concealed, rather than declared a second time by hand for every room
// behind one. This walks the SAME "ways" the toolkit's own coherence check
// does (dungeonspec/validate.go's `concealment()`), so a document this
// module derives satisfies that check without repeating it (this module
// still "only refuses what it cannot represent", per the header comment;
// the server stays the validator of record).
//
// A WAY IS A FLOOD, NOT A CROSSING (rpg-project#360 slice 1, design C4).
// It used to be one step between two regions' cells, because that was the
// only way space could join. Scenery adds floor that belongs to no room,
// so a way is now "a wall-free path from a cell of A to a cell of B whose
// INTERIOR cells are all scenery" — never through a third region's cells,
// which is what keeps the flood from tunnelling one room into the next.
//
// TWO REGIONS ARE JOINED IN `open` IFF SOME WAY BETWEEN THEM HAS NO
// CONCEALED DOOR ON ANY CROSSING — not "iff the first crossing out is
// clear". The toolkit builder found that first-crossing depends on which
// end you start from: visible room, bare crossing, scenery, then the
// secret room's own concealed door reads as open from the visible side
// and closed from the secret side. The flood crosses bare crossings and
// ordinary doors, passes through scenery, and stops at walls and
// concealed doors, so both ends agree.
// ---------------------------------------------------------------------------

/** The region graph `deriveConcealment` walks. `open` carries every way
 * that needs no search to use — an unwalled crossing, or a door that is
 * NOT concealed — so reachability over `open` alone is what a party can
 * walk to from the start without finding anything. `full` adds every
 * concealed door's own crossing on top: the dungeon's actual physical
 * connectivity, secrets included. `concealedDoorCrossings` is kept
 * separately, per door, for leak detection and provenance — which region
 * pairs each concealed door itself joins. */
interface RegionGraph {
  open: Map<string, Set<string>>;
  full: Map<string, Set<string>>;
  concealedDoorCrossings: Map<string, [string, string][]>;
}

function addRegionEdge(
  graph: Map<string, Set<string>>,
  a: string,
  b: string
): void {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

/** What one crossing does to a way through it. */
type CrossingKind = 'wall' | 'plain' | 'concealed';

function buildRegionGraph(doc: DungeonDoc): RegionGraph {
  const owners = floorOwners(doc);
  const scenery = sceneryKeys(doc);
  // The crossings the walls block, DERIVED (C7) — the file no longer
  // lists them. A door's own crossing is subtracted, exactly as the
  // compiler subtracts it: a door stands IN a wall, and the wall hands
  // that one crossing back (rpg-project#355, unchanged by the line
  // form). That one substitution is what makes a door drawn inside a
  // wall a door here rather than a wall.
  const doorEdges = doorEdgeOwners(doc);
  const walls = new Set(
    [...wallCrossingKeys(doc)].filter((k) => !doorEdges.has(k))
  );
  const doorById = new Map(doc.doors.map((d) => [d.id, d] as const));
  const open: Map<string, Set<string>> = new Map();
  const full: Map<string, Set<string>> = new Map();
  const concealedDoorCrossings = new Map<string, [string, string][]>();

  const kindOf = (ek: string): CrossingKind => {
    // `walls` is the COMPILED set, so the crossing a door stands in has
    // already been subtracted from it (rpg-project#355 — a run keeps that
    // crossing and the compiler hands the edge back to the door), exactly
    // as the server subtracts it. That one substitution is what makes a
    // door drawn inside a wall run a door here rather than a wall; asking
    // about the door first as well would only hide which fact carries it.
    if (walls.has(ek)) return 'wall';
    const doorId = doorEdges.get(ek);
    const door = doorId ? doorById.get(doorId) : undefined;
    return door && door.concealed !== undefined ? 'concealed' : 'plain';
  };

  /** Every region a way from `seeds` leads to.
   *
   * The flood leaves the seeds, walks SCENERY ONLY, and stops the moment
   * it lands on any region's cell — that cell is where the way ends, so a
   * third room is a destination and never a corridor (design C4). Walls
   * always stop it; a concealed door stops it unless `allowConcealed`,
   * which is the whole difference between the `open` graph and the
   * `full` one. `originId` is the region the seeds belong to, so a way
   * back into its own cells is not reported as joining anything. */
  const waysFrom = (
    seeds: readonly Axial[],
    originId: string | null,
    allowConcealed: boolean
  ): Set<string> => {
    const reached = new Set<string>();
    const seen = new Set(seeds.map(axialKey));
    const queue = [...seeds];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of axialNeighbors(cur)) {
        const kind = kindOf(edgeKey([cur, n]));
        if (kind === 'wall') continue;
        if (kind === 'concealed' && !allowConcealed) continue;
        const nk = axialKey(n);
        const there = owners.get(nk);
        if (there !== undefined) {
          if (there !== originId) reached.add(there);
          continue;
        }
        if (!scenery.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        queue.push(n);
      }
    }
    return reached;
  };

  for (const region of doc.regions) {
    for (const there of waysFrom(region.cells, region.id, false)) {
      addRegionEdge(open, region.id, there);
    }
    // Every open way is a way, and the permissive flood explores a
    // superset of the strict one's crossings, so `full` needs only this.
    for (const there of waysFrom(region.cells, region.id, true)) {
      addRegionEdge(full, region.id, there);
    }
  }

  /** The regions one side of a concealed door's crossing opens onto,
   * without passing another concealed door — the door's own side of the
   * pair it joins. An owned cell IS its region; a scenery cell floods
   * until it finds one. */
  const regionsTouching = (cell: Axial): Set<string> => {
    const owner = owners.get(axialKey(cell));
    if (owner !== undefined) return new Set([owner]);
    if (!scenery.has(axialKey(cell))) return new Set();
    return waysFrom([cell], null, false);
  };

  for (const door of doc.doors) {
    if (door.concealed === undefined) continue;
    const pairs: [string, string][] = [];
    const crossing = doorCrossing(doc, door);
    for (const [near, far] of crossing ? [crossing] : []) {
      for (const a of regionsTouching(near)) {
        for (const b of regionsTouching(far)) {
          if (a === b) continue;
          const [x, y] = a <= b ? [a, b] : [b, a];
          if (!pairs.some(([px, py]) => px === x && py === y)) {
            pairs.push([x, y]);
          }
        }
      }
    }
    if (pairs.length > 0) concealedDoorCrossings.set(door.id, pairs);
  }

  return { open, full, concealedDoorCrossings };
}

/** The region graph as two questions, for the tests that must agree with
 * the toolkit's own walk (design C4, acceptance A3). The derivation below
 * rests entirely on these two facts, and "separated" and "joined only
 * through a secret" are different answers that `deriveConcealment` alone
 * cannot tell apart — both leave a region unmarked. */
export interface RegionWays {
  /** Some way joins these two regions. Crossings may include concealed
   * doors; walls always stop a way. */
  joined(a: string, b: string): boolean;
  /** Some way joins them with NO concealed door on ANY of its crossings —
   * what a party can walk without finding anything first. */
  openly(a: string, b: string): boolean;
}

export function regionWays(doc: DungeonDoc): RegionWays {
  const { open, full } = buildRegionGraph(doc);
  return {
    joined: (a, b) => full.get(a)?.has(b) ?? false,
    openly: (a, b) => open.get(a)?.has(b) ?? false,
  };
}

function startRegionId(doc: DungeonDoc): string | null {
  if (!doc.start) return null;
  return floorOwners(doc).get(axialKey(doc.start.at)) ?? null;
}

interface RegionBfs {
  visited: Set<string>;
  parent: Map<string, string>;
  depth: Map<string, number>;
}

function bfsRegions(start: string, graph: Map<string, Set<string>>): RegionBfs {
  const visited = new Set([start]);
  const parent = new Map<string, string>();
  const depth = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of graph.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, cur);
      depth.set(next, (depth.get(cur) ?? 0) + 1);
      queue.push(next);
    }
  }
  return { visited, parent, depth };
}

export interface ConcealmentDerivation {
  /** Region ids reachable only by ALSO crossing a concealed door — the
   * space `deriveConcealment` marks concealed. `null` when there is no
   * start to derive reachability from (already its own reported defect,
   * `validation.start()`'s "the dungeon does not say where the party
   * starts" — this module has nothing to add on top of that). */
  regionIds: Set<string> | null;
  /** Region id -> a concealed door whose own crossing touches it
   * directly, for the inspector's provenance note. A region hidden only
   * by sitting past ANOTHER hidden region — no door of its own — has no
   * entry here even though it IS in `regionIds`. */
  doorByRegion: Map<string, string>;
}

/** The derivation itself (rpg-dnd5e-web#893's ruling): a region is hidden
 * space when the party can reach it crossing concealed doors but NOT
 * without them — reachable in the full graph, unreachable in the open
 * one. Concealed-to-concealed adjacency composes for free here, the same
 * way it does in the toolkit's own check: a region behind a concealed
 * door that opens onto ANOTHER hidden region through a plain, unwalled
 * gap is `full`-reachable only via the door, so it lands in the result
 * too, door of its own or not.
 *
 * A region genuinely disconnected from start — no concealed door
 * anywhere on its only paths, so it is unreachable in `full` as well —
 * is left alone: this module does not invent a secret for it. That is
 * a deliberate choice, NOT a claim the engine catches the gap some
 * other way — measured live (PR #894 review), a disconnected region
 * with no concealment authored anywhere in the file compiles with zero
 * errors today. Closing that gap is a validator question, tracked
 * separately; this module's job stays narrow: derive from what IS
 * authored, don't guess at what a silent void might mean. */
export function deriveConcealment(doc: DungeonDoc): ConcealmentDerivation {
  const graph = buildRegionGraph(doc);
  const doorByRegion = new Map<string, string>();
  for (const [doorId, pairs] of graph.concealedDoorCrossings) {
    for (const [a, b] of pairs) {
      if (!doorByRegion.has(a)) doorByRegion.set(a, doorId);
      if (!doorByRegion.has(b)) doorByRegion.set(b, doorId);
    }
  }
  const start = startRegionId(doc);
  if (!start) return { regionIds: null, doorByRegion };
  const openReach = bfsRegions(start, graph.open).visited;
  const fullReach = bfsRegions(start, graph.full).visited;
  const regionIds = new Set<string>();
  for (const id of fullReach) {
    if (!openReach.has(id)) regionIds.add(id);
  }
  return { regionIds, doorByRegion };
}

export interface ConcealmentLeak {
  doorId: string;
  message: string;
}

/** A concealed door whose crossing isolates nothing: both regions it
 * connects are ALSO reachable without it, so marking it concealed hides
 * no space (rpg-dnd5e-web#893's leak case). This is not a defect the
 * toolkit's own compiler reports — a concealed door's crossing is never
 * itself "a walk-in", so `concealment()`'s frontier check passes it
 * whether or not the room behind it actually goes dark — so it would
 * otherwise ship silently: the checkbox reads concealed, nothing is
 * actually hidden. Reported ONCE per door, naming the region that should
 * have gone dark and where its other way in actually is, rather than
 * once per leaking edge. */
export function detectConcealmentLeaks(doc: DungeonDoc): ConcealmentLeak[] {
  const graph = buildRegionGraph(doc);
  const start = startRegionId(doc);
  if (!start) return [];
  const bfs = bfsRegions(start, graph.open);
  const name = (id: string) => doc.regions.find((r) => r.id === id)?.name || id;
  const leaks: ConcealmentLeak[] = [];
  for (const door of doc.doors) {
    if (door.concealed === undefined) continue;
    const pairs = graph.concealedDoorCrossings.get(door.id) ?? [];
    const leaking = pairs.filter(
      ([a, b]) => bfs.visited.has(a) && bfs.visited.has(b)
    );
    if (leaking.length === 0) continue;
    const [a, b] = leaking[0];
    const depthA = bfs.depth.get(a) ?? 0;
    const depthB = bfs.depth.get(b) ?? 0;
    const far = depthA >= depthB ? a : b;
    const near = far === a ? b : a;
    const entry = bfs.parent.get(far);
    const source = entry && entry !== far ? entry : near;
    leaks.push({
      doorId: door.id,
      message: `${door.id} is concealed, but ${name(far)} is already reachable from ${name(source)} without passing through it`,
    });
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Mutators — every one returns a NEW doc (React state), never mutates.
// ---------------------------------------------------------------------------

export function emptyDungeon(
  orientation: Orientation = 'pointy',
  key = 'new-dungeon'
): DungeonDoc {
  return {
    version: 2,
    key,
    name: 'New Dungeon',
    orientation,
    void: 'opaque',
    regions: [
      {
        id: 'region-1',
        name: 'Region 1',
        archetype: 'crypt',
        lighting: { intensity: 0.6 },
        cells: [],
      },
    ],
    scenery: [],
    start: null,
    walls: [],
    doors: [],
    place: [],
    exits: [],
    scenarios: {},
    intel: [],
    factions: [],
    dispositions: [],
    endings: [],
  };
}

/** Paint `cell` into `regionId`. A cell is floor in exactly ONE region:
 * painting it moves it out of whichever region held it before, so the
 * brush can never produce the overlap the server refuses. */
/** The offset-space rectangle two cells span, as axial cells.
 *
 * A "square room" is a rectangle in OFFSET coordinates — the `[col,row]` the
 * file is written in and the shape the canvas actually draws. Doing it in
 * axial would give a rhombus, which is not the room anybody means when they
 * drag a box. */
export function rectCells(o: Orientation, a: Axial, b: Axial): Axial[] {
  const [ac, ar] = toOffset(o, a);
  const [bc, br] = toOffset(o, b);
  const cells: Axial[] = [];
  for (let r = Math.min(ar, br); r <= Math.max(ar, br); r += 1) {
    for (let c = Math.min(ac, bc); c <= Math.max(ac, bc); c += 1) {
      cells.push(fromOffset(o, [c, r]));
    }
  }
  return cells;
}

/** Paint the whole rectangle `a`..`b` into `regionId` — the region-rect
 * commit (rpg-dnd5e-web#902).
 *
 * The floor as a box instead of eighty-four brush strokes. The rectangle is
 * taken in OFFSET space because that is the shape the canvas draws; the same
 * corners in axial give a rhombus. Cells already owned by another region
 * change hands, exactly as the brush does — the tool paints, it does not
 * negotiate.
 *
 * NOTE this paints FLOOR only. Walls are not authored from a rectangle: a
 * rectangle of hex edges is a staircase, and drawing it as a square is a
 * rendering problem the edge-slice model cannot solve. Kirk's ruling for the
 * real fix (rpg-dnd5e-web#905): a wall is a line that cuts hexes wherever it
 * likes, and a hex with more than 80% of itself left is one you can stand on. */
export function paintRect(
  doc: DungeonDoc,
  regionId: string,
  a: Axial,
  b: Axial
): DungeonDoc {
  const wanted = rectCells(doc.orientation, a, b);
  const keys = new Set(wanted.map(axialKey));
  const owners = floorOwners(doc);
  const scenery = doc.scenery.filter((c) => !keys.has(axialKey(c)));
  // Nothing to do when every cell is already this region's AND none of
  // them is scenery — a rectangle over a scenery strip claims it.
  if (
    scenery.length === doc.scenery.length &&
    wanted.every((c) => owners.get(axialKey(c)) === regionId)
  ) {
    return doc;
  }
  return {
    ...doc,
    scenery,
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => !keys.has(axialKey(c)));
      if (region.id === regionId) {
        return {
          ...region,
          cells: [...without, ...wanted].sort(compareAxial),
        };
      }
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

export function paintCell(
  doc: DungeonDoc,
  regionId: string,
  cell: Axial
): DungeonDoc {
  const key = axialKey(cell);
  const current = floorOwners(doc).get(key);
  // ONE STATE PER CELL (design §2.2): a room painted over scenery moves
  // the cell in, so the two lists can never both claim it.
  const scenery = doc.scenery.filter((c) => axialKey(c) !== key);
  if (current === regionId && scenery.length === doc.scenery.length) return doc;
  return {
    ...doc,
    scenery,
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      if (region.id === regionId) {
        return { ...region, cells: [...without, cell].sort(compareAxial) };
      }
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

/** What stands on `cell` and could not stand on scenery — the start, or
 * a monster. `null` when the cell is free to become scenery.
 *
 * Named, not boolean, because the caller's job is to say WHICH thing is
 * in the way (design §2.5: errors point at the thing). Props are never
 * in the way: they sit on scenery quite legally, which is most of why
 * the brush exists. */
export type SceneryBlocker = 'start' | 'monster';

export function sceneryBlockedBy(
  doc: DungeonDoc,
  cell: Axial
): SceneryBlocker | null {
  const key = axialKey(cell);
  if (doc.start && axialKey(doc.start.at) === key) return 'start';
  const standing = doc.place.find(
    (pl) => axialKey(pl.at) === key && isMonsterRef(pl.ref)
  );
  return standing ? 'monster' : null;
}

/** Paint `cell` as SCENERY — floor belonging to no room (design §2.1).
 *
 * The mirror of `paintCell`: one state per cell, so a room cell painted
 * scenery moves OUT of its region rather than joining a second list.
 *
 * REFUSED IN PLACE when the start or a monster stands there. The design
 * cascades placements under ERASE and only under erase (§2.2, which names
 * erase as the thing that takes walls, doors and placements with it);
 * the monster-meets-scenery collision it rules on is a REFUSAL with a
 * reason (§2.4). This is that same collision from the other side, so it
 * gets the same answer rather than silently deleting something the
 * author placed — there is no undo in this builder. */
export function paintScenery(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  if (sceneryKeys(doc).has(key)) return doc;
  if (sceneryBlockedBy(doc, cell) !== null) return doc;
  return {
    ...doc,
    scenery: [...doc.scenery, cell].sort(compareAxial),
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

/** Erase `cell` from the floor entirely. Anything that stood on it —
 * walls, door edges, the start, a placement — goes with it: an edge or
 * a placement off the floor is a file the server refuses, and the
 * canvas never shows one. */
export function eraseCell(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  if (!floorKeys(doc).has(key)) return doc;
  const touches = (e: Edge) => axialKey(e[0]) === key || axialKey(e[1]) === key;
  return {
    ...doc,
    scenery: doc.scenery.filter((c) => axialKey(c) !== key),
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
    // A wall goes with the cell only when the cell is one of its OWN
    // footprint (design §2.2's cascade): a line whose footprint the
    // erase empties stands nowhere, and one that merely passed nearby
    // is left alone. A door goes when its crossing touched the cell.
    walls: doc.walls.filter((w) => {
      const { a, b } = wallLattice(doc.orientation, w);
      const footprint = wallFootprint(doc.orientation, a, b);
      return footprint.some(
        (c) => axialKey(c) !== key && floorKeys(doc).has(axialKey(c))
      );
    }),
    doors: doc.doors.filter((d) => {
      const crossing = doorCrossing(doc, d);
      return crossing !== null && !touches(crossing);
    }),
    start: doc.start && axialKey(doc.start.at) === key ? null : doc.start,
    place: doc.place.filter((p) => axialKey(p.at) !== key),
  };
}

/** Add one wall: the line between two picked positions (design §2.6).
 *
 * IDEMPOTENT AND UNDIRECTED: a line already in `walls[]` — either way
 * round, since a wall has no direction — is not added twice. The two
 * ends are stored exactly as picked, which is how a corner is written:
 * picking a position another wall already ends at copies that position,
 * and the two entries then carry the same `{cell, offset}` (F5).
 *
 * REFUSED IN PLACE, returning the same doc, when the line is not one of
 * the twelve directions (F13) or when its footprint holds no floor at
 * all (C2 — a wall standing in nothing). The picker only ever offers
 * legal ends, so this is the guard for a caller that did not go through
 * it, not the author's normal path. */
export function addWall(
  doc: DungeonDoc,
  start: PositionRef,
  end: PositionRef,
  height?: number
): DungeonDoc {
  const o = doc.orientation;
  const a = latticeOf(o, start);
  const b = latticeOf(o, end);
  const floor = floorKeys(doc);
  // ONE guard for two rules, because for a pair off the twelve they are
  // the same condition: a wall that is not on one of the directions has
  // no lattice walk, so it has no footprint either, and a second
  // `wallDirection` check beside this one could never be the reason
  // anything was refused. F13 (a direction off the twelve) and C2 (a
  // wall standing in nothing) both land here.
  if (!wallFootprint(o, a, b).some((c) => floor.has(axialKey(c)))) return doc;
  const key = wallKey(o, { start, end });
  if (doc.walls.some((w) => wallKey(o, w) === key)) return doc;
  const wall: WallDoc = { start, end };
  if (height !== undefined) wall.height = height;
  return { ...doc, walls: [...doc.walls, wall] };
}

/** A wall's identity: its two ends on the lattice, unordered — a wall
 * drawn from either end is the same wall. */
export function wallKey(o: Orientation, wall: WallDoc): string {
  const a = latticeKey(latticeOf(o, wall.start));
  const b = latticeKey(latticeOf(o, wall.end));
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Remove walls by index — the wall selection's Delete. */
export function removeWalls(doc: DungeonDoc, indexes: number[]): DungeonDoc {
  const drop = new Set(indexes);
  if (drop.size === 0) return doc;
  const walls = doc.walls.filter((_, i) => !drop.has(i));
  return walls.length === doc.walls.length ? doc : { ...doc, walls };
}

/** Stamp `height` on the selected walls — the height stepper's commit
 * (rpg-project#273). `undefined` clears back to standard. Height belongs
 * to the WALL now, so nothing splits: a wall is one line and one height
 * by construction, which is what the run's chain-level stamp was
 * approximating. */
export function setWallHeights(
  doc: DungeonDoc,
  indexes: number[],
  height: number | undefined
): DungeonDoc {
  const chosen = new Set(indexes);
  let changed = false;
  const walls = doc.walls.map((wall, i) => {
    if (!chosen.has(i) || wall.height === height) return wall;
    changed = true;
    const next: WallDoc = { start: wall.start, end: wall.end };
    if (wall.name !== undefined) next.name = wall.name;
    if (height !== undefined) next.height = height;
    return next;
  });
  return changed ? { ...doc, walls } : doc;
}

/** Name a wall — "north wall" beats `walls[7]` for the streamer reading
 * the file and the errors about it. An empty name clears the field. */
export function setWallName(
  doc: DungeonDoc,
  index: number,
  name: string
): DungeonDoc {
  const wall = doc.walls[index];
  if (!wall) return doc;
  const next: WallDoc = { start: wall.start, end: wall.end };
  if (name.trim() !== '') next.name = name;
  if (wall.height !== undefined) next.height = wall.height;
  return { ...doc, walls: doc.walls.map((w, i) => (i === index ? next : w)) };
}

/** Door tool: a click on a position a wall passes through (design §2.8).
 * Clicking a position that already carries a door removes it; otherwise
 * a new door stands there.
 *
 * REFUSED IN PLACE when no wall passes through the position (F10) or
 * when the position is a centre, which is the midpoint of no side and so
 * opens no crossing. A door in a wall that seals both its cells IS legal
 * (F11a — nobody passes it, sight does; the designer labels it), so
 * nothing about standability is checked here. */
export function toggleDoorAt(doc: DungeonDoc, at: PositionRef): DungeonDoc {
  const o = doc.orientation;
  const key = positionKey(o, at);
  const existing = doc.doors.findIndex((d) => positionKey(o, d.at) === key);
  if (existing !== -1) {
    return { ...doc, doors: doc.doors.filter((_, i) => i !== existing) };
  }
  if (positionCrossing(o, latticeOf(o, at)) === null) return doc;
  if (wallsThrough(doc, at).length === 0) return doc;
  return { ...doc, doors: [...doc.doors, { id: nextDoorId(doc), at }] };
}

function nextDoorId(doc: DungeonDoc): string {
  const taken = new Set(doc.doors.map((d) => d.id));
  let n = doc.doors.length + 1;
  while (taken.has(`door-${n}`)) n += 1;
  return `door-${n}`;
}

export function updateDoor(
  doc: DungeonDoc,
  doorId: string,
  patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked' | 'concealed'>>
): DungeonDoc {
  return {
    ...doc,
    doors: doc.doors.map((d) => {
      if (d.id !== doorId) return d;
      const next: DoorDoc = { ...d, ...patch };
      if (!next.closed) delete next.closed;
      if (!next.locked) delete next.locked;
      if (!next.concealed) delete next.concealed;
      return next;
    }),
  };
}

/** The party's entry cell. STANDABLE floor only (design §2.4/F2): the
 * start on scenery is a file the server refuses, and refusing it here in
 * place — the same doc back — is what lets the caller say why. */
export function setStart(doc: DungeonDoc, cell: Axial | null): DungeonDoc {
  if (cell && !isStandable(doc, cell)) return doc;
  // MOVING THE START KEEPS ITS FACING. The author picked which way the
  // party looks; dragging the entry one cell over is not them changing
  // their mind about that.
  if (!cell) return { ...doc, start: null };
  return {
    ...doc,
    start: { ...(doc.start ?? {}), at: cell },
  };
}

/** Aim the start, or clear the aim. An empty name removes `facing`, which
 * is how the file says "the author stated none" — the bare pair. */
export function setStartFacing(
  doc: DungeonDoc,
  facing: string | undefined
): DungeonDoc {
  if (!doc.start) return doc;
  const next: StartDoc = { at: doc.start.at };
  if (facing) next.facing = facing;
  return { ...doc, start: next };
}

/** Put a way out on a cell, or take the one already there away — the
 * `start` tool's gesture with a list behind it (design §3.1).
 *
 * STANDABLE FLOOR ONLY, the same refusal-in-place `setStart` makes and for
 * the same reason: the compiler refuses an exit on scenery in `start`'s own
 * words, and handing the same document back is what lets the caller say
 * why instead of the click appearing to do nothing. */
export function toggleExitAt(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  const existing = doc.exits.findIndex((e) => axialKey(e.at) === key);
  if (existing !== -1) {
    return { ...doc, exits: doc.exits.filter((_, i) => i !== existing) };
  }
  if (!isStandable(doc, cell)) return doc;
  return { ...doc, exits: [...doc.exits, { id: nextExitId(doc), at: cell }] };
}

function nextExitId(doc: DungeonDoc): string {
  const taken = new Set(doc.exits.map((e) => e.id));
  let n = doc.exits.length + 1;
  while (taken.has(`exit-${n}`)) n += 1;
  return `exit-${n}`;
}

export function updateExit(
  doc: DungeonDoc,
  index: number,
  patch: Partial<Pick<ExitDoc, 'id'>>
): DungeonDoc {
  return {
    ...doc,
    exits: doc.exits.map((e, i) => (i === index ? { ...e, ...patch } : e)),
  };
}

export function removeExit(doc: DungeonDoc, index: number): DungeonDoc {
  return { ...doc, exits: doc.exits.filter((_, i) => i !== index) };
}

/** Bind this dungeon to a scenario with nothing filled in yet — what the
 * author's choice on the Scenario tab writes (`scenarios: { hold-out: {} }`).
 * The empty block is the whole point: it is what makes the scenario's blanks
 * appear, and what makes the compiler start asking for them. Choosing one
 * that is already bound changes nothing rather than wiping what is in it. */
export function addScenario(doc: DungeonDoc, scenarioId: string): DungeonDoc {
  if (doc.scenarios[scenarioId] !== undefined) return doc;
  return { ...doc, scenarios: { ...doc.scenarios, [scenarioId]: {} } };
}

/** Unbind a scenario entirely, blanks and all — the Remove beside its form.
 *
 * This is the ONLY way a scenario leaves the file (rpg-dnd5e-web#945).
 * Clearing the last blank used to do it as a side effect, which was right
 * while filling a blank in was the only way to bind one; now that adding and
 * removing are verbs the author presses, a form must not vanish out from
 * under the hand that emptied it. */
export function clearScenarioBinding(
  doc: DungeonDoc,
  scenarioId: string
): DungeonDoc {
  if (doc.scenarios[scenarioId] === undefined) return doc;
  const scenarios = { ...doc.scenarios };
  delete scenarios[scenarioId];
  return { ...doc, scenarios };
}

/** Bind one field of one scenario. An EMPTY value UNBINDS the field and
 * leaves the scenario bound with that blank empty — a state the compiler
 * refuses out loud, by name, which is the answer an author wants over a
 * form that quietly disappears. `clearScenarioBinding` is the way out. */
export function setScenarioBinding(
  doc: DungeonDoc,
  scenarioId: string,
  key: string,
  value: string
): DungeonDoc {
  const current = doc.scenarios[scenarioId];
  // Clearing a blank on a scenario this dungeon does not bind binds nothing:
  // the empty value has to mean "no binding" here too, or an unbind would be
  // how a scenario gets into the file.
  if (current === undefined && value === '') return doc;
  const next: ScenarioBindings = { ...(current ?? {}) };
  if (value === '') delete next[key];
  else next[key] = value;
  return { ...doc, scenarios: { ...doc.scenarios, [scenarioId]: next } };
}

/** Declare a new intel record, with a suggested id and nothing revealed
 * yet — the author picks its target and its holders from the panel
 * (design R2: "the form should assign the Intel to something"). */
export function addIntel(doc: DungeonDoc): DungeonDoc {
  return {
    ...doc,
    intel: [...doc.intel, { id: nextIntelId(doc), reveals: {} }],
  };
}

function nextIntelId(doc: DungeonDoc): string {
  const taken = new Set(doc.intel.map((r) => r.id));
  let n = doc.intel.length + 1;
  while (taken.has(`intel-${n}`)) n += 1;
  return `intel-${n}`;
}

/** Rename or re-point one intel record. A RENAME FOLLOWS THROUGH to every
 * `holds:` that names the old id (ruling 2026-09-05: the Intel and Factions
 * sections sit side by side and must not differ in this — a faction rename
 * follows through to its members, so a record rename follows through to
 * its holders), because a `holds` naming a record the file no longer
 * declares is refused by the compiler and the author did not write that. */
export function updateIntel(
  doc: DungeonDoc,
  id: string,
  patch: Partial<IntelDoc>
): DungeonDoc {
  const intel = doc.intel.map((r) => (r.id === id ? { ...r, ...patch } : r));
  const to = patch.id;
  if (to === undefined || to === id) return { ...doc, intel };
  return {
    ...doc,
    intel,
    place: doc.place.map((p) =>
      p.holds?.includes(id)
        ? { ...p, holds: p.holds.map((held) => (held === id ? to : held)) }
        : p
    ),
  };
}

/** Point one record at one thing. An EMPTY value clears that target, and a
 * record revealing nothing is a legal in-progress state the file can hold
 * — the compiler is what refuses to compile it, in its own words. */
export function setIntelReveals(
  doc: DungeonDoc,
  id: string,
  key: string,
  value: string
): DungeonDoc {
  return {
    ...doc,
    intel: doc.intel.map((record) => {
      if (record.id !== id) return record;
      const reveals = { ...record.reveals };
      if (value === '') delete reveals[key];
      else reveals[key] = value;
      return { ...record, reveals };
    }),
  };
}

/** Remove a record, and take it out of every monster holding it — a
 * `holds:` naming a record the file does not declare is refused by the
 * compiler, and deleting the record is not a way to author that. */
export function removeIntel(doc: DungeonDoc, id: string): DungeonDoc {
  return {
    ...doc,
    intel: doc.intel.filter((r) => r.id !== id),
    place: doc.place.map((p) => {
      if (!p.holds?.includes(id)) return p;
      const holds = p.holds.filter((held) => held !== id);
      const next: PlacementDoc = { ...p, holds };
      if (holds.length === 0) delete next.holds;
      return next;
    }),
  };
}

/**
 * Assign one record to exactly this set of monsters, by placement id.
 *
 * THE ASSIGNMENT IS EDITED FROM THE RECORD, not from the thing holding it
 * (design R2/§5): the author says "who holds the vault map", and the
 * placement's own panel shows what it holds read-only. So this writes
 * across every placement at once rather than patching one.
 *
 * MONSTERS AND PROPS ALIKE (R6). A placement may hold several records and
 * a record may be held by several placements — intel COPIES, it does not
 * move.
 */
export function setIntelHolders(
  doc: DungeonDoc,
  recordId: string,
  holderIds: readonly string[]
): DungeonDoc {
  const holders = new Set(holderIds);
  return {
    ...doc,
    place: doc.place.map((p) => {
      const has = p.holds?.includes(recordId) ?? false;
      const wants = !!p.id && holders.has(p.id);
      if (has === wants) return p;
      const holds = wants
        ? [...(p.holds ?? []), recordId]
        : (p.holds ?? []).filter((held) => held !== recordId);
      const next: PlacementDoc = { ...p, holds };
      if (holds.length === 0) delete next.holds;
      return next;
    }),
  };
}

/** Which monsters hold this record, by placement id, in document order. */
export function intelHolders(doc: DungeonDoc, recordId: string): string[] {
  return doc.place
    .filter((p) => !!p.id && p.holds?.includes(recordId))
    .map((p) => p.id as string);
}

// ---------------------------------------------------------------------------
// Factions and dispositions (rpg-project#375 §2, §7)
// ---------------------------------------------------------------------------

/** Declare a new faction with a suggested id and no mind yet — the author
 * names it and picks its mind from the panel. */
export function addFaction(doc: DungeonDoc): DungeonDoc {
  return { ...doc, factions: [...doc.factions, { id: nextFactionId(doc) }] };
}

function nextFactionId(doc: DungeonDoc): string {
  const taken = new Set(doc.factions.map((f) => f.id));
  let n = doc.factions.length + 1;
  while (taken.has(`faction-${n}`)) n += 1;
  return `faction-${n}`;
}

/** One predicate with every mention of faction `from` renamed to `to` —
 * only the `stance` form names a faction. A predicate this grammar has not
 * learned is returned UNTOUCHED: the rename follows the forms this module can
 * read, and inventing a substitution inside a shape it does not understand
 * would rewrite an author's file on a guess. */
function renamePredicateFaction(
  p: PredicateHolder,
  from: string,
  to: string
): PredicateHolder {
  if (!isPredicateDoc(p) || !('stance' in p)) return p;
  const follow = (name: string) => (name === from ? to : name);
  const [a, b] = p.stance.between;
  return { stance: { between: [follow(a), follow(b)], is: p.stance.is } };
}

/** Whether a predicate names faction `id` — the `stance` form is the only
 * one that can, and a held-whole predicate names nothing this module can
 * read, so it is left alone. */
function predicateNamesFaction(p: PredicateHolder, id: string): boolean {
  return isPredicateDoc(p) && 'stance' in p && p.stance.between.includes(id);
}

/**
 * Rename or re-mind one faction. A RENAME FOLLOWS THROUGH to every line
 * that points at the old name — each member's `faction`, every
 * disposition's `between`, every `stance` predicate — because a faction's
 * id is what those lines are written in terms of, and a rename that left
 * three refusals behind would be a trap the author did not set. The panel
 * holds a blank or clashing name as typed text and never sends it here,
 * exactly as the placement id control does.
 */
export function updateFaction(
  doc: DungeonDoc,
  id: string,
  patch: Partial<FactionDoc>
): DungeonDoc {
  const factions = doc.factions.map((f) => {
    if (f.id !== id) return f;
    const next: FactionDoc = { ...f, ...patch };
    if (next.mind === undefined || next.mind === '') delete next.mind;
    return next;
  });
  const to = patch.id;
  if (to === undefined || to === id) return { ...doc, factions };
  // A DECLARED `party` OR `monsters` IS A REFUSED STATE, NOT A FACTION
  // (§2, R4): either word in a `between` always means the reserved side, so
  // renaming the mistaken declaration away must not carry every disposition
  // toward that side off with it. The same holds for removal below.
  if (id === PARTY || id === MONSTERS) return { ...doc, factions };
  return {
    ...doc,
    factions,
    place: doc.place.map((p) => (p.faction === id ? { ...p, faction: to } : p)),
    dispositions: doc.dispositions.map((d) => {
      const follow = (name: string) => (name === id ? to : name);
      const next: DispositionDoc = {
        ...d,
        between: [follow(d.between[0]), follow(d.between[1])],
      };
      if (d.until !== undefined) {
        next.until = renamePredicateFaction(d.until, id, to);
      }
      return next;
    }),
    endings: doc.endings.map((e) =>
      e.when === undefined
        ? e
        : { ...e, when: renamePredicateFaction(e.when, id, to) }
    ),
  };
}

/** Remove a faction, and every line that pointed at it: its members go
 * back to `monsters` (the field is dropped, which is how `monsters` is
 * spelled), a disposition naming it in `between` goes with it, and an
 * `until` naming it in a `stance` predicate is dropped from its
 * disposition. Deleting a faction is not a way to author a dangling
 * reference the compiler refuses by name. */
export function removeFaction(doc: DungeonDoc, id: string): DungeonDoc {
  const factions = doc.factions.filter((f) => f.id !== id);
  // See `updateFaction`: a mistaken reserved-side declaration owns nothing.
  if (id === PARTY || id === MONSTERS) return { ...doc, factions };
  return {
    ...doc,
    factions,
    place: doc.place.map((p) => {
      if (p.faction !== id) return p;
      const next: PlacementDoc = { ...p };
      delete next.faction;
      return next;
    }),
    dispositions: doc.dispositions
      .filter((d) => !d.between.includes(id))
      .map((d) => {
        if (d.until === undefined || !predicateNamesFaction(d.until, id)) {
          return d;
        }
        const next: DispositionDoc = { ...d };
        delete next.until;
        return next;
      }),
  };
}

/** Declare a new disposition: the FIRST DECLARED FACTION against the
 * party, hostile, no `until` — the pair the hold-out is about, and the
 * only stance a predicate is legal with. There is nothing to declare one
 * about until a faction exists, so with none the document is returned
 * unchanged and the panel disables the verb and says why. */
export function addDisposition(doc: DungeonDoc): DungeonDoc {
  const first = doc.factions[0];
  if (!first) return doc;
  return {
    ...doc,
    dispositions: [
      ...doc.dispositions,
      { between: [first.id, PARTY], stance: 'hostile' },
    ],
  };
}

/** Patch one disposition by index. A STANCE THAT IS NO LONGER HOSTILE
 * DROPS ITS `until`: the predicate says when the hostility ends, so it has
 * nothing to say about a neutral or allied pair, and the panel hides the
 * editor the moment the stance changes — leaving the line in the file
 * would author the "`until` on a non-hostile stance" refusal on the
 * author's behalf. A hand-written file in that state still loads, and the
 * panel names the refusal at the stance field until someone touches it. */
export function updateDisposition(
  doc: DungeonDoc,
  index: number,
  patch: Partial<DispositionDoc>
): DungeonDoc {
  return {
    ...doc,
    dispositions: doc.dispositions.map((d, i) => {
      if (i !== index) return d;
      const next: DispositionDoc = { ...d, ...patch };
      if (next.until === undefined) delete next.until;
      if (patch.stance !== undefined && next.stance !== 'hostile') {
        delete next.until;
      }
      return next;
    }),
  };
}

export function removeDisposition(doc: DungeonDoc, index: number): DungeonDoc {
  return {
    ...doc,
    dispositions: doc.dispositions.filter((_, i) => i !== index),
  };
}

/** Declare a new ending with a suggested id and a predicate the author
 * can fire from the panel. `when` is REQUIRED, so one is chosen rather
 * than left blank: the first named monster's fall, which is the ending
 * every boss fight has; with no monster named, round 1 — an ending that
 * fires at once, visibly, until the author says otherwise. */
export function addEnding(doc: DungeonDoc): DungeonDoc {
  const first = namedMonsters(doc)[0];
  const when: PredicateDoc = first
    ? { down: first.id as string }
    : { round: 1 };
  return {
    ...doc,
    endings: [...doc.endings, { id: nextEndingId(doc), when }],
  };
}

function nextEndingId(doc: DungeonDoc): string {
  const taken = new Set(doc.endings.map((e) => e.id));
  let n = doc.endings.length + 1;
  while (taken.has(`ending-${n}`)) n += 1;
  return `ending-${n}`;
}

export function updateEnding(
  doc: DungeonDoc,
  index: number,
  patch: Partial<EndingDoc>
): DungeonDoc {
  return {
    ...doc,
    endings: doc.endings.map((e, i) => (i === index ? { ...e, ...patch } : e)),
  };
}

export function removeEnding(doc: DungeonDoc, index: number): DungeonDoc {
  return { ...doc, endings: doc.endings.filter((_, i) => i !== index) };
}

/** The monsters placed in one faction, by index — what a `mind` dropdown
 * offers and what "a faction of many" counts (§2). A prop carrying a
 * `faction` (a state the compiler refuses) is not a member. The reserved
 * `monsters` side's members are the monsters with NO faction key — that
 * is how the side is spelled — so a declared `monsters` faction can name
 * one of them as its mind. */
export function factionMembers(
  doc: DungeonDoc,
  factionId: string
): { index: number; placement: PlacementDoc }[] {
  const out: { index: number; placement: PlacementDoc }[] = [];
  const wanted = factionId === MONSTERS ? undefined : factionId;
  doc.place.forEach((placement, index) => {
    if (isMonsterRef(placement.ref) && placement.faction === wanted) {
      out.push({ index, placement });
    }
  });
  return out;
}

/** Every fact id some intel record reveals, sorted and deduplicated —
 * what a `{ fact }` predicate's dropdown offers. A fact is declared by
 * mention (§2: "fact ids are plain strings, declared by mention"), so this
 * is the set of facts a party can actually learn in this dungeon; an
 * `until` naming one outside it is legal and shown with its cost. */
export function revealedFacts(doc: DungeonDoc): string[] {
  const facts = new Set<string>();
  for (const record of doc.intel) {
    const fact = record.reveals.fact;
    if (fact !== undefined && fact !== '') facts.add(fact);
  }
  return [...facts].sort();
}

/** Every NAMED monster, by id, in document order — what a `{ down }`
 * predicate's dropdown offers. A monster with no id cannot be named by
 * anything, which is the same rule `holds` and the scenario form keep. */
export function namedMonsters(doc: DungeonDoc): PlacementDoc[] {
  return doc.place.filter((p) => !!p.id && isMonsterRef(p.ref));
}

/** Every placement id the file declares, in document order, with the index
 * that declared it — what the id field checks a rename against and what the
 * scenario form's `entity_ref` pickers list. A DUPLICATE KEEPS THE FIRST
 * (the same rule `floorOwners` follows); the builder refuses the second
 * before it is typed, and the compiler refuses it by name if a hand-written
 * file carries one anyway. */
export function placementIds(doc: DungeonDoc): Map<string, number> {
  const ids = new Map<string, number>();
  doc.place.forEach((p, i) => {
    if (p.id && !ids.has(p.id)) ids.set(p.id, i);
  });
  return ids;
}

/** A slug the author is OFFERED for a placement's id, from its ref's id —
 * `dnd5e:props:reliquary` suggests `reliquary`, and a multi-part id comes
 * through whole so `dnd5e:props:plushie:skeleton-dog` suggests
 * `plushie-skeleton-dog` rather than colliding with every other
 * `skeleton-dog` variant. Suffixed only
 * when that name is already taken, so the first reliquary is `reliquary`
 * and the second is `reliquary-2`. Never applied on its own: the panel
 * shows it and the author accepts or renames it (design: "the panel
 * suggests a slug from the ref, the author may rename"). */
export function suggestPlacementId(doc: DungeonDoc, ref: string): string {
  const base = refSlug(ref) ?? 'thing';
  const taken = placementIds(doc);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Drop a placement on a floor cell; one placement per cell — a drop
 * on an occupied cell replaces it. `blocks_*` are written explicitly for
 * props (prefilled by the caller from the catalog) and never for
 * monsters. `facing`/`offset` are copied through when the caller
 * supplies them (Copilot review, PR #795: silently dropping them here
 * would strand a caller that prefills a facing/offset at drop time),
 * REFUSED on monsters same as `blocks_*`. */
export function placeAt(doc: DungeonDoc, placement: PlacementDoc): DungeonDoc {
  // A PROP DROPS ON SCENERY, A MONSTER DOES NOT (design §2.4, F2): props
  // want floor, feet want standable floor. Refused in place — the same
  // doc back — so the caller shows the reason rather than the drop just
  // not happening.
  const room = isMonsterRef(placement.ref)
    ? isStandable(doc, placement.at)
    : isFloor(doc, placement.at);
  if (!room) return doc;
  const key = axialKey(placement.at);
  const clean: PlacementDoc = { ref: placement.ref, at: placement.at };
  if (placement.id !== undefined) clean.id = placement.id;
  if (isMonsterRef(placement.ref)) {
    if (placement.targeting) clean.targeting = placement.targeting;
    if (placement.boss) clean.boss = true;
  } else {
    clean.blocksMovement = placement.blocksMovement ?? false;
    clean.blocksLos = placement.blocksLos ?? false;
    if (placement.facing !== undefined) clean.facing = placement.facing;
    if (placement.offset !== undefined) clean.offset = placement.offset;
  }
  return {
    ...doc,
    place: [...doc.place.filter((p) => axialKey(p.at) !== key), clean],
  };
}

export function removePlacement(doc: DungeonDoc, index: number): DungeonDoc {
  return { ...doc, place: doc.place.filter((_, i) => i !== index) };
}

/** Move one placement without replacing another or changing its identity. */
export function movePlacement(
  doc: DungeonDoc,
  index: number,
  at: Axial
): DungeonDoc {
  const placement = doc.place[index];
  if (!placement) return doc;
  const allowed = isMonsterRef(placement.ref)
    ? isStandable(doc, at)
    : isFloor(doc, at);
  if (!allowed) return doc;
  const target = axialKey(at);
  if (
    doc.place.some((candidate, candidateIndex) =>
      candidateIndex === index ? false : axialKey(candidate.at) === target
    )
  ) {
    return doc;
  }
  if (axialKey(placement.at) === target) return doc;
  return {
    ...doc,
    place: doc.place.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...candidate, at } : candidate
    ),
  };
}

export function updatePlacement(
  doc: DungeonDoc,
  index: number,
  patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>
): DungeonDoc {
  return {
    ...doc,
    place: doc.place.map((p, i) => {
      if (i !== index) return p;
      const next: PlacementDoc = { ...p, ...patch };
      if (next.boss === false) delete next.boss;
      if (next.targeting === '') delete next.targeting;
      if (next.facing === undefined) delete next.facing;
      if (next.offset === undefined) delete next.offset;
      if (next.id === '' || next.id === undefined) delete next.id;
      if (next.holdable !== true) delete next.holdable;
      // AN EMPTY FACTION IS `monsters`, and `monsters` is spelled by
      // absence (R4): the panel's "(monsters)" choice clears the field
      // rather than writing the reserved name into the file.
      if (next.faction === '' || next.faction === undefined) {
        delete next.faction;
      }
      if (next.arrives === undefined) delete next.arrives;
      // Same REFUSED-on-monsters rule placeAt enforces at creation
      // (Copilot review, PR #795): updatePlacement is the OTHER way a
      // facing/offset patch reaches a placement, so it needs the same
      // guard or a monster could pick one up post-creation.
      if (isMonsterRef(next.ref)) {
        delete next.facing;
        delete next.offset;
        // A PROP HOLDS NOTHING AND A MONSTER IS NOT PICKED UP — the two
        // halves of the server's own rule (dungeonspec `validate.go`),
        // enforced on this write path for `facing`/`offset`'s reason: the
        // panel is not the only thing that can send a patch.
        delete next.holdable;
      } else {
        // A PROP HAS NO SIDE — `faction` is monsters only (§2), and this
        // is the write path that keeps a prop from being given one.
        delete next.faction;
      }
      // NIL, NOT LEN 0 (`PlacementDoc.holds`): an empty list is a state
      // this module can represent, so a caller that means "holds nothing"
      // clears the field rather than writing `holds: []`. The panel's
      // last-box-unticked path takes exactly this.
      if (next.holds !== undefined && next.holds.length === 0) {
        delete next.holds;
      }
      return next;
    }),
  };
}

export function addRegion(doc: DungeonDoc): DungeonDoc {
  const taken = new Set(doc.regions.map((r) => r.id));
  let n = doc.regions.length + 1;
  while (taken.has(`region-${n}`)) n += 1;
  return {
    ...doc,
    regions: [
      ...doc.regions,
      {
        id: `region-${n}`,
        name: `Region ${n}`,
        archetype: 'crypt',
        lighting: { intensity: 0.6 },
        cells: [],
      },
    ],
  };
}

export function removeRegion(doc: DungeonDoc, regionId: string): DungeonDoc {
  const region = doc.regions.find((r) => r.id === regionId);
  if (!region) return doc;
  let next = doc;
  for (const cell of region.cells) next = eraseCell(next, cell);
  return { ...next, regions: next.regions.filter((r) => r.id !== regionId) };
}

export function updateRegion(
  doc: DungeonDoc,
  regionId: string,
  patch: Partial<
    Pick<RegionDoc, 'id' | 'name' | 'archetype' | 'lighting' | 'concealed'>
  >
): DungeonDoc {
  return {
    ...doc,
    regions: doc.regions.map((r) => {
      if (r.id !== regionId) return r;
      const next: RegionDoc = { ...r, ...patch };
      if (!next.concealed) delete next.concealed;
      return next;
    }),
  };
}

/** Apply `deriveConcealment` to `doc`, ratcheted against `priorDerivedIds`
 * — the region ids THIS function itself set concealed last time it ran
 * (rpg-dnd5e-web#893). A region newly required goes to `concealed: true`;
 * a region no longer required comes back off ONLY when it is in
 * `priorDerivedIds` — concealment a person set by hand (never in that
 * set, because this function never put it there) is never touched, so
 * unmarking a door cannot silently strip a hand-authored secret. Returns
 * the SAME doc when nothing changed, same convention as every mutator
 * here. */
export function applyDerivedConcealment(
  doc: DungeonDoc,
  priorDerivedIds: ReadonlySet<string>
): { doc: DungeonDoc; derivedIds: Set<string> } {
  const { regionIds } = deriveConcealment(doc);
  if (regionIds === null) {
    return { doc, derivedIds: new Set(priorDerivedIds) };
  }
  let changed = false;
  const regions = doc.regions.map((r): RegionDoc => {
    if (regionIds.has(r.id)) {
      if (r.concealed) return r;
      changed = true;
      return { ...r, concealed: true };
    }
    if (r.concealed && priorDerivedIds.has(r.id)) {
      changed = true;
      const next: RegionDoc = { ...r };
      delete next.concealed;
      return next;
    }
    return r;
  });
  return {
    doc: changed ? { ...doc, regions } : doc,
    derivedIds: regionIds,
  };
}

export function updateDungeon(
  doc: DungeonDoc,
  patch: Partial<Pick<DungeonDoc, 'key' | 'name' | 'void'>>
): DungeonDoc {
  return { ...doc, ...patch };
}

// ---------------------------------------------------------------------------
// Server error paths → the thing on the canvas
// ---------------------------------------------------------------------------

/** What a `FieldError.path` points at, resolved against the emitted
 * order. `kind: 'document'` is a path the canvas has nothing to show for
 * (`key`, `version`, an unparseable path) — it is listed, not drawn. */
export type ErrorTarget =
  | { kind: 'cell'; cell: Axial }
  | { kind: 'wall'; index: number }
  | { kind: 'placement'; index: number; cell: Axial }
  | { kind: 'region'; regionId: string }
  | { kind: 'door'; doorId: string }
  | { kind: 'start' }
  | { kind: 'exit'; index: number }
  /** A refusal the compiler addressed to one blank on one scenario's form
   * (`scenarios.<id>.<key>`) — the form renders it under that blank, in the
   * words the rulebook wrote. */
  | { kind: 'scenario'; scenarioId: string; key: string }
  | { kind: 'document' };

export function resolveErrorPath(doc: DungeonDoc, path: string): ErrorTarget {
  const layout = emittedLayout(doc);
  if (path === 'start' || path.startsWith('start.')) return { kind: 'start' };

  let m = /^regions\[(\d+)\]\.cells\[(\d+)\]\[(\d+)\]/.exec(path);
  if (m) {
    const cell = layout.regions[+m[1]]?.rows[+m[2]]?.[+m[3]];
    return cell ? { kind: 'cell', cell } : { kind: 'document' };
  }
  // Scenery rows are addressed exactly like a region's cells — the whole
  // reason both use the same encoding — so a refusal naming a scenery
  // cell (design §2.5, and the C4 walk's own message) lands on the cell.
  m = /^scenery\[(\d+)\]\[(\d+)\]/.exec(path);
  if (m) {
    const cell = layout.scenery[+m[1]]?.[+m[2]];
    return cell ? { kind: 'cell', cell } : { kind: 'document' };
  }

  m = /^regions\[(\d+)\]/.exec(path);
  if (m) {
    const region = layout.regions[+m[1]]?.region;
    return region
      ? { kind: 'region', regionId: region.id }
      : { kind: 'document' };
  }
  // A wall's defect names the WALL, whichever field of it the compiler
  // faulted (`walls[3].start.offset`, `walls[3].height`) — a wall is one
  // line, so there is no smaller thing on the canvas to point at. The
  // path resolves to the wall's index in the EMITTED order, which is the
  // order the compiler read.
  m = /^walls\[(\d+)\]/.exec(path);
  if (m) {
    const index = doc.walls.indexOf(layout.walls[+m[1]]);
    return index === -1 ? { kind: 'document' } : { kind: 'wall', index };
  }
  m = /^doors\[(\d+)\]/.exec(path);
  if (m) {
    const door = layout.doors[+m[1]];
    return door ? { kind: 'door', doorId: door.id } : { kind: 'document' };
  }
  m = /^place\[(\d+)\]/.exec(path);
  if (m) {
    const placement = doc.place[+m[1]];
    return placement
      ? { kind: 'placement', index: +m[1], cell: placement.at }
      : { kind: 'document' };
  }
  m = /^exits\[(\d+)\]/.exec(path);
  if (m) {
    const index = doc.exits.indexOf(layout.exits[+m[1]]);
    return index === -1 ? { kind: 'document' } : { kind: 'exit', index };
  }
  // `scenarios.<id>.<key>` — the compiler's own spelling (dungeonspec
  // `validate.go`). A scenario id may carry hyphens and dots, so the key
  // is taken as everything after the LAST dot rather than by splitting on
  // the first: `scenarios.recover-the-artifact.artifact` names the key
  // `artifact`, not `the-artifact`.
  m = /^scenarios\.(.+)$/.exec(path);
  if (m) {
    const rest = m[1];
    const dot = rest.lastIndexOf('.');
    if (dot > 0) {
      const scenarioId = rest.slice(0, dot);
      const key = rest.slice(dot + 1);
      if (doc.scenarios[scenarioId]) {
        return { kind: 'scenario', scenarioId, key };
      }
    }
    return { kind: 'document' };
  }
  return { kind: 'document' };
}

/** Resolve the compiler's paths ONCE, so the board and the error list are
 * handed the same targets. */
export function resolveErrorTargets(
  doc: DungeonDoc,
  paths: string[]
): ErrorTarget[] {
  return paths.map((p) => resolveErrorPath(doc, p));
}
