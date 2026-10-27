/**
 * recordActs — the Debug panel's record, grouped by act (rpg-dnd5e-web#1345).
 *
 * THE KEY IS THE ACT ID every beat carries (`RecordRow.act`, `<verb>:<id>`,
 * event-stream R3/R24, rpg-project#627/#652). One verb is one act, and every
 * beat written inside it carries its id.
 *
 * A DRIVEN TURN IS TWO ACTS, JOINED HERE. The encounter writes a creature's
 * pick as its own act, `time:<id>` (its `table` and `answered` beats, and any
 * voice the pick raised), and then opens ONE act for the intent the pick chose
 * (`move:<id>`, `attack:<id>`, ...). Both ids are minted from the record's own
 * increasing id space, the intent's straight after the pick's. So a `time` act
 * holding an `answered` beat takes the next act by id as the thing it did,
 * when that act is not itself a pick and one of its beats names the same
 * creature (a `hold` pick drives no act, and the next act is someone else's). "Knight · r1 · dash enemy · 12 cells" is
 * that pair.
 *
 * BEATS WITH NO ACT (the scene opening, world-pace beats written outside any
 * verb) group under one `world` row per round. Nothing is dropped.
 *
 * Pure of React so the grouping is tested without a component.
 */
import type { RecordRow } from './recordFeed';

export interface RecordAct {
  /** The row's key: the first act id, or `world:<round>`. */
  readonly key: string;
  /** The act ids in the row: the pick's, then the act it drove. */
  readonly acts: readonly string[];
  /** True for the per-round row of beats written outside any act. */
  readonly world: boolean;
  /** The world-clock round of the row's first beat. */
  readonly round: bigint;
  /** Who acted: the pick's creature, or the first beat that names one. */
  readonly actor: string;
  /** The `answered` beat of the pick, when the row is a driven turn. */
  readonly pick: RecordRow | undefined;
  /** What fired: the pick's `word selector`, or the act's verb. */
  readonly word: string;
  /** Every beat of the row, oldest first, the pick's own beats included. */
  readonly beats: readonly RecordRow[];
  /** What followed, in words: "12 cells", "1 strike, 2 heard". */
  readonly followed: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** `move` from `move:01HF…`; '' for a beat outside any act. */
export function verbOf(act: string): string {
  const colon = act.indexOf(':');
  return colon < 0 ? act : act.slice(0, colon);
}

/** `01HF…` from `move:01HF…`: the minted id, which orders acts. */
function mintedOf(act: string): string {
  return act.slice(act.indexOf(':') + 1);
}

/** The member a beat is about, by the payload's own key for it. */
function actorOf(row: RecordRow): string {
  const f = row.fields ?? {};
  return (
    str(f.creature) ||
    str(f.prop) ||
    str(f.member) ||
    str(f.actor) ||
    str(f.mover)
  );
}

/** The pick's own bookkeeping, not something that followed it. */
const PICK_BEATS = new Set(['table', 'answered']);

/** How a beat counts in a row's summary: "cell", "strike", ... */
const COUNTED: Readonly<Record<string, readonly [string, string]>> = {
  moved: ['cell', 'cells'],
  struck: ['strike', 'strikes'],
  missed: ['miss', 'misses'],
  heard: ['heard', 'heard'],
  sighted: ['sighted', 'sighted'],
  stayed: ['stay', 'stays'],
};

/** "12 cells, 1 strike, 2 heard" — every beat that followed the pick, in the
 * order each kind first appeared. */
export function followedOf(beats: readonly RecordRow[]): string {
  const counts = new Map<string, number>();
  for (const b of beats) {
    if (PICK_BEATS.has(b.beat)) continue;
    const name = b.beat || '(no beat)';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([beat, n]) => {
      const [one, many] = COUNTED[beat] ?? [beat, beat];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(', ');
}

function wordOf(pick: RecordRow | undefined, act: string): string {
  const f = pick?.fields;
  if (f) {
    const word = str(f.word);
    const selector = str(f.selector);
    if (word) return selector ? `${word} ${selector}` : word;
    if (str(f.say)) return 'say';
    return 'nothing';
  }
  return verbOf(act);
}

interface Draft {
  key: string;
  acts: string[];
  world: boolean;
  beats: RecordRow[];
}

/**
 * The record as acts, newest act first; each act's beats oldest first.
 * An act's place is its first beat: when it began.
 */
export function groupRecord(rows: readonly RecordRow[]): readonly RecordAct[] {
  const byAct = new Map<string, Draft>();
  const order: Draft[] = [];
  for (const row of rows) {
    const key = row.act || `world:${row.at}`;
    let draft = byAct.get(key);
    if (!draft) {
      draft = {
        key,
        acts: row.act ? [row.act] : [],
        world: !row.act,
        beats: [],
      };
      byAct.set(key, draft);
      order.push(draft);
    }
    draft.beats.push(row);
  }

  // Join each pick to the act it drove: the next act by id.
  const acts = order
    .filter((d) => !d.world)
    .sort((a, b) => {
      const x = mintedOf(a.key);
      const y = mintedOf(b.key);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  const joined = new Set<Draft>();
  acts.forEach((d, i) => {
    if (verbOf(d.key) !== 'time') return;
    const pick = d.beats.find((b) => b.beat === 'answered');
    if (!pick) return;
    const next = acts[i + 1];
    if (!next || verbOf(next.key) === 'time' || joined.has(next)) return;
    // A pick that drove nothing (a `hold`) is followed by whatever acted
    // next, someone else's verb: join only an act that names this creature.
    const who = actorOf(pick);
    if (!next.beats.some((b) => actorOf(b) === who)) return;
    d.acts.push(next.key);
    d.beats.push(...next.beats);
    d.beats.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    joined.add(next);
  });

  return order
    .filter((d) => !joined.has(d))
    .map((d): RecordAct => {
      const pick = d.beats.find((b) => b.beat === 'answered');
      const first = d.beats[0]!;
      const actor = pick
        ? actorOf(pick)
        : (d.beats.map(actorOf).find(Boolean) ?? '');
      return {
        key: d.key,
        acts: d.acts,
        world: d.world,
        round: first.at,
        actor: d.world ? 'world' : actor,
        pick,
        word: d.world ? '' : wordOf(pick, d.key),
        beats: d.beats,
        followed: followedOf(d.beats),
      };
    })
    .sort((a, b) =>
      a.beats[0]!.id < b.beats[0]!.id
        ? 1
        : a.beats[0]!.id > b.beats[0]!.id
          ? -1
          : 0
    );
}
