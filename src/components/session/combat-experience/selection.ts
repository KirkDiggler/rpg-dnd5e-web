import { Code, ConnectError } from '@connectrpc/connect';
import {
  TargetKind,
  Verb,
  type Declaration,
  type Shortfall,
  type TargetCandidate,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CombatExperiencePresentationState } from './types';

/** Safe copy for an offer rejected because the authoritative offer changed. */
export const STALE_DECLARATION_MESSAGE =
  'That option changed; review your current actions.';

/** Selector-bearing session verbs use FAILED_PRECONDITION for stale offers. */
export function isStaleDeclarationRefusal(error: unknown): boolean {
  return ConnectError.from(error).code === Code.FailedPrecondition;
}

/**
 * Adds provider-authored refusal copy when one is present. Nothing parses or
 * synthesizes a reason from a selector, verb, slot, or candidate.
 */
export function staleDeclarationMessage(why?: Shortfall): string {
  return why?.text
    ? `${STALE_DECLARATION_MESSAGE} ${why.text}`
    : STALE_DECLARATION_MESSAGE;
}

/**
 * This turn's movement budget in feet, read from the one MOVE declaration
 * that reports it.
 *
 * Deliberately `undefined` unless EXACTLY ONE MOVE declaration is present.
 * Two of them would mean two budgets and no way to know which the map's hover
 * is spending; no answer beats an arbitrary one. `undefined` also covers the
 * ordinary cases — free roam, another member's turn — where there is no MOVE
 * row at all.
 *
 * A present `remaining` of 0 is a real answer (no feet left) and is returned
 * as 0, never folded into `undefined`: that distinction is the whole reason
 * the field is `optional` on the wire.
 */
export function movementBudgetFeet(
  declarations: readonly Declaration[]
): number | undefined {
  const moves = declarations.filter(
    (declaration) => declaration.verb === Verb.MOVE
  );
  return moves.length === 1 ? moves[0]?.remaining : undefined;
}

export interface SelectedCombatExperience {
  /** Exact generated offer only when its own availability fact permits selection. */
  declaration: Declaration | null;
  /** Exact generated member only when both offer and candidate are available. */
  candidate: TargetCandidate | null;
  /** Provider-authored refusal text selected by precedence, or no copy. */
  whyText: string | null;
}

/**
 * Resolves local presentation state back to generated provider facts.
 *
 * The selector is compared as opaque text and never parsed. Target shape comes
 * from the declaration's generated `targetKind`: only MEMBER declarations
 * select a candidate; PATH and NONE keep their provider messages unchanged and
 * do not manufacture a target shape. Availability remains on the generated
 * declaration/candidate rather than being normalized into another rules flag.
 */
export function selectCombatExperience(
  declarations: readonly Declaration[],
  state: CombatExperiencePresentationState
): SelectedCombatExperience | null {
  if (state.armedDeclarationId === null) return null;

  const declarationMatches = declarations.filter(
    (candidate) => candidate.id === state.armedDeclarationId
  );
  if (declarationMatches.length !== 1) return null;
  const declaration = declarationMatches[0]!;
  if (!declaration.id) return null;

  // Death Save is selector-bearing but deliberately has no target mode. Its
  // dedicated identity and fixed NONE shape must agree before this exact
  // declaration can become executable; no HP/life/progress fallback exists.
  if (
    declaration.verb === Verb.DEATH_SAVE &&
    (declaration.targetKind !== TargetKind.NONE ||
      declaration.deathSave === undefined ||
      declaration.candidates.length !== 0)
  ) {
    return null;
  }

  let candidate: TargetCandidate | null = null;
  if (
    declaration.targetKind === TargetKind.MEMBER &&
    state.selectedCandidateMember !== null
  ) {
    const candidateMatches = declaration.candidates.filter(
      (target) => target.member === state.selectedCandidateMember
    );
    if (candidateMatches.length !== 1) return null;
    candidate = candidateMatches[0]!;
    if (!candidate.member) return null;
  }

  if (!declaration.available) {
    return {
      declaration: null,
      candidate: null,
      whyText: declaration.why?.text ?? null,
    };
  }

  if (candidate && !candidate.available) {
    return {
      declaration,
      candidate: null,
      whyText: candidate.why?.text ?? null,
    };
  }

  return { declaration, candidate, whyText: null };
}
