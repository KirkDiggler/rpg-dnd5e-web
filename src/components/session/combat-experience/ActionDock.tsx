import {
  ClockKind,
  Slot,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import styles from './CombatExperience.module.css';

function slotLabel(slot: Slot): string {
  switch (slot) {
    case Slot.ACTION:
      return 'Action';
    case Slot.BONUS:
      return 'Bonus action';
    case Slot.REACTION:
      return 'Reaction';
    case Slot.NONE:
      return 'No turn slot';
    default:
      return 'Provider slot unavailable';
  }
}

function CostBadge({ slot }: { slot: Slot }) {
  const label = slotLabel(slot);
  const mark =
    slot === Slot.ACTION
      ? 'A'
      : slot === Slot.BONUS
        ? 'B'
        : slot === Slot.REACTION
          ? 'R'
          : '◇';
  return (
    <span
      className={styles.costBadge}
      data-cost={label.toLowerCase().replaceAll(' ', '-')}
      title={label}
      aria-label={label}
    >
      {mark}
    </span>
  );
}

function declarationLabel(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK) {
    return declaration.attack?.name || 'Attack';
  }
  if (declaration.verb === Verb.ACTIVATE) {
    // The server authors the label. There is deliberately no ref-to-name table
    // here: "Rage" is what the ability calls itself, and a client that mapped
    // refs to names would go stale the first time one was renamed.
    return declaration.ability?.name || 'Ability';
  }
  return 'Move';
}

function declarationIcon(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK) return '⚔';
  if (declaration.verb === Verb.ACTIVATE) return '✦';
  return '➜';
}

function ActionDeclaration({
  declaration,
  armed,
  authorityFresh,
  onSelect,
}: {
  declaration: Declaration;
  armed: boolean;
  authorityFresh: boolean;
  onSelect: (declaration: Declaration) => void;
}) {
  const label = declarationLabel(declaration);
  const context =
    declaration.verb === Verb.ATTACK
      ? declaration.attack?.ref
      : declaration.remaining !== undefined
        ? `${declaration.remaining} ft remaining`
        : undefined;
  const unavailable = declaration.why?.text || 'Unavailable';

  return (
    <button
      type="button"
      className={`${styles.actionOffer} ${armed ? styles.actionOfferArmed : ''}`}
      disabled={!authorityFresh || !declaration.available}
      title={
        !authorityFresh
          ? 'Actions may be out of date'
          : declaration.available
            ? context
            : unavailable
      }
      aria-pressed={armed}
      onClick={() => onSelect(declaration)}
    >
      <span className={styles.actionIcon} aria-hidden="true">
        {declarationIcon(declaration)}
      </span>
      <span className={styles.actionLabel}>
        {label}
        {declaration.verb === Verb.MOVE &&
          declaration.remaining !== undefined && (
            <small>{declaration.remaining} ft</small>
          )}
      </span>
      <CostBadge slot={declaration.slot} />
      {!declaration.available && (
        <span className={styles.semanticOnly}>Unavailable: {unavailable}</span>
      )}
    </button>
  );
}

export interface ActionDockProps {
  clock: ClockKind;
  viewerMember: string;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  authorityFresh: boolean;
  armedDeclarationId?: string;
  onSelectDeclaration: (declaration: Declaration) => void;
  onEndTurn: (declaration: Declaration) => void;
}

// exactlyOne is CORRECT ONLY FOR END TURN, and would be a bug anywhere else
// now that a verb can compile many offers. End Turn compiles exactly one, so
// "more than one" there really is a producer defect. VERB_ACTIVATE routinely
// has six; ask for those by id, never by verb.
function exactlyOne(
  declarations: readonly Declaration[],
  verb: Verb
): Declaration | undefined {
  const matches = declarations.filter(
    (declaration) => declaration.verb === verb
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function ActionDock({
  clock,
  viewerMember,
  participants,
  declarations,
  authorityFresh,
  armedDeclarationId,
  onSelectDeclaration,
  onEndTurn,
}: ActionDockProps) {
  if (clock === ClockKind.WORLD) {
    return (
      <div className={styles.passiveActionRow}>
        <span>Exploration</span>
        <strong>
          {authorityFresh
            ? 'Click the floor to move'
            : 'Actions may be out of date'}
        </strong>
        <small>
          {authorityFresh
            ? 'No turn economy on the world clock.'
            : 'Waiting for current Turn and Afford authority.'}
        </small>
      </div>
    );
  }
  if (clock !== ClockKind.TURN) {
    return (
      <div className={styles.passiveActionRow}>
        <span>Synchronizing</span>
        <strong>Actions are not ready</strong>
        <small>Waiting for coherent Turn and Afford authority.</small>
      </div>
    );
  }

  const activeParticipant = participants.find(
    (participant) => participant.active
  );
  if (!activeParticipant || activeParticipant.member !== viewerMember) {
    return (
      <div className={styles.passiveActionRow}>
        <span>Watching</span>
        <strong>
          {activeParticipant?.name ?? 'Another participant'}’s turn
        </strong>
        <small>Your commands return when the initiative reaches you.</small>
      </div>
    );
  }

  // ALL OF THEM NOW. Help was held back while its declaration said
  // TARGET_KIND_MEMBER and carried no candidate universe — a control nothing
  // could drive. rpg-toolkit#1274 gave it one, so the client no longer has to
  // decline to draw anything, which is the state this filter should always be
  // in: the server decides what is offered, and the dock draws it.
  const executableDeclarations = declarations.filter(
    (declaration) =>
      declaration.verb === Verb.ATTACK ||
      declaration.verb === Verb.MOVE ||
      declaration.verb === Verb.ACTIVATE
  );
  const endTurn = exactlyOne(declarations, Verb.END_TURN);

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionGroupWithDivider}>
        <div className={styles.actionGroup}>
          <span className={styles.groupLabel}>Actions</span>
          {executableDeclarations.map((declaration, index) => (
            <ActionDeclaration
              key={`${declaration.id}:${index}`}
              declaration={declaration}
              armed={armedDeclarationId === declaration.id}
              authorityFresh={authorityFresh}
              onSelect={onSelectDeclaration}
            />
          ))}
        </div>
      </div>
      {!authorityFresh && (
        <div className={styles.authorityStale} role="status">
          Actions may be out of date
        </div>
      )}
      {endTurn && (
        <button
          type="button"
          className={styles.endTurn}
          disabled={!authorityFresh || !endTurn.available}
          title={
            !authorityFresh
              ? 'Actions may be out of date'
              : endTurn.available
                ? 'End turn'
                : endTurn.why?.text || 'Unavailable'
          }
          onClick={() => onEndTurn(endTurn)}
        >
          End turn
          <span aria-hidden="true">→</span>
          {!endTurn.available && (
            <span className={styles.semanticOnly}>
              Unavailable: {endTurn.why?.text || 'Unavailable'}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
