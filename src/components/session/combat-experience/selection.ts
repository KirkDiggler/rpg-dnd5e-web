import {
  TargetKind,
  type Declaration,
  type Shortfall,
  type TargetCandidate,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CombatExperiencePresentationState } from './types';

/** Safe copy for an offer rejected because the authoritative offer changed. */
export const STALE_DECLARATION_MESSAGE =
  'That option changed; review your current actions.';

/**
 * Adds provider-authored refusal copy when one is present. Nothing parses or
 * synthesizes a reason from a selector, verb, slot, or candidate.
 */
export function staleDeclarationMessage(why?: Shortfall): string {
  return why?.text
    ? `${STALE_DECLARATION_MESSAGE} ${why.text}`
    : STALE_DECLARATION_MESSAGE;
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
