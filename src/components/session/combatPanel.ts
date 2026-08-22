/**
 * combatPanel — pure mapping from turn state + Afford + the local
 * player's own target selection into what the combat panel draws
 * (rpg-dnd5e-web#762, "grow the HUD into a panel" — Kirk, live-walking
 * PR #769: "I do not have a panel, I cannot end turn or even see whose
 * turn it is"; then "operating in the new clock: take turn, move maybe,
 * end turn, monster takes turn" — toolkit#1169 — added movement).
 * Framework-free, same split `turnHud.ts`/`moveIndicator.ts` already use.
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
 * UNCHANGED for every OTHER verb — the affordability/shortfall text is
 * still true, only the shape shouldn't glow as if it's actionable this
 * instant. Move is the one exception: pulled out of `declarations`
 * entirely into its own `movement` field (below), never double-shown.
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
 *
 * # Movement (toolkit#1169) — a currency, not a slot
 *
 * A Move declaration always carries `Slot.NONE` (it draws no per-turn
 * shape — the toolkit's own `affordMove` sets `Slot: SlotNone`
 * unconditionally) and always carries `remaining` (feet), never absent
 * on the turn clock. `movement` reports that verbatim; `moveMaxCells` is
 * the SAME figure floor-divided by five (`Declaration.remaining`'s own
 * doc comment: a client may round down to whole cells for a preview,
 * nothing more) — the bound `SessionCanvas`'s path preview must respect,
 * never a client-derived speed rule.
 *
 * # Attack's dual-purpose button and why there is no separate "pick
 * target" affordance
 *
 * "Pick the simplest honest interaction" (the brief's own words): rather
 * than a second button competing for the same panel space, the Attack
 * button itself becomes the target-picking affordance exactly when there
 * is nothing else stopping it — your turn, Attack affordable, no target
 * chosen yet. `CombatPanelAttackState`'s `'pick-target'` variant is that
 * state; `CombatPanel.tsx` relabels the SAME button "Pick a target" and
 * wires it to enter `'target'` mode instead of dispatching `Attack`. Once
 * a target is chosen the button reverts to `'attack'` on its own — no
 * second piece of state to keep in sync.
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
  /** Why the button is disabled — the Afford shortfall verbatim or "Not
   * your turn." `null` when `enabled`. */
  reason: string | null;
}

/** The Attack button's own state — see this module's doc comment on why
 * "pick a target" is a variant of this button rather than a second one. */
export type CombatPanelAttackState =
  | { kind: 'attack'; enabled: boolean; reason: string | null }
  | { kind: 'pick-target'; enabled: true };

export interface CombatPanelMovement {
  /** `Declaration.remaining`, verbatim — feet. */
  remainingFeet: number;
  /** `Declaration.affordable` — true iff at least one cell (5 ft) is
   * still reachable this turn. */
  affordable: boolean;
}

export type CombatPanelSelection =
  | { mode: 'free-roam' }
  | {
      mode: 'turn';
      round: number;
      order: CombatPanelOrderEntry[];
      shapes: TurnHudShape[];
      /** Every OTHER verb's declaration row (Attack today) — Move is
       * never in this list, see `movement` below. */
      declarations: TurnHudDeclarationRow[];
      /** `null` when the turn-clock Afford answer carries no Move
       * declaration at all (a stale server predating toolkit#1169) —
       * the honest "nothing to report" reading, not a guessed zero. */
      movement: CombatPanelMovement | null;
      /** `Math.floor(movement.remainingFeet / 5)`, or `0` when
       * `movement` is `null` — the bound `SessionCanvas`'s path preview
       * passes to `moveIndicator.ts`'s `maxCells`. Zero already reads
       * correctly there (every hover but your own cell shows
       * `'invalid'`), so no separate "no movement left" mode is needed. */
      moveMaxCells: number;
      attack: CombatPanelAttackState;
      endTurn: CombatPanelGate;
      /** Whether the canvas should be in target-selection mode right
       * now — an explicit request (`enterTargetMode`), forced back to
       * `false` whenever it is not this member's turn regardless of the
       * raw request (see `selectCombatPanel`'s own body). Reused
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
  /** Whether the player has explicitly asked to enter targeting (the
   * Attack button's `'pick-target'` click, or re-entering after End Turn
   * cycles back to their turn) — lives in `useCombatPanel`'s own state.
   * Forced to `false` in the output whenever it is not this member's
   * turn, regardless of this raw value — see `selectCombatPanel`'s body. */
  targetingRequested: boolean;
  /** Pre-formatted by the caller from typed data only (the local
   * player's own `AttackResponse` plus the target they chose) — this
   * module never decodes `Event.payload`, same "never decode; render
   * only from typed fields" rule `sightingEntities.ts` already keeps for
   * `Sighting.payload`. See `useCombatPanel.ts` for how it's built. */
  lastBeat: string | null;
}

const NOT_YOUR_TURN = 'Not your turn.';
const ATTACK_UNAVAILABLE = 'Attack unavailable.';
const MOVE_CELL_FEET = 5;

export function selectCombatPanel(
  args: SelectCombatPanelArgs
): CombatPanelSelection {
  const {
    turn,
    afford,
    member,
    selectedTargetId,
    targetingRequested,
    lastBeat,
  } = args;

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
  const allDeclarations: TurnHudDeclarationRow[] =
    hudSelection.mode === 'turn' ? hudSelection.declarations : [];

  const shapes: TurnHudShape[] = rawShapes.map((shape) => ({
    ...shape,
    lit: shape.lit && isYourTurn,
  }));

  const moveDeclaration =
    allDeclarations.find((d) => d.verb === Verb.MOVE) ?? null;
  const movement: CombatPanelMovement | null =
    moveDeclaration && moveDeclaration.remaining !== undefined
      ? {
          remainingFeet: moveDeclaration.remaining,
          affordable: moveDeclaration.affordable,
        }
      : null;
  const moveMaxCells = movement
    ? Math.floor(movement.remainingFeet / MOVE_CELL_FEET)
    : 0;

  // Every OTHER verb's row — Move never appears here, it has its own
  // dedicated `movement` field above.
  const declarations = allDeclarations.filter((d) => d.verb !== Verb.MOVE);

  const attackDeclaration =
    declarations.find((d) => d.verb === Verb.ATTACK) ?? null;

  let attack: CombatPanelAttackState;
  if (!isYourTurn) {
    attack = { kind: 'attack', enabled: false, reason: NOT_YOUR_TURN };
  } else if (!attackDeclaration || !attackDeclaration.affordable) {
    attack = {
      kind: 'attack',
      enabled: false,
      reason: attackDeclaration?.shortfall || ATTACK_UNAVAILABLE,
    };
  } else if (!selectedTargetId) {
    attack = { kind: 'pick-target', enabled: true };
  } else {
    attack = { kind: 'attack', enabled: true, reason: null };
  }

  const endTurn: CombatPanelGate = isYourTurn
    ? { enabled: true, reason: null }
    : { enabled: false, reason: NOT_YOUR_TURN };

  // Forced false whenever it is not this member's turn, regardless of
  // the raw request — `moveIndicator.ts`'s own `'target'` branch is
  // checked BEFORE `fightLocked`, so a stale `targetingRequested` left
  // over from a turn that just ended would otherwise keep showing the
  // target reticle instead of the honest 'locked' floor.
  const targeting = isYourTurn && targetingRequested;

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
    movement,
    moveMaxCells,
    attack,
    endTurn,
    targeting,
    selectedTargetId,
    waitingOn: isYourTurn ? null : turn.active || null,
    lastBeat,
  };
}
