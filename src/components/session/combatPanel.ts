/**
 * combatPanel — pure mapping from turn state + Afford into what the
 * combat panel and floor draw (rpg-project#249 "the combat turn on the
 * session stack"; rpg-dnd5e-web#762, #525, #533). Framework-free, same
 * split `turnHud.ts`/`moveIndicator.ts` already use.
 *
 * # Composes `turnHud.ts`, does not re-derive it
 *
 * The three shapes come from `selectTurnHud` — this module's own new
 * judgment is (1) TURN-OWNERSHIP gating on top (`Afford` answers "can I
 * ever pay," not "can I act RIGHT NOW" — `AffordResponse`'s own doc
 * comment) and (2) turning the wire's PER-TARGET Attack declarations
 * (rpg-project#249 §3, rpg-toolkit#1010) into the floor's affordance
 * list, rather than a second button of its own.
 *
 * # Attack is a floor gesture, not a panel button
 *
 * The design's own walkthrough (rpg-project#249 §1) never arms a button
 * before swinging: "Enemies in reach are highlighted; hovering one shows
 * 'Attack skeleton-1'. Clicking it swings." Each in-reach candidate is
 * its own `Declaration{ATTACK, target}` (one row per target, ADR-0042) —
 * `attackTargets` is that list, verbatim enough for the floor to
 * highlight every affordable one and for a click on any of them to fire
 * `Attack` directly, with NO client-side reach math and no second
 * "pick a target then confirm" step. `noTargetInReachText` is the one
 * OTHER shape Afford answers when nothing at all is in reach — a single
 * untargeted declaration (`Declaration.target` unset,
 * `why.reason = NO_TARGET_IN_REACH`) rather than an empty list with no
 * explanation.
 *
 * # `hoverLabel` — "Attack X" or the shortfall, never both, never neither
 *
 * `hoveredEntityId` (the cell under the cursor, from `SessionCanvas`) is
 * looked up against `attackTargets`: an affordable one reads "Attack
 * <name>" (design §1: "hovering one shows 'Attack skeleton-1'"); an
 * unaffordable one reads its own `Shortfall.text` verbatim (design §1's
 * second hover: "action: 1 needed, 0 left") — never a client-invented
 * reason. Hovering anything else (out of reach, or nothing) is `null`.
 *
 * # `why.text` over `shortfall`, but never neither
 *
 * `Declaration.why` (`Shortfall`, rpg-toolkit#1010/#249 §3) supersedes
 * the legacy `shortfall` string, but a producer that sets one sets both
 * (`Declaration.shortfall`'s own doc comment) — `shortfallText` below
 * prefers `why.text` and falls back to `shortfall` for a v0.1.131 server,
 * never inventing wording of its own.
 *
 * # Movement (toolkit#1169) — a currency, not a slot
 *
 * A Move declaration always carries `Slot.NONE` and always carries
 * `remaining` (feet), never absent on the turn clock. `movement` reports
 * that verbatim; `moveMaxCells` is the SAME figure floor-divided by five
 * (`Declaration.remaining`'s own doc comment: a client may round down to
 * whole cells for a preview, nothing more) — the bound `SessionCanvas`'s
 * path preview must respect, never a client-derived speed rule.
 *
 * # Names, not ids (rpg-dnd5e-web#564)
 *
 * `Participant.name` (`turn.participants`) is the ONE name source this
 * module reads — for the roster, for `waitingOnName`, and for every
 * `attackTargets` entry (a fight target is always a fight participant,
 * so the roster names it too — no second lookup against `Sighting.name`
 * needed here).
 */
import {
  ClockKind,
  Standing,
  Verb,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { DeclarationRow } from './declarationRows';
import { participantNameMap, resolveName } from './participantNames';
import { isSightedDowned, type SightedMember } from './sightingEntities';
import {
  selectTurnHud,
  type TurnHudDeclarationRow,
  type TurnHudShape,
} from './turnHud';

export interface CombatPanelParticipant {
  id: string;
  name: string;
  isActive: boolean;
  isYou: boolean;
  isDowned: boolean;
}

export interface CombatPanelGate {
  enabled: boolean;
  /** Why the button is disabled — `null` when `enabled`. */
  reason: string | null;
}

export interface CombatPanelMovement {
  /** `Declaration.remaining`, verbatim — feet. */
  remainingFeet: number;
  /** `Declaration.affordable` — true iff at least one cell (5 ft) is
   * still reachable this turn. */
  affordable: boolean;
}

/** One candidate Attack target, in reach (`Declaration.target` set) —
 * drives the floor's persistent highlight and its click-to-swing. */
export interface CombatPanelAttackTarget {
  id: string;
  name: string;
  affordable: boolean;
  /** `shortfallText`'s answer for this row — `null` when affordable. */
  whyText: string | null;
}

export type CombatPanelSelection =
  | { mode: 'free-roam' }
  | {
      mode: 'turn';
      round: number;
      participants: CombatPanelParticipant[];
      shapes: TurnHudShape[];
      movement: CombatPanelMovement | null;
      /** `Math.floor(movement.remainingFeet / 5)` when a `remaining`
       * figure is known; `0` when `movement` is `null` BECAUSE the Move
       * declaration is unaffordable or absent; `undefined` (unbounded)
       * when it's `null` because Move is `affordable: true` but the
       * server omitted `remaining` — a real wire gap (rpg-project#251
       * web#770), never treated as "0 left" against the server's own
       * affordable answer. The bound `SessionCanvas`'s path preview
       * passes straight to `moveIndicator.ts`'s own `maxCells`, which
       * already documents `undefined` as its unbounded reading. */
      moveMaxCells: number | undefined;
      /** Every in-reach candidate Afford named this turn, whether or not
       * this member can currently pay for it — see this module's own
       * doc comment on why Attack is a floor gesture. Empty means
       * nothing is in reach right now. */
      attackTargets: CombatPanelAttackTarget[];
      /** Set only when it is your turn AND `attackTargets` is empty AND
       * Afford named a reason (`NO_TARGET_IN_REACH`) — nothing to
       * highlight, and why. `null` otherwise (including when it's simply
       * not your turn — see `waitingOnName` for that case instead). */
      noTargetInReachText: string | null;
      /** "Attack <name>" or that target's own shortfall text, keyed off
       * `hoveredEntityId` — see this module's own doc comment. */
      hoverLabel: string | null;
      endTurn: CombatPanelGate;
      /** Non-null only when it is NOT this member's turn — the display
       * name of whoever's turn it is, e.g. "skeleton-1". */
      waitingOnName: string | null;
      lastBeat: string | null;
    };

export interface SelectCombatPanelArgs {
  turn: {
    clock: ClockKind;
    active: string;
    round: number;
    participants: Participant[];
  };
  afford: {
    clock: ClockKind;
    declarations: DeclarationRow[];
  };
  /** The local player's own member id. */
  member: string;
  /** The subject under the cursor right now (`SessionCanvas`'s hover
   * state), or `null`. */
  hoveredEntityId: string | null;
  /** Pre-formatted by the caller from typed data only (stream event
   * bodies — `combatBeat.ts`) — this module never decodes
   * `Event.payload`. */
  lastBeat: string | null;
  /** `GetView.sightings`, via `sightingsToEntities` — a belt-and-suspenders
   * cross-check on top of Afford's own per-target declarations. Afford and
   * GetView are two independent server reads; a target this observer has
   * SIGHTED as `Standing.DOWNED` is never offered as attackable here even
   * if Afford's own answer hasn't caught up yet (a real, live-gate-found
   * gap — GetView only refreshed on Move until rpg-dnd5e-web#769's gate
   * review added an Attack/downed/fightEnded refetch trigger too, but a
   * lagging Afford answer is still possible for one render). A subject
   * this observer has never sighted at all is left untouched — no
   * sighting is never treated as downed, only an explicit one is. */
  sightedMembers?: SightedMember[];
}

const NOT_YOUR_TURN = 'Not your turn.';

/** `why.text` over the legacy `shortfall` string, never neither — see
 * this module's own doc comment. */
function shortfallText(row: TurnHudDeclarationRow): string {
  return row.why?.text || row.shortfall || 'Unavailable.';
}

export function selectCombatPanel(
  args: SelectCombatPanelArgs
): CombatPanelSelection {
  const { turn, afford, member, hoveredEntityId, lastBeat, sightedMembers } =
    args;

  if (turn.clock !== ClockKind.TURN) {
    // Free roam — the existing quiet pill, nothing else. Deliberately
    // keyed on `turn.clock`, not `afford.clock`: Turn is the RPC actually
    // asking "whose go is it," which is what decides whether a panel
    // exists to draw at all.
    return { mode: 'free-roam' };
  }

  const isYourTurn = turn.active === member;
  const names = participantNameMap(turn.participants);

  const hudSelection = selectTurnHud({
    clock: afford.clock,
    declarations: afford.declarations,
  });
  // Defensive fallback for the (should-never-happen) case where Afford's
  // OWN clock disagrees with Turn's — see this module's doc comment on
  // why `turn.clock` governs the panel's mode. Rather than trust a
  // disagreeing Afford answer, show every shape dim and nothing in
  // reach: the honest "nothing to report" reading, not a guess.
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
  const MOVE_CELL_FEET = 5;
  const moveMaxCells: number | undefined = movement
    ? Math.floor(movement.remainingFeet / MOVE_CELL_FEET)
    : moveDeclaration?.affordable
      ? undefined // affordable but no `remaining` -- trust affordable:true over a missing figure; see this interface field's own doc comment
      : 0;

  const attackDeclarations = allDeclarations.filter(
    (d) => d.verb === Verb.ATTACK
  );
  // Downed-sighting cross-check (see this module's own doc comment on
  // `SelectCombatPanelArgs.sightedMembers`) — only a subject this observer
  // has ACTUALLY sighted as downed is excluded; an unsighted subject is
  // left to Afford's own answer.
  const downedSightedSubjects = new Set(
    (sightedMembers ?? [])
      .filter((m) => isSightedDowned(m.standing))
      .map((m) => m.subject)
  );
  const targeted = attackDeclarations.filter(
    (d) => d.target !== undefined && !downedSightedSubjects.has(d.target)
  );
  const untargeted = attackDeclarations.find((d) => d.target === undefined);

  const attackTargets: CombatPanelAttackTarget[] = isYourTurn
    ? targeted.map((d) => ({
        id: d.target!,
        name: resolveName(names, d.target!, member),
        affordable: d.affordable,
        whyText: d.affordable ? null : shortfallText(d),
      }))
    : [];

  const noTargetInReachText: string | null =
    isYourTurn && attackTargets.length === 0 && untargeted
      ? shortfallText(untargeted)
      : null;

  let hoverLabel: string | null = null;
  if (isYourTurn && hoveredEntityId) {
    const hovered = attackTargets.find((t) => t.id === hoveredEntityId);
    if (hovered) {
      hoverLabel = hovered.affordable
        ? `Attack ${hovered.name}`
        : hovered.whyText;
    }
  }

  const endTurn: CombatPanelGate = isYourTurn
    ? { enabled: true, reason: null }
    : { enabled: false, reason: NOT_YOUR_TURN };

  const participants: CombatPanelParticipant[] = turn.participants.map((p) => ({
    id: p.member,
    name: p.name,
    isActive: p.active,
    isYou: p.member === member,
    isDowned: p.standing === Standing.DOWNED,
  }));

  return {
    mode: 'turn',
    round: turn.round,
    participants,
    shapes,
    movement,
    moveMaxCells,
    attackTargets,
    noTargetInReachText,
    hoverLabel,
    endTurn,
    waitingOnName: isYourTurn
      ? null
      : (names.get(turn.active) ?? turn.active) || null,
    lastBeat,
  };
}
