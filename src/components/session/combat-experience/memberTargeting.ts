import {
  TargetKind,
  Verb,
  type Declaration,
  type TargetCandidate,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { promptsForMember } from './verbRegistry';

export interface MemberTargetingInput {
  declaration?: Declaration;
  selectedMembers: readonly string[];
  authorityFresh: boolean;
  turnAllowed: boolean;
  optionId?: string | null;
}
export interface SelectedMemberView {
  member: string;
  candidate?: TargetCandidate;
  valid: boolean;
  reason?: string;
}
export interface MemberTargetingView {
  memberTargeted: boolean;
  multi: boolean;
  availableMembers: readonly string[];
  selected: readonly SelectedMemberView[];
  canChoose: boolean;
  canConfirm: boolean;
  reason: string | null;
  selectionProblem: string | null;
}

export function isMultiMemberDeclaration(
  declaration: Declaration | undefined
): boolean {
  return Boolean(
    declaration &&
    declaration.targetKind === TargetKind.MEMBER &&
    promptsForMember(declaration.verb) &&
    declaration.maxTargets > 1
  );
}

/** Provider membership and bounds only; no spell identity, side, range or rule math. */
export function memberTargetingView(
  input: MemberTargetingInput
): MemberTargetingView {
  const { declaration, selectedMembers, authorityFresh, turnAllowed } = input;
  const memberTargeted = Boolean(
    declaration &&
    declaration.targetKind === TargetKind.MEMBER &&
    promptsForMember(declaration.verb)
  );
  const multi = isMultiMemberDeclaration(declaration);
  // Existing scalar member verbs have no list cardinality (0/0). CAST and any
  // explicitly bounded list must provide a usable shape; min=0 remains zero.
  const usesBounds =
    declaration &&
    (declaration.verb === Verb.CAST ||
      declaration.minTargets !== 0 ||
      declaration.maxTargets !== 0);
  const validBounds =
    !usesBounds ||
    (declaration.minTargets >= 0 &&
      declaration.maxTargets >= 1 &&
      declaration.minTargets <= declaration.maxTargets);
  const optionMatches =
    declaration?.options.filter((option) => option.id === input.optionId) ?? [];
  const validOption =
    !declaration?.options.length ||
    (optionMatches.length === 1 &&
      Boolean(optionMatches[0]?.id && optionMatches[0]?.label.trim()));
  const reason =
    !declaration || !declaration.id
      ? 'This action is no longer available'
      : !authorityFresh
        ? 'Actions may be out of date'
        : !turnAllowed
          ? 'Wait for your turn'
          : !declaration.available
            ? declaration.why?.text || 'Action unavailable'
            : !memberTargeted
              ? 'This action does not choose creatures'
              : !validBounds
                ? 'Target limits are unavailable'
                : !validOption
                  ? 'Choose a current cast option'
                  : null;
  const unique = [...new Set(selectedMembers)];
  const selected = unique.map((member): SelectedMemberView => {
    const matches =
      declaration?.candidates.filter(
        (candidate) => candidate.member === member
      ) ?? [];
    const candidate = matches.length === 1 ? matches[0] : undefined;
    const valid = Boolean(member && candidate?.available);
    return {
      member,
      candidate,
      valid,
      reason: valid
        ? undefined
        : matches.length > 1
          ? 'Target information is ambiguous'
          : !candidate
            ? 'No longer offered'
            : candidate.why?.text || 'Unavailable',
    };
  });
  const selectionProblem =
    unique.length !== selectedMembers.length
      ? 'Review duplicate target selections'
      : selected.some((target) => !target.valid)
        ? 'Remove unavailable selections before continuing'
        : null;
  const canChoose = reason === null;
  const availableMembers = canChoose
    ? declaration!.candidates
        .filter(
          (candidate) =>
            candidate.member &&
            candidate.available &&
            declaration!.candidates.filter(
              (other) => other.member === candidate.member
            ).length === 1
        )
        .map((candidate) => candidate.member)
    : [];
  return {
    memberTargeted,
    multi,
    availableMembers,
    selected,
    canChoose,
    reason,
    selectionProblem,
    canConfirm: Boolean(
      multi &&
      canChoose &&
      !selectionProblem &&
      unique.length >= declaration!.minTargets &&
      unique.length <= declaration!.maxTargets
    ),
  };
}

/** Local deselection remains possible after a withdrawal or loss of authority. */
export function toggleMemberTarget(
  input: MemberTargetingInput,
  member: string
): { members: readonly string[]; changed: boolean; refusal: string | null } {
  if (input.selectedMembers.includes(member))
    return {
      members: input.selectedMembers.filter((id) => id !== member),
      changed: true,
      refusal: null,
    };
  const view = memberTargetingView(input);
  const refusal =
    view.reason ??
    view.selectionProblem ??
    (!view.availableMembers.includes(member)
      ? 'This target is not available'
      : view.multi && view.selected.length >= input.declaration!.maxTargets
        ? 'Target limit reached'
        : null);
  if (refusal)
    return { members: input.selectedMembers, changed: false, refusal };
  return {
    members: view.multi ? [...input.selectedMembers, member] : [member],
    changed: true,
    refusal: null,
  };
}
