/**
 * reactionWindow — reading the one declaration that interrupts the fight.
 *
 * An open reaction window reaches the client as a declaration like every
 * other thing the viewer may do (ADR-0042): `VERB_REACT`, `available: true`,
 * `reaction` naming which reaction is on offer. Nothing here decides whether a
 * window is open — that is Afford's answer, and this only reads it.
 *
 * IT IS DELIBERATELY NOT THE VERB ALONE. Afford compiles at most one open
 * window per member today, but a declaration that arrives unavailable, or
 * without the reaction identity the panel's eyebrow is written from, is not
 * something the dock can pose a question about; those are skipped rather than
 * drawn half-formed.
 *
 * TWO KINDS OF WINDOW SHARE THIS VERB (rpg-project#398). The movement window
 * asks about somebody else's step and names them as its single candidate. The
 * post-roll window asks about the viewer's OWN d20, which is a fact about no
 * board cell and no other member, so Afford poses it with `TARGET_KIND_NONE`
 * and no candidates. The kind is read off that shape rather than off the
 * reaction's ref: a ref table here would go stale the first time a second
 * reaction used either shape.
 */
import {
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * Which question the window is asking.
 *
 * `movement` — somebody is leaving your reach, and the answer is a swing.
 * `roll` — your own d20 is on the table and you hold something spendable on
 * it; the answer is whether to spend it.
 */
export type ReactionWindowKind = 'movement' | 'roll';

/** The viewer's open reaction window, or undefined when none is posed. */
export function reactionWindowDeclaration(
  declarations: readonly Declaration[]
): Declaration | undefined {
  return declarations.find(
    (declaration) =>
      declaration.verb === Verb.REACT &&
      declaration.available &&
      declaration.reaction !== undefined &&
      (declaration.targetKind === TargetKind.MEMBER ||
        declaration.targetKind === TargetKind.NONE)
  );
}

/**
 * Movement or post-roll, read off the declaration's own target shape.
 *
 * FAIL CLOSED TOWARD THE ROLL WINDOW'S SHAPE IS WRONG, so it is not what
 * happens: only `TARGET_KIND_MEMBER` is the movement window, because that is
 * the only shape carrying a mover to name and ring. Anything else is the
 * question that names nobody.
 */
export function reactionWindowKind(
  declaration: Declaration
): ReactionWindowKind {
  return declaration.targetKind === TargetKind.MEMBER ? 'movement' : 'roll';
}

/**
 * Who is moving — the member the reaction would answer.
 *
 * READ OFF THE CANDIDATES, never off the beat. `WindowOpened` names the mover
 * too, but the dock draws from Afford and only from Afford; taking the id from
 * a passing event would make the panel and the ring disagree the moment one
 * arrived without the other.
 *
 * UNDEFINED IS THE HONEST ANSWER FOR A POST-ROLL WINDOW. It has no mover, so
 * there is nobody to name and nobody to ring — see `SessionCanvas`.
 */
export function reactionWindowMover(
  declaration: Declaration
): string | undefined {
  return declaration.candidates.find((candidate) => candidate.member)?.member;
}

/** What the two buttons say. */
export interface ReactionWindowAnswers {
  /** `ReactChoice.STRIKE` — take what is on offer. */
  take: string;
  /** `ReactChoice.HOLD` — let it pass, at no cost. */
  decline: string;
  /** The glyph on the take button's sibling, the decline one. */
  declineIcon: string;
}

/**
 * The words on the two answers, as a function of the WINDOW KIND.
 *
 * The choice enum is `STRIKE | HOLD` on the wire and stays that way — renaming
 * an enum value is a source break for every client, bought for a word the
 * player never sees (post-roll design R6). What the player reads is written
 * here, because the two answers are not labels the server sends: the verb
 * implies them. "Strike" and "Hold" are a swing's words and would read as
 * nonsense over a d20 the viewer already rolled.
 */
export function reactionWindowAnswers(
  kind: ReactionWindowKind
): ReactionWindowAnswers {
  return kind === 'movement'
    ? { take: 'Strike', decline: 'Hold', declineIcon: '✋' }
    : { take: 'Spend', decline: 'Keep', declineIcon: '✋' };
}
