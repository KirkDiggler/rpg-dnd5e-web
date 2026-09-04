import {
  ClockKind,
  Slot,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
  type ActionTooltip,
} from './actionTooltip';
import styles from './CombatExperience.module.css';
import { isDeathSaveExecutableShape } from './deathSaveDeclaration';

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
  if (declaration.verb === Verb.DEATH_SAVE) {
    return declaration.deathSave?.name || 'Death Save';
  }
  return 'Move';
}

function declarationIcon(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK) return '⚔';
  if (declaration.verb === Verb.ACTIVATE) return '✦';
  if (declaration.verb === Verb.DEATH_SAVE) return '✚';
  return '➜';
}

/**
 * The hover/focus card — SIGHTED USERS ONLY, and `aria-hidden` for that
 * reason. It is revealed with `visibility`, and a node hidden that way is an
 * unreliable `aria-describedby` target (Copilot on #839): the spec keeps a
 * directly-referenced hidden node in the description, but support for that
 * has never been uniform. So the description is a separate, genuinely
 * rendered sr-only node (`ActionDescription`) and this card is decoration,
 * which also stops the same sentence being announced twice.
 *
 * Rendered as a SIBLING of the button, never a child. `.actionOffer:disabled`
 * carries `opacity: 0.48`, and opacity applies to the whole subtree — nested
 * inside the button, this card was washed out to 48% exactly when it mattered
 * most: on the refused offer whose refusal it exists to explain. Opacity also
 * opens a stacking context, which trapped the card's `z-index` inside the
 * button and let the dock's identity row paint straight over it. Two symptoms,
 * one cause (Kirk, screenshot 2026-08-28).
 */
function ActionTooltipCard({ tooltip }: { tooltip: ActionTooltip }) {
  return (
    <span className={styles.actionTooltip} aria-hidden="true">
      <strong>{tooltip.title}</strong>
      {tooltip.lines.map((line) => (
        <span key={line.label}>
          <em>{line.label}</em>
          {line.value}
        </span>
      ))}
      {tooltip.refusal && (
        <span className={styles.actionTooltipRefusal}>{tooltip.refusal}</span>
      )}
    </span>
  );
}

/**
 * The button's accessible description: the same facts as the card, flattened.
 *
 * Rendered OUTSIDE the button on purpose. Text inside a button joins its
 * accessible NAME, and a name that recites the whole tooltip is worse than no
 * tooltip at all. Absolutely positioned and clipped, so it costs the flex row
 * no layout.
 */
function ActionDescription({
  tooltip,
  id,
}: {
  tooltip: ActionTooltip;
  id: string;
}) {
  return (
    <span className={styles.semanticOnly} id={id}>
      {actionTooltipText(tooltip)}
    </span>
  );
}

function ActionDeclaration({
  declaration,
  armed,
  authorityFresh,
  index,
  onSelect,
}: {
  declaration: Declaration;
  armed: boolean;
  authorityFresh: boolean;
  /** Disambiguates the tooltip id: one verb can compile many offers, and two
   * of them may share a declaration id within a render. */
  index: number;
  onSelect: (declaration: Declaration) => void;
}) {
  const label = declarationLabel(declaration);
  const unavailable = declaration.why?.text || 'Unavailable';
  const tooltip = buildActionTooltip(declaration);
  const describedById = `action-desc-${declaration.id}-${index}`;

  return (
    // Positioned wrapper. The card anchors to THIS, not to the button, so the
    // disabled button's opacity can never reach it.
    <span className={styles.actionOfferSlot}>
      <button
        type="button"
        className={`${styles.actionOffer} ${armed ? styles.actionOfferArmed : ''}`}
        disabled={!authorityFresh || !declaration.available}
        // The authored weapon identity, kept addressable without putting a raw
        // ref in a player's tooltip. Asserting on this is how "the client never
        // maps refs to names itself" stays checkable.
        data-attack-ref={declaration.attack?.ref || undefined}
        aria-describedby={describedById}
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
          <span className={styles.semanticOnly}>
            Unavailable: {unavailable}
          </span>
        )}
      </button>
      {/* Stale authority is announced ONCE by the dock's own status line;
          repeating it in every tooltip is noise, and two copies of the same
          sentence is a worse read than one. */}
      <ActionTooltipCard tooltip={tooltip} />
      <ActionDescription tooltip={tooltip} id={describedById} />
    </span>
  );
}

export interface ActionDockProps {
  clock: ClockKind;
  viewerMember: string;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  authorityFresh: boolean;
  endTurnBlocked?: boolean;
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
  endTurnBlocked = false,
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
      declaration.verb === Verb.ACTIVATE ||
      (declaration.verb === Verb.DEATH_SAVE &&
        isDeathSaveExecutableShape(declaration, 'display'))
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
              index={index}
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
          disabled={!authorityFresh || endTurnBlocked || !endTurn.available}
          title={
            !authorityFresh
              ? 'Actions may be out of date'
              : endTurnBlocked
                ? 'Finish the Death Save roll before ending turn'
                : endTurn.available
                  ? 'End turn'
                  : endTurn.why?.text || 'Unavailable'
          }
          onClick={() => onEndTurn(endTurn)}
        >
          End turn
          <span aria-hidden="true">→</span>
          {endTurnBlocked ? (
            <span className={styles.semanticOnly}>
              Unavailable: finish the Death Save roll first
            </span>
          ) : (
            !endTurn.available && (
              <span className={styles.semanticOnly}>
                Unavailable: {endTurn.why?.text || 'Unavailable'}
              </span>
            )
          )}
        </button>
      )}
    </div>
  );
}
