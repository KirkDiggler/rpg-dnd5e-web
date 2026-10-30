/**
 * READ IT BACK: a placed creature's or prop's configuration as prose,
 * rendered from the draft alone (rpg-project#576, R5; B1–B3, B6–B8).
 *
 * WHAT IT REFUSES TO DO (the walkthrough's refusals). It never rolls, never
 * simulates, never guesses what the kind's default table holds, and never
 * says a law the engine does not enforce: every law sentence is
 * `ENGINE_LAWS`', each with its toolkit source. A value absent from the
 * document is said to be absent.
 *
 * THE ORDERS ARE THE COMPILER'S LAYERS (`layeredOrders`), so the hazard of
 * reading one layer as the answer cannot happen here: a creature whose
 * faction names a table reads that table.
 *
 * ONE VOCABULARY. Conditions, words and triggers are `answerVocabulary`'s
 * phrases with the subject "it" — the row editor's own words about the
 * creature it describes.
 */
import { ANSWER_TRIGGER_KEYS } from '@/author/answerVocabulary';
import { actionAugmentSentences } from './actionAugments';
import type { AnswerEntryShape, OptionShape } from './answerTableShape';
import {
  abilityPhrase,
  joinAnd,
  triggerPhrase,
  whenPhrase,
  wordPhrase,
} from './answerVocabulary';
import { castMemberOf } from './cast';
import { ENGINE_LAWS, type EngineLawId } from './engineLaws';
import { walkFacts } from './factWalk';
import {
  layeredOrders,
  type OrdersLayer,
  type OrdersSource,
} from './layeredOrders';
import { documentPlacementNames } from './placementNames';
import { requiresId, requiresRead, requiresSentence } from './predicateNot';
import {
  dispositionSentence,
  possessive,
  predicateSentence,
  sideName,
} from './predicateSentence';
import type { RoomDraftDocument } from './roomDraft';
import type { SiteIntelRecord, SiteTemper } from './siteScope';

/** What a ref in a sentence selects or opens. */
export type ReadBackTarget =
  | { kind: 'table'; id: string }
  | { kind: 'faction'; id: string }
  | { kind: 'intel'; id: string }
  | { kind: 'fact'; id: string }
  | { kind: 'placement'; id: string };

/** A run of a sentence that names a thing: the text as it appears in the
 * sentence, and what it points at. */
export interface ReadBackRef {
  text: string;
  target: ReadBackTarget;
}

export interface ReadBackSentence {
  text: string;
  refs: readonly ReadBackRef[];
  /** The engine law this sentence states, when it states one. */
  law?: EngineLawId;
}

export interface ReadBackParagraph {
  heading: 'who' | 'on-its-time' | 'spoken-to' | 'knows';
  /** The words that lead the paragraph, bold: a prefix of its first
   * sentence. */
  lead: string;
  sentences: readonly ReadBackSentence[];
  /** One bullet each, after the sentences: the options. */
  items?: readonly ReadBackSentence[];
}

type Selection = { kind: 'creature' | 'prop'; id: string };

const factRef = (id: string): ReadBackRef => ({
  text: id,
  target: { kind: 'fact', id },
});

const sentence = (
  text: string,
  refs: readonly ReadBackRef[] = [],
  law?: EngineLawId
): ReadBackSentence => (law ? { text, refs, law } : { text, refs });

const lawSentence = (id: EngineLawId): ReadBackSentence =>
  sentence(ENGINE_LAWS[id].sentence, [], id);

const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** Every fact id a predicate, a condition list or a row names, as refs. */
function factRefsIn(text: string, facts: Iterable<string>): ReadBackRef[] {
  const refs: ReadBackRef[] = [];
  for (const fact of new Set(facts))
    if (text.includes(fact)) refs.push(factRef(fact));
  return refs;
}

/** The facts a row's `when` reads and its word writes. */
function rowFacts(row: AnswerEntryShape): string[] {
  const facts: string[] = [];
  walkFacts(row.when, (fact) => facts.push(fact));
  if (row.fact !== undefined) facts.push(row.fact);
  return facts;
}

/** One table row as a sentence: "If <when>, it <word>, saying “…” (weight
 * n)." */
function rowSentence(row: AnswerEntryShape): ReadBackSentence {
  const when = whenPhrase(row.when, 'it');
  const word = wordPhrase(row, 'it', 'time');
  const say = row.say !== undefined ? `“${row.say}”` : undefined;
  const does =
    word !== undefined && say !== undefined
      ? `it says ${say} and ${word}`
      : word !== undefined
        ? `it ${word}`
        : `it says ${say ?? '""'}`;
  const text = `${when !== undefined ? `If ${when}, ${does}` : `At any time, ${does}`} (weight ${row.weight ?? 1}).`;
  return sentence(text, factRefsIn(text, rowFacts(row)));
}

function sourceSentence(trigger: string, layer: OrdersLayer): ReadBackSentence {
  const lead = triggerPhrase(trigger);
  const shared =
    layer.sharedWith.length > 0
      ? `, shared with ${joinAnd(layer.sharedWith)}`
      : '';
  const source = layer.source;
  switch (source.kind) {
    case 'table':
      return sentence(`${lead} it follows ${source.id}${shared}.`, [
        { text: source.id, target: { kind: 'table', id: source.id } },
      ]);
    case 'faction-table':
      return sentence(
        `${lead} it follows ${source.id}, named by ${sideName(source.faction)}${shared}.`,
        [
          { text: source.id, target: { kind: 'table', id: source.id } },
          {
            text: sideName(source.faction),
            target: { kind: 'faction', id: source.faction },
          },
        ]
      );
    case 'faction':
      return sentence(
        `${lead} it follows ${possessive(sideName(source.id))} own rows${shared}.`,
        [
          {
            text: sideName(source.id),
            target: { kind: 'faction', id: source.id },
          },
        ]
      );
    case 'own':
      return sentence(`${lead} it follows its own rows.`);
    case 'kind-default':
      return sentence(
        `${lead} it answers with the kind’s default: no table and no rows are named by it or its faction.`
      );
  }
}

/** The orders paragraph: per trigger, its source, the weight law, its rows
 * heaviest first, what it replaces, and the holds law on `time`. */
function ordersParagraph(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): ReadBackParagraph {
  const layers = layeredOrders(document, placementId);
  const sentences: ReadBackSentence[] = [];
  for (const trigger of ANSWER_TRIGGER_KEYS) {
    const layer = layers[trigger];
    sentences.push(sourceSentence(trigger, layer));
    if (layer.source.kind === 'kind-default') continue;
    const weights = new Set(layer.rows.map((row) => row.weight ?? 1));
    sentences.push(
      weights.size <= 1
        ? sentence('Every row is weighted alike.')
        : lawSentence('weights')
    );
    for (const row of layer.rows) sentences.push(rowSentence(row));
    const named =
      layer.source.kind === 'table' || layer.source.kind === 'faction-table'
        ? layer.source.id
        : layer.source.kind === 'faction'
          ? capitalized(`${possessive(sideName(layer.source.id))} rows`)
          : 'Its own rows';
    // EVERY LAYER IT REPLACES, nearest first, then the kind's default: a
    // creature's own rows also silence the table it names and its faction's.
    const replaced = layer.shadowed.map((source) =>
      shadowedPhrase(source, trigger)
    );
    const refs: ReadBackRef[] = [];
    for (const source of [layer.source, ...layer.shadowed]) {
      if (source.kind === 'table' || source.kind === 'faction-table')
        refs.push({
          text: source.id,
          target: { kind: 'table', id: source.id },
        });
    }
    sentences.push(
      sentence(
        `${named} ${named.endsWith('rows') ? 'name' : 'names'} ${trigger}, so ${joinAnd([...replaced, `the kind’s default ${trigger} rows`])} do not apply.`,
        refs
      )
    );
    if (trigger === 'time') sentences.push(lawSentence('holds'));
  }
  return { heading: 'on-its-time', lead: 'On its time', sentences };
}

/** A layer that does not apply, as a noun phrase. */
function shadowedPhrase(source: OrdersSource, trigger: string): string {
  switch (source.kind) {
    case 'table':
      return `${source.id}’s ${trigger} rows`;
    case 'faction-table':
      return `${source.id}’s ${trigger} rows, named by ${sideName(source.faction)}`;
    case 'faction':
      return `${possessive(sideName(source.id))} own ${trigger} rows`;
    default:
      return `its own ${trigger} rows`;
  }
}

function temperText(temper: SiteTemper): string {
  if (typeof temper === 'string') return temper;
  return Object.entries(temper)
    .map(([word, share]) => `${word} ${share}`)
    .join(', ');
}

/** Who it is, whose side it is on, how that side stands, the provocation
 * law, its temper, and its arrival. */
function whoParagraph(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): ReadBackParagraph {
  const names = documentPlacementNames(document);
  const name = names.get(placementId) ?? placementId;
  const monster = document.draft.room.monsterDeclarations.find(
    (m) => m.id === placementId
  );
  const cast = monster ? castMemberOf(document, monster.ref)?.name : undefined;
  const binding = document.draft.room.monsterBindings?.[placementId];
  const factionId = binding?.faction;
  const faction = (document.scope.factions ?? []).find(
    (f) => f.id === factionId
  );
  const sentences: ReadBackSentence[] = [];
  const kind = cast ? `a ${cast}` : 'a creature';
  if (factionId === undefined) {
    sentences.push(
      sentence(`${name}, ${kind}, with the monsters: it names no faction.`)
    );
  } else {
    const side = sideName(factionId);
    const mind = faction?.mind === placementId;
    const text = `${name}, ${kind} of ${side}${mind ? `, and ${possessive(side)} mind` : ''}.`;
    sentences.push(
      sentence(text, [
        { text: side, target: { kind: 'faction', id: factionId } },
      ])
    );
    if (faction === undefined)
      sentences.push(
        sentence(`This document declares no faction “${factionId}”.`)
      );
    const dispositions = (document.scope.dispositions ?? []).filter((d) =>
      d.between.includes(factionId)
    );
    for (const d of dispositions) {
      const text = dispositionSentence(d, factionId, document);
      sentences.push(
        sentence(
          text,
          d.until !== undefined && 'fact' in d.until
            ? [factRef(d.until.fact)]
            : [],
          d.until !== undefined && 'fact' in d.until ? 'untilOnMind' : undefined
        )
      );
    }
    if (dispositions.length === 0)
      sentences.push(sentence(`No disposition names ${side}.`));
  }
  sentences.push(lawSentence('provocation'));
  if (binding?.temper !== undefined)
    sentences.push(
      sentence(
        `Its temper is ${binding.temper}, its own word; no mix is dealt for it.`
      )
    );
  else if (faction?.temper !== undefined)
    sentences.push(
      typeof faction.temper === 'string'
        ? sentence(
            `Its temper is ${faction.temper}, ${possessive(sideName(faction.id))} word.`
          )
        : sentence(
            `Its temper is dealt at spawn from ${possessive(sideName(faction.id))} mix: ${temperText(faction.temper)}.`,
            [],
            'temperAtSpawn'
          )
    );
  else sentences.push(sentence('No temper is authored: it is a soldier.'));
  if (binding?.arrives !== undefined) {
    const text = `It is held in reserve until ${predicateSentence(binding.arrives, { names })}.`;
    sentences.push(
      sentence(
        text,
        'fact' in binding.arrives ? [factRef(binding.arrives.fact)] : []
      )
    );
  }
  return { heading: 'who', lead: sentences[0].text, sentences };
}

/** The who paragraph with what it fights with appended, when a layer authors
 * an add or a drop (rpg-project#721): "carries a javelin the kind does not",
 * "does not carry a longsword", then the list in the session's order. */
function withActionAugments(
  who: ReadBackParagraph,
  document: Readonly<RoomDraftDocument>,
  placementId: string
): ReadBackParagraph {
  const extra = actionAugmentSentences(document, placementId).map((line) =>
    line.law ? lawSentence(line.law) : sentence(line.text)
  );
  return extra.length
    ? { ...who, sentences: [...who.sentences, ...extra] }
    : who;
}

/** A full stop, unless the text already ends a quoted sentence. */
function endSentence(text: string): string {
  return /[.!?…]”$/.test(text) ? text : `${text}.`;
}

function propName(document: Readonly<RoomDraftDocument>, id: string): string {
  const label = document.draft.scene.items.find((i) => i.id === id)?.label;
  return label?.trim() ? label : id;
}

/** One verdict's rows: “line”, and the speaker learns x. More than one row
 * carries each weight, since one is picked among them. */
function verdictText(rows: readonly AnswerEntryShape[]): {
  text: string;
  facts: string[];
} {
  const facts: string[] = [];
  const parts = rows.map((row) => {
    const bits: string[] = [];
    if (row.say !== undefined) bits.push(`“${row.say}”`);
    if (row.fact !== undefined) {
      facts.push(row.fact);
      bits.push(
        bits.length
          ? `and the speaker learns ${row.fact}`
          : `the speaker learns ${row.fact}`
      );
    }
    if (row.flee !== undefined)
      bits.push(bits.length ? 'and it flees' : 'it flees');
    const weight = rows.length > 1 ? ` (weight ${row.weight ?? 1})` : '';
    return `${bits.join(', ')}${weight}`;
  });
  return { text: parts.join('; or '), facts };
}

function optionSentence(
  document: Readonly<RoomDraftDocument>,
  option: OptionShape
): ReadBackSentence {
  const parts = [`“${option.say}”`];
  const refs: ReadBackRef[] = [];
  const facts: string[] = [];
  if (option.requires !== undefined) {
    parts.push(
      requiresSentence(option.requires, (id) => propName(document, id))
    );
    const gate = requiresRead(option.requires);
    if ('fact' in gate) facts.push(gate.fact);
  }
  parts.push(
    `${option.check
      .map((a) => `${abilityPhrase(a.ability)} DC ${a.dc}`)
      .join(' or ')}.`
  );
  for (const verdict of ['success', 'failure'] as const) {
    const rows = option[verdict];
    if (rows === undefined) continue;
    const { text, facts: written } = verdictText(rows);
    facts.push(...written);
    parts.push(
      `${verdict === 'success' ? 'Success' : 'Failure'}: ${endSentence(text)}`
    );
  }
  const text = parts.join(' ');
  refs.push(...factRefsIn(text, facts));
  return sentence(text, refs);
}

function spokenToParagraph(
  document: Readonly<RoomDraftDocument>,
  options: readonly OptionShape[] | undefined
): ReadBackParagraph {
  if (options === undefined || options.length === 0)
    return {
      heading: 'spoken-to',
      lead: 'Nothing can be said to it.',
      sentences: [sentence('Nothing can be said to it. It has no options.')],
    };
  return {
    heading: 'spoken-to',
    lead: 'It can be spoken to.',
    sentences: [sentence('It can be spoken to.')],
    items: options.map((option) => optionSentence(document, option)),
  };
}

function revealsText(record: SiteIntelRecord): string {
  const r = record.reveals;
  if ('fact' in r) return r.fact;
  if ('concealment' in r) return `the concealment ${r.concealment}`;
  return `the door ${r.door}`;
}

/** What it carries at spawn, then the facts it writes and reads. */
function knowsParagraph(
  document: Readonly<RoomDraftDocument>,
  holds: readonly string[] | undefined,
  writes: ReadonlySet<string>,
  reads: ReadonlySet<string>,
  extra: readonly ReadBackSentence[] = []
): ReadBackParagraph {
  const sentences: ReadBackSentence[] = [];
  if (holds === undefined || holds.length === 0)
    sentences.push(sentence('It knows nothing at spawn; it carries no intel.'));
  else
    for (const id of holds) {
      const record = (document.scope.intel ?? []).find((r) => r.id === id);
      if (record === undefined) {
        sentences.push(
          sentence(`It carries ${id}, which this document does not declare.`)
        );
        continue;
      }
      const reveals = revealsText(record);
      const refs: ReadBackRef[] = [{ text: id, target: { kind: 'intel', id } }];
      if ('fact' in record.reveals) refs.push(factRef(record.reveals.fact));
      sentences.push(
        sentence(`It carries ${id}, which reveals ${reveals}.`, refs)
      );
    }
  const w = [...writes];
  const r = [...reads];
  if (w.length || r.length) {
    const parts: string[] = [];
    if (w.length) parts.push(`it writes ${joinAnd(w)}`);
    if (r.length) parts.push(`it reads ${joinAnd(r)}`);
    const text = `${capitalized(parts.join('; '))}.`;
    sentences.push(sentence(text, factRefsIn(text, [...w, ...r])));
  }
  sentences.push(...extra);
  return { heading: 'knows', lead: 'It knows', sentences };
}

/** The facts a creature's or prop's own options write and read. */
function optionFacts(
  options: readonly OptionShape[] | undefined,
  writes: Set<string>,
  reads: Set<string>
) {
  for (const option of options ?? []) {
    if (option.requires && 'fact' in requiresRead(option.requires))
      reads.add(requiresId(option.requires));
    for (const row of [...(option.success ?? []), ...(option.failure ?? [])])
      if (row.fact !== undefined) writes.add(row.fact);
  }
}

/** The read-back for one placed creature or prop, from the draft alone. */
export function readBackOf(
  document: Readonly<RoomDraftDocument>,
  selection: Selection
): readonly ReadBackParagraph[] {
  const writes = new Set<string>();
  const reads = new Set<string>();
  if (selection.kind === 'creature') {
    const binding = document.draft.room.monsterBindings?.[selection.id];
    const layers = layeredOrders(document, selection.id);
    for (const trigger of ANSWER_TRIGGER_KEYS)
      for (const row of layers[trigger].rows) {
        walkFacts(row.when, (fact) => reads.add(fact));
        if (row.fact !== undefined) writes.add(row.fact);
      }
    optionFacts(binding?.options, writes, reads);
    if (binding?.arrives && 'fact' in binding.arrives)
      reads.add(binding.arrives.fact);
    return [
      withActionAugments(
        whoParagraph(document, selection.id),
        document,
        selection.id
      ),
      ordersParagraph(document, selection.id),
      spokenToParagraph(document, binding?.options),
      knowsParagraph(document, binding?.holds, writes, reads),
    ];
  }
  const binding = document.draft.room.propBindings?.[selection.id];
  optionFacts(binding?.options, writes, reads);
  if (binding?.arrives && 'fact' in binding.arrives)
    reads.add(binding.arrives.fact);
  const extra: ReadBackSentence[] = [];
  if (binding?.holdable) extra.push(sentence('Anyone can pick it up.'));
  if (binding?.arrives !== undefined) {
    const text = `It is held out of the run until ${predicateSentence(binding.arrives, { names: documentPlacementNames(document) })}.`;
    extra.push(
      sentence(
        text,
        'fact' in binding.arrives ? [factRef(binding.arrives.fact)] : []
      )
    );
  }
  return [
    spokenToParagraph(document, binding?.options),
    knowsParagraph(document, binding?.holds, writes, reads, extra),
  ];
}
