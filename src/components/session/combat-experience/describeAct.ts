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
import {
  AttackOutcome,
  CastOutcome,
  ClockMark,
  DamageType,
  Family,
  PartyKind,
  Sense,
  StateKind,
  type Act,
  type Party,
  type Roll,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { authoredWords, holdingPhrase } from '../holdingBeat';

export interface DescribeContext {
  readonly viewerMember: string;
  readonly memberNames?: Readonly<Record<string, string>>;
}

export type DescribedTone = 'neutral' | 'success' | 'danger' | 'turn';

export interface DescribedAct {
  readonly eyebrow: string;
  readonly headline: string;
  readonly detail: string;
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

function damageWord(type: DamageType | undefined): string {
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

/**
 * A roll's parts: each dice term with its kept faces and the source that
 * brought it (`1d4 [3] Bless`, `- 1d4 [2] Bane`), or the bare kept faces when
 * the roll carries no terms, then each flat modifier by its source.
 */
function rollParts(roll: Roll): string[] {
  const parts: string[] = [];
  if (roll.terms.length > 0) {
    for (const t of roll.terms) {
      const term =
        `${t.count}d${t.dieSize} [${t.faces.join(', ')}] ${t.sourceName}`.trim();
      if (t.subtract) parts.push(`- ${term}`);
      else parts.push(parts.length === 0 ? term : `+ ${term}`);
    }
  } else if (roll.dice.length > 0) {
    parts.push(`[${roll.dice.join(', ')}]`);
  }
  for (const m of roll.modifiers) {
    const sign = m.value < 0 ? '-' : '+';
    const value = `${Math.abs(m.value)} ${m.source}`.trim();
    parts.push(parts.length === 0 && m.value >= 0 ? value : `${sign} ${value}`);
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
          detail: withRoll(
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
        detail: `${withRoll(`${weapon}: ${verdict}`, a.roll)}${damage}`,
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
          withRoll(
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
        return withRoll(`${what}${on}${amount}`, r.roll);
      });
      const saves = a.saves.map((s) =>
        withRoll(`${name(s.saver)} ${s.ability} save`, s.roll)
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
          `${withRoll(s.skill ? `${s.skill} check` : '', s.roll)}${answer}`.trim(),
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
        detail: withRoll(outcome ? `${outcome}: ${tally}` : tally, d.roll),
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
        detail: withRoll('', d.roll),
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
        detail: withRoll(verdict, s.roll),
        tone: 'neutral',
        roll: s.roll,
      };
    }
    case 'rest': {
      const r = body.value;
      return {
        eyebrow: 'Rest',
        headline: `${name(r.by)} takes a ${r.kind} rest`,
        detail: withRoll(
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
          detail: formatRollShort(t.dealt.roll),
          tone: 'neutral',
          roll: t.dealt.roll,
        };
      }
      return {
        eyebrow: 'Answer',
        headline: `${name(t.who)}: ${t.say ? `"${t.say}"` : t.word || 'answers'}`,
        detail: withRoll(t.word, t.roll),
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
            detail: withRoll(`${verdict} ${check}`.trim(), roll),
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
            detail: authoredWords(c.ending),
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
              formatRollNamed(c.rollWindow?.roll) ||
              formatRollShort(c.rollWindow?.roll),
            tone: 'neutral',
            roll: c.rollWindow?.roll,
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

/**
 * Which acts toast when they arrive live: a deed (act or reaction), a change
 * of standing, and a speak's own answer. The table's bookkeeping, what one
 * observer perceived, and any other table answer stay in the log only.
 */
export function actToasts(act: Act): boolean {
  switch (act.family) {
    case Family.ACT:
    case Family.REACTION:
    case Family.STATE:
      return true;
    case Family.TABLE_ANSWER:
      return act.verb === 'speak';
    default:
      return false;
  }
}
