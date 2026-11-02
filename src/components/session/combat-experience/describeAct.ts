/**
 * describeAct — one story line per act (rpg-project#630, event-stream R14,
 * R16, R17, Laws 6 and 7).
 *
 * MINIMAL RENDERING, ON PURPOSE. Each act becomes one describer line — who
 * did what, to whom, how it was decided, what changed — plus the `Roll` that
 * decided it, for the breakdown. The per-kind cards the v1 story built from
 * beats collapse to this line until the per-family forms (rpg-dnd5e-web#1301)
 * restore them. Every body has a describer; the switch is exhaustive, so a
 * body added to the contract is a compile error here until it is described.
 *
 * SILENT ACTS. A sighting, cells learned, a tick and the scene opening are
 * bookkeeping the canvas already draws, as they were on v1: they describe to
 * `null` and add no story row.
 *
 * The describer reads only the act. It decides no rule and adds nothing up:
 * every number comes from the act's own body and `Roll`.
 */
import { refId } from '@/utils/refs';
import {
  AttackOutcome,
  CastOutcome,
  ClockMark,
  DamageType,
  Family,
  InfluenceKind,
  PartyKind,
  Sense,
  StateKind,
  type Act,
  type Party,
  type Roll,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { authoredWords, holdingPhrase } from '../holdingBeat';
import { endingResultLine } from '../runEnding';

/**
 * The cause a creature's `dash` pick writes on every step of its run
 * (encounter v0.148.0): the walk act carries it as `cause`.
 */
export const DASH_CAUSE = 'encounter:table:dash';

export interface DescribeContext {
  readonly viewerMember: string;
  readonly memberNames?: Readonly<Record<string, string>>;
}

export type DescribedTone = 'neutral' | 'success' | 'danger' | 'turn';

export interface DescribedAct {
  readonly eyebrow: string;
  readonly headline: string;
  readonly detail: string;
  /**
   * The describer's one line — who, what, outcome — with no roll in it
   * (rpg-dnd5e-web#1301). The toast is this line; the log is this line with
   * the formula line and the folded breakdown under it.
   */
  readonly text: string;
  /** `text` past the headline: the outcome, with no roll in it. */
  readonly outcome: string;
  readonly tone: DescribedTone;
  /** The roll that decided the act, for the breakdown. */
  readonly roll?: Roll;
}

/** A party as a reader names it. */
export function partyName(
  party: Party | undefined,
  context: DescribeContext
): string {
  if (!party?.id) return party?.kind === PartyKind.WORLD ? 'The world' : '';
  switch (party.kind) {
    case PartyKind.MEMBER:
      return context.memberNames?.[party.id] ?? party.id;
    case PartyKind.PROP:
      return `the ${authoredWords(party.id)}`;
    case PartyKind.WORLD:
      return 'The world';
    default:
      return authoredWords(party.id);
  }
}

function memberName(id: string, context: DescribeContext): string {
  return context.memberNames?.[id] ?? id;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function damageWord(type: DamageType | undefined): string {
  if (type === undefined || type === DamageType.UNSPECIFIED) return '';
  return (DamageType[type] ?? '').toLowerCase();
}

/**
 * A roll in one line: its expression and total, and what it was against.
 * `1d20+5 = 20 vs 13`; a table die reads `4 of 6`.
 */
export function formatRollShort(roll: Roll | undefined): string {
  if (!roll) return '';
  if (roll.of > 0) return `${roll.total} of ${roll.of}`;
  const head = roll.expression ? `${roll.expression} = ` : '';
  const against = roll.against !== undefined ? ` vs ${roll.against}` : '';
  return `${head}${roll.total}${against}`;
}

interface RollPart {
  readonly negative: boolean;
  readonly text: string;
  readonly source: string;
}

/**
 * A roll's parts, EACH SOURCE NAMED ONCE (rpg-dnd5e-web#1308): every dice
 * term with its kept faces and every flat modifier, grouped under the source
 * that brought them in order of first appearance, the source in parentheses
 * after its group. A swing's d20 and its +5 both from the Longsword read
 * `1d20 [3] + 5 (Longsword)`, never `1d20 [3] Longsword + 5 Longsword`;
 * Bane reads `- 1d4 [2] (Bane)`. A roll with no terms shows its bare kept
 * faces, which name no source.
 */
function rollParts(roll: Roll): string[] {
  const all: RollPart[] = [];
  if (roll.terms.length > 0) {
    for (const t of roll.terms) {
      all.push({
        negative: t.subtract,
        text: `${t.count}d${t.dieSize} [${t.faces.join(', ')}]`,
        source: t.sourceName,
      });
    }
  } else if (roll.dice.length > 0) {
    all.push({
      negative: false,
      text: `[${roll.dice.join(', ')}]`,
      source: '',
    });
  }
  for (const m of roll.modifiers) {
    all.push({
      negative: m.value < 0,
      text: `${Math.abs(m.value)}`,
      source: m.source,
    });
  }
  const groups = new Map<string, RollPart[]>();
  for (const part of all) {
    const group = groups.get(part.source);
    if (group) group.push(part);
    else groups.set(part.source, [part]);
  }
  const sign = (part: RollPart) => (part.negative ? '-' : '+');
  const parts: string[] = [];
  for (const [source, group] of groups) {
    const [first, ...rest] = group;
    const body = [
      first!.text,
      ...rest.map((part) => `${sign(part)} ${part.text}`),
    ].join(' ');
    const named = source ? `${body} (${source})` : body;
    parts.push(
      parts.length === 0 && !first!.negative
        ? named
        : `${sign(first!)} ${named}`
    );
  }
  return parts;
}

/**
 * A roll with its dice terms named: `1d20 [9] + 1d4 [3] Bless - 1d4 [2] Bane
 * = 99`. "" when the roll carries no terms, so a caller falls back to the
 * expression.
 */
export function formatRollNamed(roll: Roll | undefined): string {
  if (!roll || roll.terms.length === 0) return '';
  return `${rollParts(roll).join(' ')} = ${roll.total}`;
}

/**
 * A roll's breakdown: its parts (see `rollParts`), the total and what it was
 * against. `1d20 [15] Longsword + 3 Strength + 2 Proficiency = 20 vs 13`.
 * Reads the `Roll` only (R17).
 */
export function formatRollBreakdown(roll: Roll | undefined): string {
  if (!roll) return '';
  if (roll.of > 0)
    return `d${roll.of} [${roll.dice.join(', ')}] = ${roll.total}`;
  const parts = rollParts(roll);
  const against = roll.against !== undefined ? ` vs ${roll.against}` : '';
  const beaten =
    roll.beaten === undefined
      ? ''
      : roll.beaten
        ? ' · beaten'
        : ' · not beaten';
  const head = parts.length > 0 ? `${parts.join(' ')} = ` : '';
  return `${head}${roll.total}${against}${beaten}`;
}

function withRoll(text: string, roll: Roll | undefined): string {
  const short = formatRollShort(roll);
  return short ? (text ? `${text}, ${short}` : short) : text;
}

const CAST_OUTCOME_WORD: Record<CastOutcome, string> = {
  [CastOutcome.UNSPECIFIED]: '',
  [CastOutcome.MISS]: 'missed',
  [CastOutcome.WARDED]: 'warded',
  [CastOutcome.SAVED]: 'saved',
  [CastOutcome.FAILED]: 'failed the save',
};

/**
 * One act as one line, or `null` for an act that is bookkeeping rather than
 * story. A refused act still describes: it took its place in the stream.
 */
export function describeAct(
  act: Act,
  context: DescribeContext
): DescribedAct | null {
  const described = describeWith(act, context, WITH_ROLLS);
  if (!described) return null;
  const plain = describeWith(act, context, WITHOUT_ROLLS);
  const outcome = (plain ?? described).detail;
  return { ...described, text: describedLine(plain ?? described), outcome };
}

/** The roll wording a describer pass uses: the log's detail, or none. */
interface RollWords {
  readonly withRoll: (text: string, roll: Roll | undefined) => string;
  readonly short: (roll: Roll | undefined) => string;
  readonly named: (roll: Roll | undefined) => string;
}
const WITH_ROLLS: RollWords = {
  withRoll,
  short: formatRollShort,
  named: formatRollNamed,
};
const WITHOUT_ROLLS: RollWords = {
  withRoll: (text) => text,
  short: () => '',
  named: () => '',
};

/** Headline and roll-free detail as one line: `who what — outcome`. */
function describedLine(d: Omit<DescribedAct, 'text' | 'outcome'>): string {
  return d.detail ? `${d.headline} — ${d.detail}` : d.headline;
}

function describeWith(
  act: Act,
  context: DescribeContext,
  rw: RollWords
): Omit<DescribedAct, 'text' | 'outcome'> | null {
  const name = (p: Party | undefined) => partyName(p, context);
  if (act.refused) {
    return {
      eyebrow: act.verb || 'Act',
      headline: 'Something happened that this client cannot read',
      detail: act.refusal,
      tone: 'neutral',
    };
  }
  const body = act.body;
  switch (body.case) {
    case 'walk': {
      const w = body.value;
      const last = w.path.at(-1)?.cell;
      const where = last ? ` to (${last.x}, ${last.y})` : '';
      if (w.cause === DASH_CAUSE) {
        // A run (rpg-dnd5e-web#1341): the walk a creature's `dash` pick
        // caused. It reads as a run, not a walk with a cause in brackets.
        return {
          eyebrow: 'Dash',
          headline: `${name(w.mover)} runs`,
          detail: `${plural(w.path.length, 'cell')}${where}`,
          tone: 'neutral',
        };
      }
      return {
        eyebrow: 'Move',
        headline: `${name(w.mover)} moves`,
        detail: `${plural(w.path.length, 'cell')}${where}${w.cause ? ` (${authoredWords(w.cause)})` : ''}`,
        tone: 'neutral',
      };
    }
    case 'attack': {
      const a = body.value;
      const weapon = a.attack?.name || a.attack?.ref || 'Attack';
      const eyebrow =
        act.family === Family.REACTION || a.reaction
          ? `Reaction · ${a.reaction?.name || weapon}`
          : a.sequence?.name
            ? `${a.sequence.name} · ${weapon}`
            : `Attack · ${weapon}`;
      if (a.outcome === AttackOutcome.WARDED) {
        const ward = a.ward;
        return {
          eyebrow,
          headline: `${name(a.by)}'s attack on ${name(a.to)} is warded`,
          detail: rw.withRoll(
            `${ward?.ability ? `${ward.ability} save` : 'save'} against ${name(ward?.source)}'s ward`,
            ward?.roll
          ),
          tone: 'neutral',
          roll: ward?.roll,
        };
      }
      const hit = a.outcome === AttackOutcome.HIT;
      const verdict = a.critical ? 'critical hit' : hit ? 'hit' : 'miss';
      const word = damageWord(a.attack?.damageType);
      const damage = hit ? `, ${a.damage} ${word ? `${word} ` : ''}damage` : '';
      return {
        eyebrow,
        headline: hit
          ? `${name(a.by)} strikes ${name(a.to)}`
          : `${name(a.to)} evades ${name(a.by)}`,
        detail: `${rw.withRoll(`${weapon}: ${verdict}`, a.roll)}${damage}`,
        tone:
          hit && a.to?.id === context.viewerMember
            ? 'danger'
            : hit
              ? 'success'
              : 'neutral',
        roll: a.roll,
      };
    }
    case 'cast': {
      const c = body.value;
      const results = c.results
        .map((r) =>
          rw.withRoll(
            `${name(r.target)} ${CAST_OUTCOME_WORD[r.outcome]}`.trim(),
            r.save
          )
        )
        .join('; ');
      const targets = c.targets.map(name).join(', ');
      return {
        eyebrow: `Cast · ${c.spell?.name || 'Spell'}`,
        headline: `${name(c.by)} casts ${c.spell?.name || 'a spell'}${targets ? ` at ${targets}` : ''}`,
        detail: results,
        tone: 'neutral',
        roll: c.results.find((r) => r.save)?.save,
      };
    }
    case 'activate': {
      const a = body.value;
      const results = a.results.map((r) => {
        const what = r.name || authoredWords(r.kind);
        const on = r.target ? ` on ${name(r.target)}` : '';
        const amount = r.amount ? ` (${r.amount})` : '';
        return rw.withRoll(`${what}${on}${amount}`, r.roll);
      });
      const saves = a.saves.map((s) =>
        rw.withRoll(`${name(s.saver)} ${s.ability} save`, s.roll)
      );
      return {
        eyebrow: `Activate · ${a.ability?.name || 'Ability'}`,
        headline: `${name(a.by)} uses ${a.ability?.name || 'an ability'}${a.target ? ` on ${name(a.target)}` : ''}`,
        detail: [...results, ...saves].join('; '),
        tone: 'neutral',
        roll: a.results.find((r) => r.roll)?.roll ?? a.saves[0]?.roll,
      };
    }
    case 'speak': {
      const s = body.value;
      const answer = s.answer
        ? ` ${name(s.answer.who)}: ${s.answer.say ? `"${s.answer.say}"` : s.answer.word}`
        : '';
      return {
        eyebrow: `Speak${s.skill ? ` · ${s.skill}` : ''}`,
        headline: `${name(s.by)} to ${name(s.to)}: "${s.line}"`,
        detail:
          `${rw.withRoll(s.skill ? `${s.skill} check` : '', s.roll)}${answer}`.trim(),
        tone: 'neutral',
        roll: s.roll,
      };
    }
    case 'deathSave': {
      const d = body.value;
      const tally = `${plural(d.successes, 'success', 'successes')}, ${plural(d.failures, 'failure')}`;
      const outcome = authoredWords(d.outcome);
      return {
        eyebrow: 'Death save',
        headline: `${name(d.by)} rolls a death save`,
        // No authored outcome is no prefix: the tally stands alone.
        detail: rw.withRoll(outcome ? `${outcome}: ${tally}` : tally, d.roll),
        tone: d.dead
          ? 'danger'
          : d.stabilized || d.recovered
            ? 'success'
            : 'neutral',
        roll: d.roll,
      };
    }
    case 'loot':
      return {
        eyebrow: 'Loot',
        headline: `${name(body.value.by)} loots ${name(body.value.from)}`,
        detail: '',
        tone: 'neutral',
      };
    case 'hold':
      return {
        eyebrow: 'Hold',
        headline: `${name(body.value.by)} holds ${name(body.value.prop)}`,
        detail: '',
        tone: 'neutral',
      };
    case 'drop':
      return {
        eyebrow: 'Drop',
        headline: `${name(body.value.by)} drops ${name(body.value.prop)}`,
        detail: '',
        tone: 'neutral',
      };
    case 'door': {
      const d = body.value;
      const who = d.by ? name(d.by) : 'Someone';
      return {
        eyebrow: 'Door',
        headline: `${who}: the ${authoredWords(d.door)} is ${d.state}`,
        detail: rw.withRoll('', d.roll),
        tone: 'neutral',
        roll: d.roll,
      };
    }
    case 'equip': {
      const e = body.value;
      return {
        eyebrow: 'Equip',
        headline: `${name(e.by)} ${e.change === 'stow' ? 'stows' : 'draws'} ${authoredWords(e.item)}`,
        detail: e.slot ? authoredWords(e.slot) : '',
        tone: 'neutral',
      };
    }
    case 'stay':
      return {
        eyebrow: 'Stay',
        headline: `${name(body.value.member)} stays put`,
        detail: authoredWords(body.value.why),
        tone: 'neutral',
      };
    case 'sneak': {
      const s = body.value;
      const verdict =
        s.roll?.beaten === undefined
          ? ''
          : s.roll.beaten
            ? 'unseen'
            : 'spotted';
      return {
        eyebrow: 'Sneak',
        headline: `${name(s.by)} sneaks${s.watcher ? ` past ${name(s.watcher)}` : ''}`,
        detail: rw.withRoll(verdict, s.roll),
        tone: 'neutral',
        roll: s.roll,
      };
    }
    case 'rest': {
      const r = body.value;
      return {
        eyebrow: 'Rest',
        headline: `${name(r.by)} takes a ${r.kind} rest`,
        detail: rw.withRoll(
          `+${r.hitPointsRestored} HP (${r.hitPoints}), ${plural(r.hitDiceSpent, 'hit die', 'hit dice')} spent`,
          r.roll
        ),
        tone: 'success',
        roll: r.roll,
      };
    }
    case 'tableAnswer': {
      const t = body.value;
      if (t.dealt) {
        return {
          eyebrow: 'Temper',
          headline: `${name(t.dealt.faction)} deals ${name(t.who)} ${t.dealt.temper}`,
          detail: rw.short(t.dealt.roll),
          tone: 'neutral',
          roll: t.dealt.roll,
        };
      }
      return {
        eyebrow: 'Answer',
        headline: `${name(t.who)}: ${t.say ? `"${t.say}"` : t.word || 'answers'}`,
        // A pick with no line already says its word in the headline.
        detail: rw.withRoll(t.say ? t.word : '', t.roll),
        tone: 'neutral',
        roll: t.roll,
      };
    }
    case 'state': {
      const s = body.value;
      switch (s.change) {
        case StateKind.DOWNED:
          return {
            eyebrow: 'Down',
            headline: `${name(s.party)} falls`,
            detail: '',
            tone: 'danger',
          };
        case StateKind.STANCE:
          return {
            eyebrow: 'Stance',
            headline:
              `${(s.stance?.between ?? []).map(name).join(' and ')} turn ${s.stance?.stance ?? ''}`.trim(),
            detail: s.stance?.cause ? authoredWords(s.stance.cause) : '',
            tone: 'neutral',
          };
        case StateKind.CONCENTRATION_ENDED:
          return {
            eyebrow: 'Concentration',
            headline: `${name(s.party)} stops concentrating on ${s.concentration?.spell?.name || 'a spell'}`,
            detail: authoredWords(s.concentration?.reason ?? ''),
            tone: 'neutral',
          };
        case StateKind.CONDITION_REMOVED:
          return {
            eyebrow: 'Condition',
            headline: `${s.condition?.name || 'A condition'} ends on ${name(s.party)}`,
            detail: authoredWords(s.condition?.reason ?? ''),
            tone: 'neutral',
          };
        // A creature's machine moved: "Gate guard: posted → alert (heard
        // something)". No reason, no parenthetical.
        case StateKind.MACHINE: {
          const from = authoredWords(s.machine?.from ?? '');
          const to = authoredWords(s.machine?.to ?? '');
          const reason = authoredWords(s.machine?.reason ?? '');
          return {
            eyebrow: 'State',
            headline: `${name(s.party)}: ${from} → ${to}${reason ? ` (${reason})` : ''}`,
            detail: '',
            tone: 'neutral',
          };
        }
        case StateKind.EXPERIENCE:
          return {
            eyebrow: 'Experience',
            headline: `Experience gained`,
            detail: s.experience
              .map(
                (g) =>
                  `${memberName(g.character, context)} +${g.amount} (${g.total})`
              )
              .join(', '),
            tone: 'success',
          };
        default:
          return null;
      }
    }
    case 'perception': {
      const p = body.value;
      switch (p.sense) {
        case Sense.HEARING:
          return {
            eyebrow: 'Heard',
            headline: `${name(p.observer)} hears ${authoredWords(p.heard?.kind ?? 'something')}`,
            detail: p.heard ? plural(p.heard.hops, 'cell') + ' away' : '',
            tone: 'neutral',
          };
        case Sense.DISCOVERY: {
          // The server's verdict, copied: never total against `against`.
          const roll = p.discovery?.roll;
          const verdict =
            roll?.beaten === undefined ? '' : roll.beaten ? 'passed' : 'failed';
          const ability = p.discovery?.ability ?? '';
          const check = ability ? `${ability} check` : '';
          return {
            eyebrow: 'Search',
            headline: `${name(p.observer)} searches`,
            detail: rw.withRoll(`${verdict} ${check}`.trim(), roll),
            tone: roll?.beaten ? 'success' : 'neutral',
            roll,
          };
        }
        case Sense.REVEAL:
          return {
            eyebrow: 'Found',
            headline: `${name(p.observer)} finds ${authoredWords(p.revealed?.concealment ?? 'something')}`,
            detail: '',
            tone: 'success',
          };
        default:
          return null; // sight and cells: the canvas draws them
      }
    }
    case 'clock': {
      const c = body.value;
      switch (c.mark) {
        case ClockMark.TURN_ENDED:
          return {
            eyebrow: 'Turn',
            headline: `${name(c.turn?.next)}'s turn`,
            detail: c.turn?.member
              ? `${name(c.turn.member)} ends their turn`
              : '',
            tone: 'turn',
          };
        case ClockMark.FIGHT_FORMED:
          return {
            eyebrow: 'Fight',
            headline: 'A fight begins',
            detail: (c.fight?.order ?? []).map(name).join(', '),
            tone: 'danger',
          };
        case ClockMark.FIGHT_DISSOLVED:
          return {
            eyebrow: 'Fight',
            headline: 'The fight ends',
            detail: authoredWords(c.dissolved?.cause ?? ''),
            tone: 'neutral',
          };
        case ClockMark.JOINED:
          return {
            eyebrow: 'Join',
            headline: `${name(c.member)} joins`,
            detail: '',
            tone: 'neutral',
          };
        case ClockMark.EXITED: {
          const d = c.departure;
          const carried = holdingPhrase(d?.holding ?? []);
          return {
            eyebrow: 'Leave',
            headline: `${name(d?.member)} leaves${d?.exit ? ` through the ${authoredWords(d.exit)}` : ''}`,
            detail: carried ? `with ${carried}` : '',
            tone: 'neutral',
          };
        }
        case ClockMark.ARRIVED:
          return {
            eyebrow: 'Arrive',
            headline: `${authoredWords(c.arrival?.id ?? '')} arrives`,
            detail: '',
            tone: 'neutral',
          };
        case ClockMark.ENDED:
          return {
            eyebrow: 'End',
            headline: 'The run ends',
            // "captain slain — success" when the ending declares a result
            // (rpg-project#733); the ending's words alone when it does not.
            detail:
              endingResultLine(c.ending, c.outcome) ?? authoredWords(c.ending),
            tone: 'turn',
          };
        case ClockMark.WINDOW_OPENED:
          return {
            eyebrow: 'Window',
            headline: `${(c.window?.windows ?? []).map((w) => name(w.audience)).join(', ')} may react to ${name(c.window?.member)}`,
            detail: (c.window?.windows ?? [])
              .map((w) => w.reaction?.name ?? '')
              .filter(Boolean)
              .join(', '),
            tone: 'neutral',
          };
        case ClockMark.ROLL_WINDOW_OPENED:
          return {
            eyebrow: 'Window',
            headline: `${name(c.rollWindow?.audience)} may use ${c.rollWindow?.offer?.name || 'a reaction'}`,
            detail:
              rw.named(c.rollWindow?.roll) || rw.short(c.rollWindow?.roll),
            tone: 'neutral',
            roll: c.rollWindow?.roll,
          };
        // The raise matched more beats than its bound and cut the rest: a
        // quiet line, "the raise cut 3 of 20 beats".
        case ClockMark.WAKE_CUT:
          return {
            eyebrow: 'Clock',
            headline: `the raise cut ${c.wakeCut?.dropped ?? 0} of ${c.wakeCut?.matched ?? 0} beats`,
            detail: '',
            tone: 'neutral',
          };
        default:
          return null; // a tick and the scene opening: bookkeeping
      }
    }
    case undefined:
      return null;
    default: {
      const never: never = body;
      return never;
    }
  }
}

/** What a formula line's roll was against: an attack meets an AC, the rest a DC. */
type Against = 'AC' | 'DC' | '';

/** A roll's influences after its formula: `advantage: Bless`. */
function influenceWords(roll: Roll): string {
  const named = (kind: InfluenceKind) =>
    roll.influences
      .filter((i) => i.kind === kind)
      .map((i) =>
        // The name the rulebook recorded, or the ref's id when it recorded
        // none, read as words: `protection_fighting_style` is not a label.
        authoredWords(i.name || (refId(i.sourceRef) ?? i.sourceRef))
      )
      .filter(Boolean);
  const advantage = named(InfluenceKind.ADVANTAGE);
  const disadvantage = named(InfluenceKind.DISADVANTAGE);
  return [
    advantage.length ? `advantage: ${advantage.join(', ')}` : '',
    disadvantage.length ? `disadvantage: ${disadvantage.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One roll as a formula: its label, total, what it was against and the
 * verdict, then its influences. `Longsword 20 vs AC 13 — hit · advantage:
 * Bless`. A table roll reads `d100: 75`. The verdict is the caller's outcome
 * word when it has one (an attack's, a cast's), else the roll's own `beaten`.
 */
function rollFormula(
  label: string,
  roll: Roll | undefined,
  against: Against,
  outcome = ''
): string {
  if (!roll) return '';
  if (roll.of > 0) return `d${roll.of}: ${roll.total}`;
  const vs =
    roll.against !== undefined
      ? ` vs ${against ? `${against} ` : ''}${roll.against}`
      : '';
  const verdict =
    outcome ||
    (roll.beaten === undefined ? '' : roll.beaten ? 'beaten' : 'not beaten');
  const influences = influenceWords(roll);
  return [
    `${`${label} ${roll.total}`.trim()}${vs}${verdict ? ` — ${verdict}` : ''}`,
    influences,
  ]
    .filter(Boolean)
    .join(' · ');
}

const CAST_VERDICT: Record<CastOutcome, string> = {
  [CastOutcome.UNSPECIFIED]: '',
  [CastOutcome.MISS]: 'missed',
  [CastOutcome.WARDED]: 'warded',
  [CastOutcome.SAVED]: 'saved',
  [CastOutcome.FAILED]: 'failed',
};

/**
 * The formula line a form shows under its describer line (R17, R37):
 * "Stealth 12 vs DC 12 — beaten", "Longsword 20 vs AC 13 — hit",
 * "Dexterity save 9 vs DC 14 — failed", "d100: 75". The label comes from the
 * body — the skill on a speak or sneak, the ability on a save or a discovery,
 * the attack's weapon, the spell — and several rolls on one act join with
 * `; `, each named by who rolled it. "" when the act carries no roll.
 *
 * Reads the act only: every number is the act's, nothing is re-added.
 */
export function formatRollFormula(
  act: Act,
  context: DescribeContext = { viewerMember: '' }
): string {
  const name = (p: Party | undefined) => partyName(p, context);
  const body = act.body;
  switch (body.case) {
    case 'attack': {
      const a = body.value;
      if (a.outcome === AttackOutcome.WARDED) {
        const ward = a.ward;
        return rollFormula(
          ward?.ability ? `${ward.ability} save` : 'Save',
          ward?.roll,
          'DC',
          'warded'
        );
      }
      const verdict =
        a.outcome === AttackOutcome.HIT
          ? a.critical
            ? 'critical hit'
            : 'hit'
          : a.outcome === AttackOutcome.MISS
            ? 'miss'
            : '';
      return rollFormula(
        a.attack?.name || a.attack?.ref || 'Attack',
        a.roll,
        'AC',
        verdict
      );
    }
    case 'cast': {
      const c = body.value;
      const rolled = c.results.filter((r) => r.save);
      return rolled
        .map((r) => {
          const label = r.ability
            ? `${r.ability} save`
            : c.spell?.name || 'Save';
          const line = rollFormula(
            label,
            r.save,
            'DC',
            CAST_VERDICT[r.outcome]
          );
          return rolled.length > 1 ? `${name(r.target)}: ${line}` : line;
        })
        .join('; ');
    }
    case 'activate': {
      const a = body.value;
      const lines = [
        ...a.results
          .filter((r) => r.roll)
          .map((r) =>
            rollFormula(r.name || authoredWords(r.kind), r.roll, 'DC')
          ),
        ...a.saves.map((s) => {
          const line = rollFormula(`${s.ability} save`.trim(), s.roll, 'DC');
          return a.saves.length > 1 ? `${name(s.saver)}: ${line}` : line;
        }),
      ];
      return lines.filter(Boolean).join('; ');
    }
    case 'speak':
      return rollFormula(body.value.skill || 'Check', body.value.roll, 'DC');
    case 'sneak':
      return rollFormula('Stealth', body.value.roll, 'DC');
    case 'deathSave':
      return rollFormula('Death save', body.value.roll, 'DC');
    case 'door':
      return rollFormula(authoredWords(body.value.door), body.value.roll, 'DC');
    case 'rest':
      return rollFormula('Hit dice', body.value.roll, 'DC');
    case 'tableAnswer':
      return rollFormula(
        '',
        body.value.dealt ? body.value.dealt.roll : body.value.roll,
        'DC'
      );
    case 'perception':
      return body.value.discovery
        ? rollFormula(
            body.value.discovery.ability || 'Check',
            body.value.discovery.roll,
            'DC'
          )
        : '';
    case 'clock':
      return body.value.rollWindow
        ? rollFormula('Roll', body.value.rollWindow.roll, '')
        : '';
    default:
      return '';
  }
}
