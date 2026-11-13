import { Code, ConnectError } from '@connectrpc/connect';
import {
  TargetKind,
  Verb,
  type Declaration,
  type Shortfall,
  type TargetCandidate,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { cameThroughFriend } from '../sharedVia';
import { isDeathSaveExecutableShape } from './deathSaveDeclaration';
import type { CombatExperiencePresentationState } from './types';

/** Safe copy for an offer rejected because the authoritative offer changed. */
export const STALE_DECLARATION_MESSAGE =
  'That option changed; review your current actions.';

/**
 * A stale offer (rpg-project#925, rpg-api#1238): every act verb's stale
 * selector is ABORTED, as Speak's stale option already was. Keyed on the
 * code alone, never on the message. FAILED_PRECONDITION is a session refusal
 * with a sentence for the player (`refusalNotice`), never a stale offer.
 */
export function isStaleDeclarationRefusal(error: unknown): boolean {
  return ConnectError.from(error).code === Code.Aborted;
}

/**
 * The notice for a refused act: a session refusal (FAILED_PRECONDITION)
 * reads as the server wrote it — "Guard bars the way", "The guards hold you;
 * you cannot walk away." — from `rawMessage`, with no "[code] " prefix and
 * no verb in front. Anything else (a dropped connection, an internal error)
 * keeps "<Verb> failed: …" so it is never mistaken for the game's word.
 */
export function isSentenceRefusal(error: unknown): boolean {
  return ConnectError.from(error).code === Code.FailedPrecondition;
}

export function refusalNotice(verb: string, error: unknown): string {
  const refused = ConnectError.from(error);
  if (isSentenceRefusal(refused) && refused.rawMessage)
    return refused.rawMessage;
  return `${verb} failed: ${refused.rawMessage || 'unknown error'}`;
}

/** The quiet notice for a reply the shared conversation moved past. */
export const CONVERSATION_MOVED_ON_MESSAGE =
  'The conversation moved on — pick again.';

/** The notice for a waiting roll its speaker walked away from (rpg-project#938). */
export const ROLL_KEPT_MESSAGE =
  'You walked away: your roll stands, your die is kept.';

/**
 * Whether an act is the viewer's own waiting line judged as rolled because
 * they walked away from it (rpg-project#938): the viewer's own Speech
 * arriving inside an act that is neither their Speak nor their answer to the
 * roll — the walk (or any later verb) whose commit settled the kept roll.
 * A line said or answered in the ordinary way arrives in a `speak` or a
 * `react` act and is not this.
 */
export function isKeptRollAct(act: Act, viewer: string): boolean {
  if (act.verb === '' || act.verb === 'speak' || act.verb === 'react')
    return false;
  // The viewer's own Speech, with its roll, inside another verb's act
  // (rpg-project#934).
  // The viewer's own roll, never one shown through a friend (rpg-project#935).
  return (
    act.body.case === 'speech' &&
    act.body.value.speaker?.id === viewer &&
    act.body.value.roll !== undefined &&
    !cameThroughFriend(act, viewer)
  );
}

/**
 * A reply or a roll answer the shared interaction moved past (rpg-project#924):
 * Speak with a revision the conversation has advanced beyond, or React on a
 * roll whose hold is gone. Nothing was spent; it is not an error, and the
 * caller re-reads the offer rather than reporting a failure.
 */
export function isMovedOnRefusal(error: unknown): boolean {
  return ConnectError.from(error).code === Code.Aborted;
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
  /** Ordered CAST candidates, copied from the provider's candidate universe. */
  selectedCandidates?: readonly TargetCandidate[];
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
    !isDeathSaveExecutableShape(declaration, 'display')
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

  const selectedCandidates: TargetCandidate[] = [];
  if (declaration.verb === Verb.CAST) {
    const selectedMembers = state.selectedCandidateMembers ?? [];
    if (new Set(selectedMembers).size !== selectedMembers.length) return null;
    for (const member of selectedMembers) {
      const matches = declaration.candidates.filter(
        (target) => target.member === member
      );
      if (matches.length !== 1 || !matches[0]?.member) return null;
      selectedCandidates.push(matches[0]);
    }
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
  const unavailableSelected = selectedCandidates.find(
    (selected) => !selected.available
  );
  if (unavailableSelected) {
    return {
      declaration,
      candidate: null,
      whyText: unavailableSelected.why?.text ?? null,
    };
  }

  return selectedCandidates.length > 0
    ? { declaration, candidate, selectedCandidates, whyText: null }
    : { declaration, candidate, whyText: null };
}
