/**
 * clickToAct — what a click on a creature can DO, read off the server's
 * offers (rpg-project#872). Pure, so the hover, the menu and the click are
 * one decision, testable without a canvas.
 *
 * D1 ATTACK, ONLY WHEN IN REACH THIS TURN. The Attack the server offers
 * answers, per candidate, whether he is in reach now (`available`) or where
 * the attacker's own walk this turn stops in reach (`approach`, D4). The web
 * reads those two facts and nothing else: no weapon reach, no movement
 * budget, no path price is derived here. A hostile the offer neither reaches
 * nor walks to reads "Out of reach", and its click does nothing.
 *
 * D3 MORE THAN ONE THING TO DO. The verbs are only those the server offers
 * for that creature: Attack (a hostile on the Attack row), Speak (the Speak
 * row lists him with a line), and the bump (a blocking body on the move
 * picker, rpg-project#835 R8). One verb acts at once; more than one shows the
 * choices, with an out-of-reach Attack shown disabled.
 *
 * D2 THE DIAL. Off, no verbs are computed at all and a click on a creature
 * behaves exactly as before this module existed.
 */
import {
  ShortfallReason,
  Slot,
  TargetKind,
  Verb,
  type Declaration,
  type Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { speakTargetsOf } from './combat-experience/speakOptions';
import type { SightedMember } from './sightingEntities';
import { STANCE_HOSTILE } from './stanceRing';

/** What the Attack row says about one candidate. */
export type AttackReach =
  /** In reach now: the click swings at once. */
  | { kind: 'in-reach'; declaration: Declaration }
  /** Out of reach, and this cell is where the server says this turn's walk
   * stops within reach of him. */
  | { kind: 'approach'; declaration: Declaration; cell: Position }
  /** Out of reach, and no walk this turn reaches him. */
  | { kind: 'out-of-reach' };

/**
 * An Attack row whose answer is about REACH: available, or disabled only
 * because nobody is in reach. A row refused for anything else (not this
 * member's turn, no action left, downed) says nothing about reach, so it
 * offers no Attack verb at all and the click behaves as before.
 */
function reachRow(declaration: Declaration): boolean {
  return (
    declaration.verb === Verb.ATTACK &&
    declaration.targetKind === TargetKind.MEMBER &&
    declaration.id.length > 0 &&
    (declaration.available ||
      declaration.why?.reason === ShortfallReason.NO_TARGET_IN_REACH)
  );
}

/** The action-slot swing first, then the server's own order. */
function bySlot(a: Declaration, b: Declaration): number {
  return Number(b.slot === Slot.ACTION) - Number(a.slot === Slot.ACTION);
}

/**
 * The Attack row's answer for `subject`, or null when no Attack row speaks to
 * his reach. In reach beats a walk; a walk beats out of reach. Among several
 * rows (a main hand and an off hand) the action slot is preferred.
 */
export function attackReachFor(
  declarations: readonly Declaration[],
  subject: string
): AttackReach | null {
  const rows = declarations.filter(reachRow).sort(bySlot);
  let approach: AttackReach | null = null;
  let named = false;
  for (const declaration of rows) {
    const matches = declaration.candidates.filter(
      (candidate) => candidate.member === subject
    );
    if (matches.length !== 1) continue;
    const candidate = matches[0]!;
    named = true;
    if (declaration.available && candidate.available) {
      return { kind: 'in-reach', declaration };
    }
    if (!approach && !candidate.available && candidate.approach) {
      approach = { kind: 'approach', declaration, cell: candidate.approach };
    }
  }
  if (approach) return approach;
  return named ? { kind: 'out-of-reach' } : null;
}

/** The members the Speak row lists with at least one line. */
export function speakListedMembers(
  declarations: readonly Declaration[]
): ReadonlySet<string> {
  const listed = new Set<string>();
  for (const declaration of declarations) {
    if (
      declaration.verb !== Verb.SPEAK ||
      !declaration.available ||
      declaration.id.length === 0
    )
      continue;
    for (const target of speakTargetsOf(declaration)) {
      if (target.case === 'memberId') listed.add(target.value);
    }
  }
  return listed;
}

export type CreatureVerb =
  | { verb: 'attack'; reach: AttackReach['kind'] }
  | { verb: 'speak' }
  | { verb: 'bump' };

export interface CreatureVerbsArgs {
  member: SightedMember | undefined;
  /** The Attack row's answer for him (`attackReachFor`). */
  attack: AttackReach | null;
  /** The Speak row lists him with a line. */
  speakListed: boolean;
  /** A click on him is the bump today (`targetClickIntent`'s own rule). */
  bumpable: boolean;
}

/**
 * The verbs a click on this creature offers, in menu order. Only a live
 * sighting offers any: a memory is where he WAS. Attack is offered only
 * against a hostile, as the card asks ("a click on a hostile").
 */
export function creatureVerbs(args: CreatureVerbsArgs): CreatureVerb[] {
  const { member } = args;
  if (!member || member.remembered) return [];
  const verbs: CreatureVerb[] = [];
  if (args.attack && member.stance === STANCE_HOSTILE) {
    verbs.push({ verb: 'attack', reach: args.attack.kind });
  }
  if (args.speakListed) verbs.push({ verb: 'speak' });
  if (args.bumpable) verbs.push({ verb: 'bump' });
  return verbs;
}

/** What one click does with the verbs on offer. */
export type CreatureClick = 'none' | 'menu' | 'strike' | 'speak' | 'bump';

export function creatureClick(verbs: readonly CreatureVerb[]): CreatureClick {
  if (verbs.length === 0) return 'none';
  if (verbs.length > 1) return 'menu';
  const only = verbs[0]!;
  if (only.verb === 'attack')
    return only.reach === 'out-of-reach' ? 'none' : 'strike';
  return only.verb;
}

/** The words a verb reads as, on the hover and in the menu. */
export function verbLabel(verb: CreatureVerb, name: string): string {
  switch (verb.verb) {
    case 'attack':
      return verb.reach === 'out-of-reach' ? 'Out of reach' : `Attack ${name}`;
    case 'speak':
      return `Speak to ${name}`;
    case 'bump':
      return `Walk up to ${name}`;
  }
}

/** Whether a verb can be chosen: an out-of-reach Attack cannot. */
export function verbEnabled(verb: CreatureVerb): boolean {
  return !(verb.verb === 'attack' && verb.reach === 'out-of-reach');
}

/** The server's offers a canvas reads to decide a creature click. */
export interface ClickToActOffers {
  attackReach: ReadonlyMap<string, AttackReach>;
  speakListed: ReadonlySet<string>;
}

/** Every Attack candidate's answer and every Speak-listed member, once. */
export function clickToActOffers(
  declarations: readonly Declaration[]
): ClickToActOffers {
  const attackReach = new Map<string, AttackReach>();
  for (const declaration of declarations) {
    if (!reachRow(declaration)) continue;
    for (const candidate of declaration.candidates) {
      if (attackReach.has(candidate.member)) continue;
      const reach = attackReachFor(declarations, candidate.member);
      if (reach) attackReach.set(candidate.member, reach);
    }
  }
  return { attackReach, speakListed: speakListedMembers(declarations) };
}
