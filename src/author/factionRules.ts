/**
 * factionRules — the refusals the client can KNOW STATICALLY about
 * factions, dispositions, arrivals, endings and predicates, rendered inline
 * at the field each one names (rpg-project#375 §2, §7: "every refusal in §2
 * renders inline at the field it names").
 *
 * This is the pure half of the Factions, Dispositions and Endings sections,
 * of the placement panel's faction and arrives controls, and of the
 * predicate editor — the way `scenarioForm.ts` is the pure half of the
 * scenario form. The compiler stays the validator of record and its
 * `FieldError`s still arrive path-addressed; what this module adds is the
 * same sentence BEFORE the file is saved, while the author is still
 * looking at the field.
 *
 * THE COMPILER'S OWN SENTENCES AND PATHS, WORD FOR WORD (toolkit
 * dungeonspec `factions.go`, `predicate.go`, `validate.go` on
 * encounter/hold-out at baea481d): a refusal a streamer meets twice — once
 * here while typing, once from the server on save — must read the same both
 * times, or the two look like two different problems (`refusePairForm`'s
 * rule in `dungeonYaml.ts`). `messagesAt` then shows the two copies as one
 * line. The one client-only sentence is the short hint at a faction's mind
 * field (`NAME_A_MIND`, the design's own words) pointing at the fix the
 * compiler's longer sentence at the `until` asks for.
 *
 * NOT REFUSED HERE, by design (R8): an `until: { fact }` no record
 * reveals. The dungeon allows it and shows the cost (`factNote`); the
 * SCENARIO refuses it — "a hold-out nobody can win" — and that is the
 * scenario's line to render. Nor is liveness (a stance nothing can reach,
 * a ring of arrivals): the compiler folds the world for those, and its
 * sentences land here through the same `messagesAt`.
 */
import {
  factionMembers,
  isMonsterRef,
  MONSTERS,
  PARTY,
  PREDICATE_SHAPE,
  revealedFacts,
  type DispositionDoc,
  type DungeonDoc,
  type PlacementDoc,
  type PredicateDoc,
} from './dungeonYaml';

export interface Refusal {
  /** The field it names, in the compiler's spelling. */
  path: string;
  message: string;
}

/** A path-addressed refusal from the compiler (`FieldError`'s shape) —
 * kept structural so this module never imports the wire. */
export interface PathMessage {
  path: string;
  message: string;
}

/** §2's own sentence, word for word — the client's short hint at a
 * faction's mind field. The compiler says the same thing at the
 * disposition's `until`, composed with why (`cannotLearn`). */
export const NAME_A_MIND = 'name a mind, or the faction cannot learn';

/** The note under a `{ fact }` nobody reveals — a COST, not a refusal
 * (R8): the dungeon allows it, and the author should know what they have
 * written before the scenario refuses it. Client-only. */
export const NO_RECORD_REVEALS_THIS =
  'no record reveals this — nothing in the dungeon can teach it, so this would never hold';

/** The compiler's word for an `until` that is not a fact (R11): only a
 * journal fact turns a pair in this version. */
export const UNTIL_NOT_BUILT =
  'in this version a disposition turns only on a fact; `until` on a round, a fall, or another stance is not built yet';

/** The compiler's reason for the reserved side waiting on a fact while
 * nothing declares it — one of the `cannotLearn` reasons, exported because
 * the panel test names it. */
export const MONSTERS_HAS_NO_MIND =
  'faction "monsters" is not declared, so it has no mind — declare it under `factions:` to give it one';

/** Go's `%q` for the ids and refs these sentences quote. */
const q = (s: string): string => JSON.stringify(s);

/** Every faction a `between` (or a `stance` predicate) may name: the
 * declared ids, then the two reserved sides. `monsters` IS a real faction
 * — the one every unauthored monster is on (ruling 2026-09-05): a DM may
 * write `between: [monsters, party], stance: neutral` to make the
 * unauthored monsters stand down, and may DECLARE it under `factions[]`
 * to give that side a mind. `party` is nameable here and never declared. */
export function factionChoices(doc: DungeonDoc): string[] {
  // ONCE EACH. A mistaken `party` declaration (a refused state the file
  // can hold) must not list the side twice — the pickers key on the name.
  return [
    ...new Set([
      ...doc.factions.map((f) => f.id).filter((id) => id !== ''),
      PARTY,
      MONSTERS,
    ]),
  ];
}

/** Whether a name is a side this dungeon has — declared, or reserved. */
function isKnownFaction(doc: DungeonDoc, id: string): boolean {
  return (
    id === PARTY || id === MONSTERS || doc.factions.some((f) => f.id === id)
  );
}

/** An unordered pair's key, for the one-per-pair rule — the compiler's
 * `normalizedPair`, the two names in sorted order. */
export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** The side a placement is on: its `faction`, or `monsters` when it names
 * none — the compiler's `placementFaction`. */
function placementFaction(p: PlacementDoc): string {
  return p.faction ?? MONSTERS;
}

/** A form the author has picked and not filled in — `{ down: }` while the
 * monster dropdown sits on "(pick a monster)", `{ fact: }` with the box
 * empty. The compiler refuses that state at the DECODE, in these words
 * (`PredicateSpec.UnmarshalYAML`); the client says the same sentence at the
 * control the author is looking at, rather than reading the blank back as a
 * name nothing has ("\"\" is not a placement in this dungeon"). */
const saysNothing = (form: 'down' | 'fact'): string =>
  `this predicate's \`${form}\` says nothing — ${PREDICATE_SHAPE}`;

/** Every path a predicate's refusals can land on, for `messagesAt`: the
 * predicate itself and the compiler's sub-paths. */
export function predicatePaths(base: string): string[] {
  return [
    base,
    `${base}.round`,
    `${base}.down`,
    `${base}.fact`,
    `${base}.stance`,
    `${base}.stance.between`,
    `${base}.stance.between[0]`,
    `${base}.stance.between[1]`,
    `${base}.stance.is`,
  ];
}

/** The refusals one predicate earns on its own, at the compiler's sub-paths
 * — what the editor renders under its value, whichever field the predicate
 * sits in. */
export function predicateRefusals(
  doc: DungeonDoc,
  p: PredicateDoc,
  path: string
): Refusal[] {
  const out: Refusal[] = [];
  if ('round' in p) {
    if (p.round < 1) {
      out.push({
        path: `${path}.round`,
        message: `round ${p.round}: a round is counted from 1`,
      });
    }
    return out;
  }
  if ('down' in p) {
    if (p.down === '') {
      out.push({ path: `${path}.down`, message: saysNothing('down') });
      return out;
    }
    const target = doc.place.find((x) => x.id === p.down);
    if (!target) {
      out.push({
        path: `${path}.down`,
        message: `${q(p.down)} is not a placement in this dungeon`,
      });
    } else if (!isMonsterRef(target.ref)) {
      out.push({
        path: `${path}.down`,
        message: `${q(p.down)} is a prop, and only a monster can be down`,
      });
    }
    return out;
  }
  if ('fact' in p) {
    if (p.fact === '') {
      out.push({ path: `${path}.fact`, message: saysNothing('fact') });
    }
    return out;
  }
  const [a, b] = p.stance.between;
  let ok = true;
  p.stance.between.forEach((name, j) => {
    const bp = `${path}.stance.between[${j}]`;
    if (name === '') {
      out.push({ path: bp, message: 'the stance does not say which faction' });
      ok = false;
    } else if (!isKnownFaction(doc, name)) {
      out.push({
        path: bp,
        message: `${q(name)} is not a faction in this dungeon — declare it under \`factions:\`, or write \`party\``,
      });
      ok = false;
    }
  });
  if (ok && a === b) {
    out.push({
      path: `${path}.stance.between`,
      message: `a stance is between two different factions, and this one names ${q(a)} twice`,
    });
  }
  return out;
}

/** The cost note for a `{ fact }` predicate, or `null` when some record
 * reveals the fact (or the field is blank, which is a refusal instead). */
export function factNote(doc: DungeonDoc, p: PredicateDoc): string | null {
  if (!('fact' in p) || p.fact === '') return null;
  return revealedFacts(doc).includes(p.fact) ? null : NO_RECORD_REVEALS_THIS;
}

/** Whether a declared faction's mind passes the mind checks — the
 * compiler's `mindValid`. */
function mindValid(doc: DungeonDoc, id: string): boolean {
  const faction = doc.factions.find((f) => f.id === id);
  if (!faction || faction.mind === undefined) return false;
  const mind = doc.place.find((p) => p.id === faction.mind);
  return (
    mind !== undefined &&
    isMonsterRef(mind.ref) &&
    placementFaction(mind) === id
  );
}

/** Why a side cannot come to know a fact, or `''` when it can — the
 * compiler's `cannotLearn`, sentence for sentence. */
function cannotLearn(doc: DungeonDoc, id: string): string {
  if (id === PARTY) return "`party` is the players' side and has no mind";
  if (mindValid(doc, id)) return '';
  if (!doc.factions.some((f) => f.id === id)) {
    return `faction ${q(id)} is not declared, so it has no mind — declare it under \`factions:\` to give it one`;
  }
  const members = factionMembers(doc, id);
  switch (members.length) {
    case 1:
      return members[0].placement.id
        ? ''
        : `faction ${q(id)}'s one monster has no id to be its mind`;
    case 0:
      return `faction ${q(id)} has nobody in it`;
    default:
      return `faction ${q(id)} has ${members.length} monsters and no mind`;
  }
}

/** The compiler's `requireALearner`: a fact-until between two factions
 * needs one of them able to come to know the fact. */
function requireALearner(
  doc: DungeonDoc,
  path: string,
  pair: readonly [string, string]
): Refusal | null {
  const reasons: string[] = [];
  for (const id of pair) {
    const why = cannotLearn(doc, id);
    if (why === '') return null;
    reasons.push(why);
  }
  return {
    path,
    message: `this until waits for a fact, and ${reasons.join(', and ')} — ${NAME_A_MIND}`,
  };
}

/** Whether a disposition waits on a fact — the case that needs a mind. */
const waitsOnFact = (d: DispositionDoc): boolean =>
  d.until !== undefined && 'fact' in d.until;

/**
 * Every refusal the sections can know before the file is saved, in
 * document order: factions, then placements, then dispositions, then
 * endings — the compiler's own order.
 */
export function factionRefusals(doc: DungeonDoc): Refusal[] {
  const out: Refusal[] = [];
  const seenIds = new Map<string, number>();

  doc.factions.forEach((f, i) => {
    const path = `factions[${i}]`;
    if (f.id.trim() === '') {
      out.push({ path: `${path}.id`, message: 'the faction has no id' });
    } else if (f.id === PARTY) {
      out.push({
        path: `${path}.id`,
        message:
          "`party` is the players' side and is never declared — name the faction the monsters are in",
      });
    } else if (seenIds.has(f.id)) {
      out.push({
        path: `${path}.id`,
        message: `faction ${q(f.id)} is already declared at factions[${seenIds.get(f.id)}]`,
      });
    } else {
      seenIds.set(f.id, i);
    }

    if (f.mind !== undefined) {
      const named = doc.place.find((p) => p.id === f.mind);
      if (!named) {
        out.push({
          path: `${path}.mind`,
          message: `faction ${q(f.id)} names ${q(f.mind)} as its mind, and no placement in this dungeon has that id`,
        });
      } else if (!isMonsterRef(named.ref)) {
        out.push({
          path: `${path}.mind`,
          message: `faction ${q(f.id)} names ${q(f.mind)} as its mind, and ${q(named.ref)} is a prop — a mind is a monster in the faction`,
        });
      } else if (placementFaction(named) !== f.id) {
        out.push({
          path: `${path}.mind`,
          message: `faction ${q(f.id)} names ${q(f.mind)} as its mind, but ${q(named.ref)} is in faction ${q(placementFaction(named))} — a mind is a monster in its own faction`,
        });
      }
    } else if (
      factionMembers(doc, f.id).length > 1 &&
      doc.dispositions.some((d) => d.between.includes(f.id) && waitsOnFact(d))
    ) {
      // The design's own sentence, at the field where the fix is made. The
      // compiler says why at the disposition's `until`, below.
      out.push({ path: `${path}.mind`, message: NAME_A_MIND });
    }
  });

  doc.place.forEach((p, i) => {
    const path = `place[${i}]`;
    if (p.faction !== undefined) {
      if (!isMonsterRef(p.ref)) {
        out.push({
          path: `${path}.faction`,
          message: `${q(p.ref)} is not a monster and cannot be in a faction`,
        });
      } else if (p.faction === PARTY) {
        out.push({
          path: `${path}.faction`,
          message: `${q(p.ref)} cannot be in \`party\`: that is the players' side`,
        });
      } else if (
        p.faction !== MONSTERS &&
        !doc.factions.some((f) => f.id === p.faction)
      ) {
        out.push({
          path: `${path}.faction`,
          message: `${q(p.ref)} is in faction ${q(p.faction)}, and no faction in this dungeon has that id — declare it under \`factions:\``,
        });
      }
    }
    // A thing that can be picked up, or that arrives, has to be nameable:
    // the beat and the arrival both name it by id.
    if (!p.id) {
      if (p.holdable) {
        out.push({
          path: `${path}.id`,
          message: `${q(p.ref)} is holdable and has no id, and a thing that can be picked up has to be nameable`,
        });
      }
      if (p.arrives !== undefined) {
        out.push({
          path: `${path}.id`,
          message: `${q(p.ref)} arrives on a predicate and has no id, and a thing that arrives has to be nameable`,
        });
      }
    }
    if (p.arrives !== undefined) {
      out.push(...predicateRefusals(doc, p.arrives, `${path}.arrives`));
      if ('down' in p.arrives && p.id && p.arrives.down === p.id) {
        out.push({
          path: `${path}.arrives.down`,
          message: `${q(p.id)} cannot wait for its own fall — it is not here to fall until it arrives`,
        });
      }
    }
  });

  const seenPairs = new Map<string, number>();
  doc.dispositions.forEach((d, i) => {
    const path = `dispositions[${i}]`;
    const [a, b] = d.between;
    let ok = true;
    d.between.forEach((name, j) => {
      const bp = `${path}.between[${j}]`;
      if (name === '') {
        out.push({
          path: bp,
          message: 'the disposition does not say which faction',
        });
        ok = false;
      } else if (!isKnownFaction(doc, name)) {
        out.push({
          path: bp,
          message: `${q(name)} is not a faction in this dungeon — declare it under \`factions:\`, or write \`party\``,
        });
        ok = false;
      }
    });
    if (ok && a === b) {
      out.push({
        path: `${path}.between`,
        message: `a disposition is between two different factions, and this one names ${q(a)} twice`,
      });
      ok = false;
    }
    const key = pairKey(a, b);
    const [k0, k1] = a <= b ? [a, b] : [b, a];
    if (ok) {
      const prev = seenPairs.get(key);
      if (prev !== undefined) {
        out.push({
          path: `${path}.between`,
          message: `${k0} and ${k1} already have a disposition at dispositions[${prev}], and one pair has one`,
        });
        ok = false;
      } else {
        seenPairs.set(key, i);
      }
    }
    if (d.until === undefined) return;
    if (d.stance !== 'hostile') {
      out.push({
        path: `${path}.until`,
        message: `only a hostile pair has something to stop doing: this pair is ${d.stance}, so drop the until or make it hostile`,
      });
      return;
    }
    if (!ok) return;
    if (!('fact' in d.until)) {
      out.push({ path: `${path}.until`, message: UNTIL_NOT_BUILT });
      return;
    }
    out.push(...predicateRefusals(doc, d.until, `${path}.until`));
    const learner = requireALearner(doc, `${path}.until`, [k0, k1]);
    if (learner) out.push(learner);
  });

  const seenEndings = new Map<string, number>();
  doc.endings.forEach((e, i) => {
    const path = `endings[${i}]`;
    if (e.id.trim() === '') {
      out.push({ path: `${path}.id`, message: 'the ending has no id' });
    } else if (seenEndings.has(e.id)) {
      out.push({
        path: `${path}.id`,
        message: `ending ${q(e.id)} is already declared at endings[${seenEndings.get(e.id)}]`,
      });
    } else {
      seenEndings.set(e.id, i);
    }
    out.push(...predicateRefusals(doc, e.when, `${path}.when`));
  });

  return out;
}

/** The messages addressed to one path, in order. */
export function refusalsAt(
  refusals: readonly Refusal[],
  path: string
): string[] {
  return refusals.filter((r) => r.path === path).map((r) => r.message);
}

/** Everything addressed to any of `paths`: the client's own refusals first,
 * then the compiler's, ONCE EACH — the same sentence arriving from both
 * sides renders one line, not two. */
export function messagesAt(
  refusals: readonly Refusal[],
  errors: readonly PathMessage[],
  ...paths: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (message: string) => {
    if (seen.has(message)) return;
    seen.add(message);
    out.push(message);
  };
  for (const path of paths) {
    for (const message of refusalsAt(refusals, path)) push(message);
  }
  for (const path of paths) {
    for (const e of errors) if (e.path === path) push(e.message);
  }
  return out;
}
