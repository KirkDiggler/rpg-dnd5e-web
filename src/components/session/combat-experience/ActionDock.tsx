import {
  ClockKind,
  ReactChoice,
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
import {
  reactionWindowAnswers,
  reactionWindowDeclaration,
  reactionWindowKind,
  reactionWindowMover,
} from './reactionWindow';
import {
  NOT_YOUR_TURN,
  standingActionsBlocked,
  type StandingAction,
} from './standingActions';
import type { CombatExperienceRollWindow } from './types';

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
  // The reaction names itself, exactly as the ability and the weapon do. The
  // two answers are not labels the server sends — the verb implies them
  // (`ReactChoice`), so they are written where the panel draws them.
  if (declaration.verb === Verb.REACT) {
    return declaration.reaction?.name || 'Reaction';
  }
  return 'Move';
}

/**
 * The post-roll window's own sentence: the total the player is deciding about,
 * with the face of the d20 and the bonus that got it there shown apart.
 *
 * BOTH NUMBERS, NOT ONE. The total is what the decision is about, but the face
 * is what a natural 1 and a natural 20 are read off, and no answer moves it —
 * so a panel that showed only the total would hide the one number a d6 can
 * never rescue.
 *
 * The bonus is the difference and is never sent separately: two numbers that
 * must agree, sent twice, are free to disagree.
 */
function rollWindowHeadline(
  roll: CombatExperienceRollWindow | undefined | null
): string {
  if (!roll) return 'Your roll is on the table';
  const bonus = roll.total - roll.roll;
  if (bonus === 0) return `You rolled ${roll.total} (d20 ${roll.roll})`;
  const sign = bonus > 0 ? '+' : '−';
  return `You rolled ${roll.total} (d20 ${roll.roll} ${sign} ${Math.abs(bonus)})`;
}

function declarationIcon(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK) return '⚔';
  if (declaration.verb === Verb.ACTIVATE) return '✦';
  if (declaration.verb === Verb.DEATH_SAVE) return '✚';
  if (declaration.verb === Verb.REACT) return '⚡';
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
  /** Roster names, for the one place the dock names somebody who is not the
   * viewer: the mover an open reaction window is posed against. */
  memberNames?: ReadonlyMap<string, string>;
  /**
   * The d20 an open POST-ROLL window is asking about, and what it stands at.
   *
   * IT COMES FROM THE BEAT, not from Afford. The declaration says what may be
   * spent; only `RollWindowOpened` says what was rolled, because the struck
   * beat that would otherwise carry the numbers is not written until after the
   * answer. Absent while the beat has not landed — the panel still poses the
   * question, because a window nobody can answer is worse than one whose
   * numbers are a moment late.
   *
   * THE TARGET'S AC IS NOT HERE AND MUST NOT BE. A window that leaked it would
   * tell the player whether the swing lands before they choose, which is the
   * whole decision (post-roll design R7).
   */
  rollWindow?: CombatExperienceRollWindow | null;
  /** `choice` is sent only for a VERB_REACT declaration, whose two answers
   * the verb implies rather than the server listing them as candidates. */
  onSelectDeclaration: (declaration: Declaration, choice?: ReactChoice) => void;
  onEndTurn: (declaration: Declaration) => void;
  /** Search, Loot, Hold, Leave — drawn in every clock state, because they
   * are offered in every clock state. What gates them is the TURN, not the
   * dock: see `standingActionsBlocked`. */
  standingActions?: readonly StandingAction[];
}

/**
 * Why the standing verbs are not clickable right now, or null when they
 * are.
 *
 * FREE ON YOUR TURN, REFUSED OFF IT (design §4.4). Out of combat there is
 * no turn economy and they are simply free. In a fight the engine refuses
 * them off-turn, and the button says so rather than sending a call that
 * comes back refused — whose turn it is is public (`Turn.active`, the same
 * fact the dock already reads to decide whose commands to draw), so this
 * is presentation of a known fact and not a rule invented here. The server
 * stays the authority either way: on-turn the button is enabled and the
 * seam still refuses out of range, already held, or closed.
 */
/** The standing verbs, drawn like the declarations beside them. */
function StandingActionGroup({
  actions,
  blocked,
}: {
  actions: readonly StandingAction[];
  blocked: string | null;
}) {
  return (
    <div className={styles.actionGroup} data-testid="standing-actions">
      <span className={styles.groupLabel}>Explore</span>
      {actions.map((action) => (
        <span className={styles.actionOfferSlot} key={action.key}>
          <button
            type="button"
            className={styles.actionOffer}
            data-testid={action.key}
            disabled={blocked !== null || action.pending === true}
            title={blocked ?? action.title}
            onClick={action.onSelect}
          >
            <span className={styles.actionIcon} aria-hidden="true">
              {action.icon}
            </span>
            <span className={styles.actionLabel}>{action.label}</span>
          </button>
          {/* ONLY WHAT IS THIS BUTTON'S OWN. "Not your turn" is a fact
              about these verbs that nothing else on screen states, so it
              is announced here and names its action. Stale authority and
              "waiting" are already said once by the row above, and
              repeating them per button would read the same sentence five
              times — noise for a screen reader, and an ambiguous query
              for anything looking for that text. */}
          {blocked === NOT_YOUR_TURN && (
            <span className={styles.semanticOnly}>
              {action.label} unavailable: {blocked}
            </span>
          )}
        </span>
      ))}
    </div>
  );
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
  memberNames,
  rollWindow,
  onSelectDeclaration,
  onEndTurn,
  standingActions = [],
}: ActionDockProps) {
  // THE STANDING VERBS ARE DRAWN IN EVERY CLOCK STATE, which is the whole
  // of Kirk's second walk finding: every one of his four runs was inside a
  // fight from round 1, so a dock that only drew them out of combat drew
  // them never. They are disabled off-turn with the reason, rather than
  // hidden — a verb you cannot see is one you cannot learn exists.
  const blocked = standingActionsBlocked(
    clock,
    viewerMember,
    participants,
    authorityFresh
  );
  const standing = standingActions.length > 0 && (
    <StandingActionGroup actions={standingActions} blocked={blocked} />
  );

  if (clock === ClockKind.WORLD) {
    return (
      <div className={styles.actionRow}>
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
        {standing}
      </div>
    );
  }
  // AHEAD OF EVERY "NOT YOUR TURN" RETURN BELOW, because that is precisely
  // when a reaction window is posed: the mover is a monster, the initiative
  // is its, and the fight is frozen waiting on THIS viewer's answer. Drawn
  // under the two returns it would never be drawn at all.
  //
  // It replaces the dock rather than joining it. Nothing else is declarable
  // while a window is open — every other verb comes back with the
  // WINDOW_OPEN shortfall — so a row of refused buttons beside the question
  // would only invite clicks that cannot land.
  const reactionWindow = reactionWindowDeclaration(declarations);
  if (reactionWindow) {
    const windowKind = reactionWindowKind(reactionWindow);
    const answers = reactionWindowAnswers(windowKind);
    const moverId = reactionWindowMover(reactionWindow);
    const moverName =
      (moverId && memberNames?.get(moverId)) || moverId || 'Something';
    // WHAT THE QUESTION IS ABOUT. The movement window names the mover it is
    // posed against; the post-roll window names the viewer's own d20, and
    // there is nobody else in it.
    const headline =
      windowKind === 'movement'
        ? `${moverName} is leaving your reach`
        : rollWindowHeadline(
            // MATCHED TO THE OFFER, never taken on trust. The beat and the
            // declaration are two arrivals; one window's numbers drawn under
            // another's question would be a lie the player acts on.
            rollWindow && rollWindow.offerRef === reactionWindow.reaction?.ref
              ? rollWindow
              : null
          );
    const prompt =
      windowKind === 'movement'
        ? 'Strike now, or hold your reaction. The fight waits on you.'
        : 'Spend it, or keep it. The fight waits on you.';
    return (
      <div className={styles.actionRow}>
        <div
          className={styles.passiveActionRow}
          data-testid="reaction-window"
          data-window-kind={windowKind}
        >
          <span>{declarationLabel(reactionWindow)}</span>
          <strong>{headline}</strong>
          <small>
            {authorityFresh
              ? prompt
              : 'Waiting for current Turn and Afford authority.'}
          </small>
        </div>
        <div className={styles.actionGroup} data-testid="reaction-choices">
          <span className={styles.groupLabel}>Reaction</span>
          <span className={styles.actionOfferSlot}>
            <button
              type="button"
              className={styles.actionOffer}
              data-testid="reaction-strike"
              disabled={!authorityFresh}
              onClick={() =>
                onSelectDeclaration(reactionWindow, ReactChoice.STRIKE)
              }
            >
              <span className={styles.actionIcon} aria-hidden="true">
                {declarationIcon(reactionWindow)}
              </span>
              <span className={styles.actionLabel}>{answers.take}</span>
              <CostBadge slot={reactionWindow.slot} />
            </button>
          </span>
          <span className={styles.actionOfferSlot}>
            <button
              type="button"
              className={styles.actionOffer}
              data-testid="reaction-hold"
              disabled={!authorityFresh}
              onClick={() =>
                onSelectDeclaration(reactionWindow, ReactChoice.HOLD)
              }
            >
              <span className={styles.actionIcon} aria-hidden="true">
                {answers.declineIcon}
              </span>
              {/* HOLDING COSTS NOTHING (plan R1: the reaction is spent when
                  it is taken), so this button carries no cost badge — one
                  here would say the refusal is priced. */}
              <span className={styles.actionLabel}>{answers.decline}</span>
            </button>
          </span>
        </div>
        {standing}
      </div>
    );
  }

  if (clock !== ClockKind.TURN) {
    return (
      <div className={styles.actionRow}>
        <div className={styles.passiveActionRow}>
          <span>Synchronizing</span>
          <strong>Actions are not ready</strong>
          <small>Waiting for coherent Turn and Afford authority.</small>
        </div>
        {standing}
      </div>
    );
  }

  const activeParticipant = participants.find(
    (participant) => participant.active
  );
  if (!activeParticipant || activeParticipant.member !== viewerMember) {
    return (
      <div className={styles.actionRow}>
        <div className={styles.passiveActionRow}>
          <span>Watching</span>
          <strong>
            {activeParticipant?.name ?? 'Another participant'}’s turn
          </strong>
          <small>Your commands return when the initiative reaches you.</small>
        </div>
        {standing}
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
      {standing}
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
