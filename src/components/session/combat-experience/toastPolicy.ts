/**
 * toastPolicy — which acts toast, for whom, and for how long
 * (rpg-dnd5e-web#1301, the operator's toast checklist, comment 6321441495).
 *
 * EACH RULE IS A NAMED CASE THE OPERATOR CAN VETO. A toast fires only when an
 * act matches one of the cases below, and the case it matched rides on the
 * toast so a vetoed case is one line to delete here:
 *
 * | case                  | checklist box                         |
 * |-----------------------|---------------------------------------|
 * | `own-outcome`         | "your own outcomes"                   |
 * | `done-to-you`         | "things done to you": an attack, a    |
 * |                       | cast or an activation's result aimed  |
 * |                       | at you, a save forced on you, a state |
 * |                       | change on you                         |
 * | `your-window`         | "a window opening for you"            |
 * | `fight-formed`        | "a fight forming or ending", the      |
 * | `fight-ended`         | viewer's own fight only               |
 * | `answer-to-your-line` | "a line spoken to you", as changed by |
 * |                       | the operator: a creature's answer to  |
 * |                       | your own line                         |
 *
 * NEVER: a walk, another's miss, a table pick, a perception. Those match no
 * case, so they stay in the log.
 *
 * The policy reads the act and who is looking; it decides no rule of the
 * game. A toast is the describer's one line (`describeAct(...).text`).
 */
import {
  ClockMark,
  Family,
  type Act,
  type Party,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

export type ToastCase =
  | 'own-outcome'
  | 'done-to-you'
  | 'your-window'
  | 'fight-formed'
  | 'fight-ended'
  | 'answer-to-your-line';

export interface ToastRule {
  /** The named, vetoable case this toast fired under. */
  readonly case: ToastCase;
  /**
   * Fired while a fight is formed: it holds until the viewer's next act
   * arrives rather than running a timer.
   */
  readonly hold: boolean;
}

/** The time on screen: 2.5 s plus 60 ms per character, between 3 and 9 s. */
export const TOAST_BASE_MS = 2500;
export const TOAST_PER_CHAR_MS = 60;
export const TOAST_MIN_MS = 3000;
export const TOAST_MAX_MS = 9000;

export function toastDurationMs(text: string): number {
  const raw = TOAST_BASE_MS + TOAST_PER_CHAR_MS * text.length;
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, raw));
}

/** The party who did an act-family or reaction entry, or undefined. */
export function actorOf(act: Act): Party | undefined {
  const body = act.body;
  switch (body.case) {
    case 'walk':
      return body.value.mover;
    case 'stay':
      return body.value.member;
    case 'attack':
    case 'cast':
    case 'activate':
    case 'speak':
    case 'deathSave':
    case 'loot':
    case 'hold':
    case 'drop':
    case 'door':
    case 'equip':
    case 'sneak':
    case 'rest':
      return body.value.by;
    default:
      return undefined;
  }
}

/** A deed: an act-family entry or a reaction. */
export function isDeed(act: Act): boolean {
  return act.family === Family.ACT || act.family === Family.REACTION;
}

/** Whether an act's body states an outcome or carries a roll. */
function carriesOutcome(act: Act): boolean {
  const body = act.body;
  switch (body.case) {
    case 'attack':
    case 'deathSave':
    case 'rest':
      return true;
    case 'cast':
      return body.value.results.length > 0;
    case 'activate':
      return body.value.results.length > 0 || body.value.saves.length > 0;
    case 'speak':
      return Boolean(body.value.roll || body.value.answer);
    case 'door':
    case 'sneak':
      return Boolean(body.value.roll);
    default:
      return false;
  }
}

/** Whether a deed was done to `member`: struck or missed, saved against. */
function doneTo(act: Act, member: string): boolean {
  const body = act.body;
  switch (body.case) {
    case 'attack':
      return body.value.to?.id === member;
    case 'cast':
      return body.value.results.some((r) => r.target?.id === member);
    case 'activate':
      // A save an ability forces on you (a Frightful Presence), or a result
      // that lands on you.
      return (
        body.value.saves.some((s) => s.saver?.id === member) ||
        body.value.results.some((r) => r.target?.id === member)
      );
    default:
      return false;
  }
}

/**
 * Whether a fight's forming or ending names `member`: its initiative order
 * when it forms, its members when it dissolves. A dissolve that names no
 * members is read as including everyone.
 */
export function fightIncludes(act: Act, member: string): boolean {
  if (act.body.case !== 'clock' || !member) return false;
  const c = act.body.value;
  switch (c.mark) {
    case ClockMark.FIGHT_FORMED:
      return (c.fight?.order ?? []).some((p) => p.id === member);
    case ClockMark.FIGHT_DISSOLVED: {
      const members = c.dissolved?.members ?? [];
      return members.length === 0 || members.some((p) => p.id === member);
    }
    case ClockMark.TURN_ENDED:
      return c.turn?.member?.id === member || c.turn?.next?.id === member;
    default:
      return false;
  }
}

/** Whether a clock entry opens a window whose audience is `member`. */
function windowFor(act: Act, member: string): boolean {
  if (act.body.case !== 'clock') return false;
  const c = act.body.value;
  switch (c.mark) {
    case ClockMark.WINDOW_OPENED:
      return (c.window?.windows ?? []).some((w) => w.audience?.id === member);
    case ClockMark.ROLL_WINDOW_OPENED:
      return c.rollWindow?.audience?.id === member;
    default:
      return false;
  }
}

/**
 * The case an act toasts under for `member`, or null when it stays in the log.
 *
 * `inFight` is whether a fight is formed once this act has landed; a toast
 * fired then holds. `lineSpokenBy` is who spoke the line this act answers,
 * when it is a speak's own table answer (the same act tag as the line).
 */
export function toastFor(
  act: Act,
  member: string,
  inFight: boolean,
  lineSpokenBy?: string
): ToastRule | null {
  const matched = toastCase(act, member, lineSpokenBy);
  return matched ? { case: matched, hold: inFight } : null;
}

function toastCase(
  act: Act,
  member: string,
  lineSpokenBy: string | undefined
): ToastCase | null {
  if (act.refused || !member) return null;
  switch (act.family) {
    case Family.ACT:
    case Family.REACTION:
      if (actorOf(act)?.id === member && carriesOutcome(act))
        return 'own-outcome';
      if (doneTo(act, member)) return 'done-to-you';
      return null;
    case Family.STATE:
      return act.body.case === 'state' && act.body.value.party?.id === member
        ? 'done-to-you'
        : null;
    case Family.CLOCK: {
      if (act.body.case !== 'clock') return null;
      const mark = act.body.value.mark;
      // Only the viewer's own fight: another fight is not news to them.
      if (mark === ClockMark.FIGHT_FORMED)
        return fightIncludes(act, member) ? 'fight-formed' : null;
      if (mark === ClockMark.FIGHT_DISSOLVED)
        return fightIncludes(act, member) ? 'fight-ended' : null;
      return windowFor(act, member) ? 'your-window' : null;
    }
    case Family.TABLE_ANSWER:
      // A table pick never toasts; only a creature's answer to the viewer's
      // own line does (the operator's change to "a line spoken to you").
      return act.verb === 'speak' && lineSpokenBy === member
        ? 'answer-to-your-line'
        : null;
    default:
      return null; // perception: what one observer saw is not news
  }
}
