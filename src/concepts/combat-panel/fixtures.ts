/**
 * Combat-panel fixtures (rpg-dnd5e-web#525) — the outside-in contract bench.
 *
 * These fixtures feed the REAL proto types (`ActionEconomy`,
 * `AvailableAction` from v1alpha2 encounter) into the real primitives, so a
 * component cannot tell fixture from wire — that's the composability bar.
 * Where the panel needs data the wire does NOT carry yet, it lives in
 * `ViewerFixture` instead, clearly separated: that delta IS the draft
 * contract request to the platform team (see rpg-api-protos#183 — level /
 * abilities / saves / equipment are exactly this kind of gap).
 *
 * Built with the same `as unknown as T` proto-mock idiom the existing
 * tests and EncounterDockConcept use.
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { ReadinessState } from '../../components/ui/combat';

function economy(
  actions: number,
  bonus: number,
  reactions: number,
  movement: number
): ActionEconomy {
  return {
    actionsRemaining: actions,
    bonusActionsRemaining: bonus,
    reactionsRemaining: reactions,
    movementRemaining: movement,
    capacities: {},
  } as unknown as ActionEconomy;
}

function action(
  id: string,
  displayName: string,
  slot: EconomySlot,
  opts?: { available?: boolean; reason?: string; targetKind?: TargetKind }
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: 'combat_abilities', id },
    displayName,
    available: opts?.available ?? true,
    unavailableReason: opts?.reason ?? '',
    economySlot: slot,
    targetKind: opts?.targetKind ?? TargetKind.SINGLE_ENTITY,
  } as unknown as AvailableAction;
}

/** Data the panel needs that the wire already carries per-entity today. */
export interface ViewerFixture {
  entityId: string;
  displayName: string;
  classRefId: string;
  hp: { current: number; max: number };
  ac: number;
}

export interface CombatPanelFixture {
  id: string;
  label: string;
  /** What this state proves — shown in the concept page. */
  description: string;
  mode: 'TURN_BASED' | 'FREE_ROAM';
  isMyTurn: boolean;
  /** Display name of whoever's turn it is (spectator banner). */
  activeName: string;
  viewer: ViewerFixture;
  economy: ActionEconomy | null;
  actions: AvailableAction[];
  /** Initially-armed action ref id (the #514 arming flow). */
  armedActionKey?: string;
  reaction: ReadinessState;
}

const alice: ViewerFixture = {
  entityId: 'char-alice',
  displayName: 'Alice',
  classRefId: 'barbarian',
  hp: { current: 17, max: 24 },
  ac: 14,
};

const FULL_ACTIONS: AvailableAction[] = [
  action('attack', 'Attack', EconomySlot.ACTION),
  action('dash', 'Dash', EconomySlot.ACTION, { targetKind: TargetKind.NONE }),
  action('dodge', 'Dodge', EconomySlot.ACTION, { targetKind: TargetKind.NONE }),
  action('rage', 'Rage', EconomySlot.BONUS_ACTION, {
    targetKind: TargetKind.SELF,
  }),
  action('hide', 'Hide', EconomySlot.ACTION, { targetKind: TargetKind.NONE }),
  action('help', 'Help', EconomySlot.ACTION),
];

export const COMBAT_PANEL_FIXTURES: CombatPanelFixture[] = [
  {
    id: 'my-turn-fresh',
    label: 'Your turn (fresh)',
    description:
      'Turn just started: full economy, every verb live. The panel should say "act now" at a glance.',
    mode: 'TURN_BASED',
    isMyTurn: true,
    activeName: 'Alice',
    viewer: alice,
    economy: economy(1, 1, 1, 30),
    actions: FULL_ACTIONS,
    reaction: 'ready',
  },
  {
    id: 'armed-attack',
    label: 'Attack armed',
    description:
      'Attack is armed and waiting for a target click (#514 flow). The armed verb pulses; guidance says what to do next.',
    mode: 'TURN_BASED',
    isMyTurn: true,
    activeName: 'Alice',
    viewer: alice,
    economy: economy(1, 1, 1, 30),
    actions: FULL_ACTIONS,
    armedActionKey: 'attack',
    reaction: 'ready',
  },
  {
    id: 'half-spent',
    label: 'Half spent',
    description:
      'Action used, movement partial: spent pips hollow out, used verbs disable with the server reason as tooltip.',
    mode: 'TURN_BASED',
    isMyTurn: true,
    activeName: 'Alice',
    viewer: alice,
    economy: economy(0, 1, 1, 10),
    actions: [
      action('attack', 'Attack', EconomySlot.ACTION, {
        available: false,
        reason: 'no actions remaining',
      }),
      action('dash', 'Dash', EconomySlot.ACTION, {
        available: false,
        reason: 'no actions remaining',
        targetKind: TargetKind.NONE,
      }),
      action('dodge', 'Dodge', EconomySlot.ACTION, {
        available: false,
        reason: 'no actions remaining',
        targetKind: TargetKind.NONE,
      }),
      action('rage', 'Rage', EconomySlot.BONUS_ACTION, {
        targetKind: TargetKind.SELF,
      }),
      action('hide', 'Hide', EconomySlot.ACTION, {
        available: false,
        reason: 'no actions remaining',
        targetKind: TargetKind.NONE,
      }),
      action('help', 'Help', EconomySlot.ACTION, {
        available: false,
        reason: 'no actions remaining',
      }),
    ],
    reaction: 'ready',
  },
  {
    id: 'reaction-spent',
    label: 'Reaction spent',
    description:
      'Opportunity attack already triggered this round: the chip reads as USED (struck through), not as an off toggle.',
    mode: 'TURN_BASED',
    isMyTurn: true,
    activeName: 'Alice',
    viewer: alice,
    economy: economy(1, 1, 0, 30),
    actions: FULL_ACTIONS,
    reaction: 'spent',
  },
  {
    id: 'spectator',
    label: "Someone else's turn",
    description:
      "Goblin's turn: verbs quiet down, the panel says whose turn it is instead of '(economy: waiting for the server)' (web#458).",
    mode: 'TURN_BASED',
    isMyTurn: false,
    activeName: 'Goblin',
    viewer: alice,
    economy: null,
    actions: [],
    reaction: 'ready',
  },
  {
    id: 'free-roam',
    label: 'Free roam',
    description:
      'Between combat pockets: no turn economy exists, so none is shown — no stale digits (web#516). Exploration verbs only.',
    mode: 'FREE_ROAM',
    isMyTurn: false,
    activeName: '',
    viewer: alice,
    economy: null,
    actions: [
      action('move', 'Move', EconomySlot.MOVEMENT, {
        targetKind: TargetKind.POSITION,
      }),
    ],
    reaction: 'unavailable',
  },
];
