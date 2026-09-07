/**
 * reactionWindow — reading the one declaration that interrupts the fight.
 *
 * An open reaction window reaches the client as a declaration like every
 * other thing the viewer may do (ADR-0042): `VERB_REACT`, `available: true`,
 * `reaction` naming which reaction is on offer, and `candidates` carrying the
 * mover as its single member row. Nothing here decides whether a window is
 * open — that is Afford's answer, and this only reads it.
 *
 * IT IS DELIBERATELY NOT THE VERB ALONE. Afford compiles at most one open
 * window per member today, but a declaration that arrives unavailable, or
 * without the reaction identity the panel's eyebrow is written from, is not
 * something the dock can pose a question about; those are skipped rather than
 * drawn half-formed.
 */
import {
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** The viewer's open reaction window, or undefined when none is posed. */
export function reactionWindowDeclaration(
  declarations: readonly Declaration[]
): Declaration | undefined {
  return declarations.find(
    (declaration) =>
      declaration.verb === Verb.REACT &&
      declaration.available &&
      declaration.targetKind === TargetKind.MEMBER &&
      declaration.reaction !== undefined
  );
}

/**
 * Who is moving — the member the reaction would answer.
 *
 * READ OFF THE CANDIDATES, never off the beat. `WindowOpened` names the mover
 * too, but the dock draws from Afford and only from Afford; taking the id from
 * a passing event would make the panel and the ring disagree the moment one
 * arrived without the other.
 */
export function reactionWindowMover(
  declaration: Declaration
): string | undefined {
  return declaration.candidates.find((candidate) => candidate.member)?.member;
}
