/**
 * Local interaction/presentation state for the combat experience.
 *
 * Provider facts stay in their generated `Declaration`, `Participant`, and
 * `CharacterData` messages. This state records only what the player has armed,
 * which presented member they selected, and transient changed-option copy.
 */
export interface CombatExperiencePresentationState {
  armedDeclarationId: string | null;
  selectedCandidateMember: string | null;
  changedOptionNotice: string | null;
}
