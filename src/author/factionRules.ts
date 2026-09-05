/**
 * factionRules — the refusals the client can KNOW STATICALLY about
 * factions, dispositions and predicates, rendered inline at the field
 * each one names (rpg-project#375 §2, §7: "every refusal in §2 renders
 * inline at the field it names").
 *
 * This is the pure half of the Factions and Dispositions sections and of
 * the predicate editor, the way `scenarioForm.ts` is the pure half of the
 * scenario form. The compiler stays the validator of record and its
 * `FieldError`s still arrive path-addressed; what this module adds is the
 * same sentence BEFORE the file is saved, while the author is still
 * looking at the field — the streamer's north star, errors that point at
 * the thing. The one refusal §2 quotes is quoted here word for word
 * (`NAME_A_MIND`); the rest are §2's phrases written out for the
 * form-filler.
 *
 * Paths follow the compiler's own spelling for every other field
 * (`place[3].faction`, `dispositions[1].until`), so a server refusal and
 * a client one land on the same line.
 *
 * NOT REFUSED HERE, by design (R8): an `until: { fact }` no record
 * reveals. The dungeon allows it and shows the cost (`factNote`); the
 * SCENARIO refuses it — "a hold-out nobody can win" — and that is the
 * scenario tab's line to render, not this module's.
 */
import {
  factionMembers,
  isFloor,
  isMonsterRef,
  PARTY,
  revealedFacts,
  type DispositionDoc,
  type DungeonDoc,
  type PredicateDoc,
} from './dungeonYaml';

export interface Refusal {
  /** The field it names, in the compiler's spelling. */
  path: string;
  message: string;
}

/** §2's own sentence, word for word: a faction of many with an
 * `until: { fact }` and no mind has nobody to learn the fact. */
export const NAME_A_MIND = 'name a mind, or the faction cannot learn';

/** The note under a `{ fact }` nobody reveals — a COST, not a refusal
 * (R8): the dungeon allows it, and the author should know what they have
 * written before the scenario refuses it. */
export const NO_RECORD_REVEALS_THIS =
  'no record reveals this — nothing in the dungeon can teach it, so this would never hold';

/** Every faction a `between` (or a `stance` predicate) may name: the
 * declared ids, then `party`. NOT `monsters`: §7 lists the party as the
 * one reserved side the dropdowns offer, and whether the unauthored side
 * may be named in a disposition is a question the design has not
 * answered — a file that names it loads and is judged by the compiler. */
export function factionChoices(doc: DungeonDoc): string[] {
  // ONCE EACH. A mistaken `party` declaration (a refused state the file
  // can hold) must not list the party twice — the pickers key on the name.
  return [
    ...new Set([
      ...doc.factions.map((f) => f.id).filter((id) => id !== ''),
      PARTY,
    ]),
  ];
}

/** Whether a name is a side this dungeon has — declared, or the party. */
function isKnownFaction(doc: DungeonDoc, id: string): boolean {
  return id === PARTY || doc.factions.some((f) => f.id === id);
}

/** An unordered pair's key, for the one-per-pair rule. */
export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** The refusals one predicate earns on its own — what the editor renders
 * under its value, whichever field the predicate sits in. */
export function predicateRefusals(
  doc: DungeonDoc,
  p: PredicateDoc,
  path: string
): Refusal[] {
  const out: Refusal[] = [];
  if ('round' in p) {
    if (p.round < 1) out.push({ path, message: 'a round is counted from 1' });
    return out;
  }
  if ('down' in p) {
    if (p.down === '') {
      out.push({ path, message: 'pick the monster whose fall this waits for' });
    } else if (!doc.place.some((x) => x.id === p.down)) {
      out.push({
        path,
        message: `no placement is called "${p.down}" — a monster has to be named before its fall can be waited for`,
      });
    }
    return out;
  }
  if ('fact' in p) {
    if (p.fact === '') {
      out.push({
        path,
        message: 'name the fact — it is what an intel record reveals',
      });
    }
    return out;
  }
  for (const name of p.stance.between) {
    if (name === '') {
      out.push({ path, message: 'pick both factions' });
    } else if (!isKnownFaction(doc, name)) {
      out.push({
        path,
        message: `no faction is called "${name}" — the pair is two declared factions, or one and the party`,
      });
    }
  }
  return out;
}

/** The cost note for a `{ fact }` predicate, or `null` when some record
 * reveals the fact (or the field is blank, which is a refusal instead). */
export function factNote(doc: DungeonDoc, p: PredicateDoc): string | null {
  if (!('fact' in p) || p.fact === '') return null;
  return revealedFacts(doc).includes(p.fact) ? null : NO_RECORD_REVEALS_THIS;
}

/** Whether a disposition waits on a fact — the case that needs a mind. */
const waitsOnFact = (d: DispositionDoc): boolean =>
  d.until !== undefined && 'fact' in d.until;

/**
 * Every refusal the sections can know before the file is saved, in
 * document order: factions, then placements, then dispositions.
 */
export function factionRefusals(doc: DungeonDoc): Refusal[] {
  const out: Refusal[] = [];
  const seenIds = new Set<string>();

  doc.factions.forEach((f, i) => {
    const path = `factions[${i}]`;
    if (f.id.trim() === '') {
      out.push({
        path: `${path}.id`,
        message:
          "a faction needs a name — it is what a monster's `faction` and a disposition's `between` point at",
      });
    } else if (f.id === PARTY) {
      // §2: `party` MUST NOT be declared (reserved for the players' side).
      out.push({
        path: `${path}.id`,
        message:
          '`party` is the players’ side and is never declared — every dungeon has it without saying so; name the monsters’ side instead',
      });
    } else if (seenIds.has(f.id)) {
      out.push({
        path: `${path}.id`,
        message: `another faction is already called "${f.id}" — two cannot share a name, because a monster fights for exactly one`,
      });
    }
    seenIds.add(f.id);

    const members = factionMembers(doc, f.id);
    if (f.mind !== undefined) {
      const named = doc.place.find((p) => p.id === f.mind);
      if (!named) {
        out.push({
          path: `${path}.mind`,
          message: `no placement is called "${f.mind}" — a faction's mind is one of its own monsters`,
        });
      } else if (!members.some((m) => m.placement === named)) {
        // §2: a `mind` outside its faction.
        out.push({
          path: `${path}.mind`,
          message: `"${f.mind}" is not in ${f.id} — a mind is one of the faction's own monsters`,
        });
      }
    } else if (
      members.length > 1 &&
      doc.dispositions.some((d) => d.between.includes(f.id) && waitsOnFact(d))
    ) {
      // §2, word for word: a faction of many with an `until: { fact }` and
      // no mind. A faction of one has its member as mind and needs no line.
      out.push({ path: `${path}.mind`, message: NAME_A_MIND });
    }
  });

  doc.place.forEach((p, i) => {
    const path = `place[${i}]`;
    if (p.faction !== undefined) {
      if (!isMonsterRef(p.ref)) {
        out.push({
          path: `${path}.faction`,
          message: 'only a monster fights for a faction — a prop has no side',
        });
      } else if (!doc.factions.some((f) => f.id === p.faction)) {
        // §2: unknown faction on a placement.
        out.push({
          path: `${path}.faction`,
          message: `no faction is called "${p.faction}" — declare it under Factions on the dungeon panel, or pick one that exists`,
        });
      }
    }
    if (p.arrives !== undefined) {
      out.push(...predicateRefusals(doc, p.arrives, `${path}.arrives`));
      // §2: `arrives.at` not floor — the cell it lands on when it arrives.
      if (!isFloor(doc, p.at)) {
        out.push({
          path: `${path}.arrives`,
          message: 'the cell it arrives on must be floor',
        });
      }
    }
  });

  const seenPairs = new Set<string>();
  doc.dispositions.forEach((d, i) => {
    const path = `dispositions[${i}]`;
    const [a, b] = d.between;
    for (const name of [a, b]) {
      if (name === '') {
        out.push({ path: `${path}.between`, message: 'pick both factions' });
      } else if (!isKnownFaction(doc, name)) {
        out.push({
          path: `${path}.between`,
          message: `no faction is called "${name}" — the pair is two declared factions, or one and the party`,
        });
      }
    }
    // §2: one disposition per pair, the pair being unordered.
    const key = pairKey(a, b);
    if (a !== '' && b !== '' && seenPairs.has(key)) {
      out.push({
        path: `${path}.between`,
        message: `${a} and ${b} already have a disposition above — one per pair`,
      });
    }
    seenPairs.add(key);
    if (d.until !== undefined) {
      if (d.stance !== 'hostile') {
        // §2: `until` on a non-hostile stance.
        out.push({
          path: `${path}.stance`,
          message:
            '`until` says when the hostility ends, so it only goes with hostile — an allied or neutral pair has nothing to wait for',
        });
      }
      out.push(...predicateRefusals(doc, d.until, `${path}.until`));
    }
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
