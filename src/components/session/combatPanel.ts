/**
 * combatPanel — pure mapping from turn state + Afford + the local
 * player's own target selection into what the combat panel draws
 * (rpg-dnd5e-web#762, "grow the HUD into a panel" — Kirk, live-walking
 * PR #769: "I do not have a panel, I cannot end turn or even see whose
 * turn it is"). Framework-free, same split `turnHud.ts`/`moveIndicator.ts`
 * already use.
 *
 * # Composes `turnHud.ts`, does not re-derive it
 *
 * The three shapes/declaration rows come from `selectTurnHud` — this
 * module's only NEW judgment is TURN-OWNERSHIP gating on top. `Afford`
 * answers "can I ever pay for this" (the ECONOMY's answer,
 * `AffordResponse`'s own doc comment: it does not check whose turn it
 * is), while a combat panel also needs "can I act RIGHT NOW" —
 * `turn.active === member`. A shape `selectTurnHud` lights is shown DIM
 * here when it is not this member's turn: the economy would still let it
 * through, but nothing on this seam lets a client act out of turn, and a
 * lit-but-unusable shape would be a lie the panel is telling on its own,
 * not one the server told it. `declarations` (the text rows) are left
 * UNCHANGED — the affordability/shortfall text is still true, only the
 * shape shouldn't glow as if it's actionable this instant.
 *
 * # Attack/End Turn gates, and why the priority order is what it is
 *
 * Both buttons show exactly one reason when disabled (never a stack of
 * them): "not your turn" always wins first, because every other question
 * ("can I afford it," "do I have a target") is moot until it's your turn
 * to ask them. `NOTHING SPENDS at the Attack RPC itself` (`AttackRequest`'s
 * own doc comment) — Afford is still the only source of "is Attack
 * economically affordable right now."
 *
 * # `waitingOn` and the honesty this whole panel exists for
 *
 * Kirk's complaint was seeing "Attack — ready" with nothing to do about
 * it. When it is NOT this member's turn, this module reports who to wait
 * on rather than pretending the shapes are actionable — today that is
 * always a monster with no driver yet (toolkit work item B), so
 * `waitingOn` is the only forward progress the panel can honestly show.
 */
import {
  ClockKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  selectTurnHud,
  type TurnHudDeclarationRow,
  type TurnHudShape,
} from './turnHud';

export interface CombatPanelOrderEntry {
  id: string;
  isActive: boolean;
  isYou: boolean;
}

export interface CombatPanelGate {
  enabled: boolean;
  /** Why the button is disabled — the Afford shortfall verbatim, "Not
   * your turn.", or "Pick a target." `null` when `enabled`. */
  reason: string | null;
}

export type CombatPanelSelection =
  | { mode: 'free-roam' }
  | {
      mode: 'turn';
      round: number;
      order: CombatPanelOrderEntry[];
      shapes: TurnHudShape[];
      declarations: TurnHudDeclarationRow[];
      attack: CombatPanelGate;
      endTurn: CombatPanelGate;
      /** Whether the canvas should be in target-selection mode right
       * now — your turn AND Attack is economically affordable. Reused
       * verbatim as `SessionCanvas`'s `mode` prop. */
      targeting: boolean;
      selectedTargetId: string | null;
      /** Non-null only when it is NOT this member's turn, e.g.
       * "skeleton-1" — the honest "here's who to wait on" line. */
      waitingOn: string | null;
      lastBeat: string | null;
    };

export interface SelectCombatPanelArgs {
  turn: {
    clock: ClockKind;
    active: string;
    round: number;
    order: string[];
  };
  afford: {
    clock: ClockKind;
    declarations: Declaration[];
  };
  /** The local player's own member id. */
  member: string;
  /** The subject id of whoever the player has clicked as a target in
   * `'target'` mode, or `null` — lives in `useCombatPanel`'s own state,
   * not here; this module only reads it. */
  selectedTargetId: string | null;
  /** Pre-formatted by the caller from typed data only (the local
   * player's own `AttackResponse` plus the target they chose) — this
   * module never decodes `Event.payload`, same "never decode; render
   * only from typed fields" rule `sightingEntities.ts` already keeps for
   * `Sighting.payload`. See `useCombatPanel.ts` for how it's built. */
  lastBeat: string | null;
}

const NOT_YOUR_TURN = 'Not your turn.';
const PICK_A_TARGET = 'Pick a target.';
const ATTACK_UNAVAILABLE = 'Attack unavailable.';

export function selectCombatPanel(
  args: SelectCombatPanelArgs
): CombatPanelSelection {
  const { turn, afford, member, selectedTargetId, lastBeat } = args;

  if (turn.clock !== ClockKind.TURN) {
    // Free roam — the existing quiet pill, nothing else (brief's own
    // done-criterion). Deliberately keyed on `turn.clock`, not
    // `afford.clock`: Turn is the RPC actually asking "whose go is it,"
    // which is what decides whether a panel exists to draw at all.
    return { mode: 'free-roam' };
  }

  const isYourTurn = turn.active === member;

  const hudSelection = selectTurnHud({
    clock: afford.clock,
    declarations: afford.declarations,
  });
  // Defensive fallback for the (should-never-happen) case where Afford's
  // OWN clock disagrees with Turn's — see this module's doc comment on
  // why `turn.clock` governs the panel's mode. Rather than trust a
  // disagreeing Afford answer, show every shape dim and no declarations:
  // the honest "nothing to report" reading, not a guess.
  const rawShapes: TurnHudShape[] =
    hudSelection.mode === 'turn'
      ? hudSelection.shapes
      : [
          { slot: 'action', lit: false },
          { slot: 'bonus', lit: false },
          { slot: 'reaction', lit: false },
        ];
  const declarations: TurnHudDeclarationRow[] =
    hudSelection.mode === 'turn' ? hudSelection.declarations : [];

  const shapes: TurnHudShape[] = rawShapes.map((shape) => ({
    ...shape,
    lit: shape.lit && isYourTurn,
  }));

  const attackDeclaration =
    declarations.find((d) => d.verb === Verb.ATTACK) ?? null;

  let attack: CombatPanelGate;
  if (!isYourTurn) {
    attack = { enabled: false, reason: NOT_YOUR_TURN };
  } else if (!attackDeclaration || !attackDeclaration.affordable) {
    attack = {
      enabled: false,
      reason: attackDeclaration?.shortfall || ATTACK_UNAVAILABLE,
    };
  } else if (!selectedTargetId) {
    attack = { enabled: false, reason: PICK_A_TARGET };
  } else {
    attack = { enabled: true, reason: null };
  }

  const endTurn: CombatPanelGate = isYourTurn
    ? { enabled: true, reason: null }
    : { enabled: false, reason: NOT_YOUR_TURN };

  const targeting = isYourTurn && !!attackDeclaration?.affordable;

  const order: CombatPanelOrderEntry[] = turn.order.map((id) => ({
    id,
    isActive: id === turn.active,
    isYou: id === member,
  }));

  return {
    mode: 'turn',
    round: turn.round,
    order,
    shapes,
    declarations,
    attack,
    endTurn,
    targeting,
    selectedTargetId,
    waitingOn: isYourTurn ? null : turn.active || null,
    lastBeat,
  };
}
