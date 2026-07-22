/**
 * Combat-pacing fixtures (rpg-dnd5e-web#561) — the outside-in contract
 * bench for the attack-loop beat sequencer, same method as the equipment
 * concept's fixtures.ts (rpg-dnd5e-web#557/#531).
 *
 * `ActionResolvedLike`/`AttackResolvedLike`/`EntityDamagedLike` match the
 * generated `dnd5e.api.v1alpha2.encounter` proto messages field-for-field
 * (same names, same camelCase shapes) rather than importing the generated
 * classes directly — same rationale as equipmentTypes.ts. Two deliberate
 * exceptions, both noted at their field:
 *   - `sequence` is `number`, not the wire's `bigint` (int64) — every
 *     round-one scenario has under 10 events, far inside `number`'s exact
 *     range, and the event/intent inspector template-literals `seq
 *     ${e.sequence}` directly; a `bigint` would force every call site to
 *     `.toString()` it for no round-one benefit.
 *   - `ActionResolvedLike` omits `economyConsumed` — the beat sequencer
 *     never displays economy cost (that's the live action menu/dock's
 *     job, not this bench's), so it is not part of what this fixture
 *     needs to carry, matching the equipment concept's `ItemFixture`
 *     precedent of only including fields a consumer actually reads.
 *
 * `PacingFixtureEvent` carries `sequence` and `correlationId`, mirroring
 * the real `EncounterEvent` envelope's `event: { value, case }` oneof
 * shape — a fixture reads like a captured wire event (design.md §7).
 */

import type { RefLike } from '../../components/game/equipment/equipmentTypes';

export type Pace = 'cinematic' | 'brisk' | 'instant';

/** Matches ActionResolved (events_pb.ts) field-for-field, EXCEPT
 * `economyConsumed` — see file header. */
export interface ActionResolvedLike {
  actorEntityId: string;
  actionRef: RefLike;
  targetEntityId: string;
}

/** Matches AttackResolved (events_pb.ts) field-for-field. */
export interface AttackResolvedLike {
  attackerEntityId: string;
  targetEntityId: string;
  hit: boolean;
  critical: boolean;
  attackRoll: number;
  attackBonus: number;
  targetAc: number;
  hasAdvantage: boolean;
  advantageSources: RefLike[];
  hasDisadvantage: boolean;
  disadvantageSources: RefLike[];
}

/** Matches HitPoints (types_pb.ts) field-for-field, INCLUDING `temp`
 * (required `int32` on the wire, not optional) — every fixture below
 * supplies `temp: 0` explicitly rather than making it optional here,
 * so this type stays a true field-for-field match. */
export interface HitPointsLike {
  current: number;
  max: number;
  temp: number;
}

/** Matches EntityDamaged (events_pb.ts) field-for-field, except
 * `sourceEntityId`/`damageBreakdown` — omitted because the beat
 * sequencer's display only reads `amount` + `hpAfter` (same
 * only-what's-read rationale as `ActionResolvedLike` above). */
export interface EntityDamagedLike {
  entityId: string;
  amount: number;
  damageType: RefLike;
  hpAfter: HitPointsLike;
}

/** One envelope-like fixture event — `sequence`/`correlationId` mirror
 * the real `EncounterEvent` envelope; `case`/`value` mirrors its `event`
 * oneof discriminant naming exactly. */
export type PacingFixtureEvent =
  | {
      sequence: number;
      correlationId: string;
      case: 'actionResolved';
      value: ActionResolvedLike;
    }
  | {
      sequence: number;
      correlationId: string;
      case: 'attackResolved';
      value: AttackResolvedLike;
    }
  | {
      sequence: number;
      correlationId: string;
      case: 'entityDamaged';
      value: EntityDamagedLike;
    };

export interface CombatPacingScenario {
  id: string;
  label: string;
  description: string;
  viewerEntityId: string;
  role: 'self' | 'spectator';
  npcTier?: 'grunt' | 'elite' | 'boss';
  pace: Pace;
  events: PacingFixtureEvent[];
}

const slashing: RefLike = { module: 'dnd5e', type: 'damage', id: 'slashing' };
const attackRef: RefLike = {
  module: 'dnd5e',
  type: 'combat_abilities',
  id: 'attack',
};

const PLAYER = 'char-aldric';
const GOBLIN = 'npc-goblin-1';
const GRUNT = 'npc-goblin-grunt';

const npcAction = (
  sequence: number,
  correlationId: string,
  actorEntityId: string,
  targetEntityId: string
): PacingFixtureEvent => ({
  sequence,
  correlationId,
  case: 'actionResolved',
  value: { actorEntityId, actionRef: attackRef, targetEntityId },
});

const action = (
  sequence: number,
  correlationId: string,
  targetEntityId: string
): PacingFixtureEvent =>
  npcAction(sequence, correlationId, PLAYER, targetEntityId);

const npcAttack = (
  sequence: number,
  correlationId: string,
  attackerEntityId: string,
  targetEntityId: string,
  attack: Omit<AttackResolvedLike, 'attackerEntityId' | 'targetEntityId'>
): PacingFixtureEvent => ({
  sequence,
  correlationId,
  case: 'attackResolved',
  value: { attackerEntityId, targetEntityId, ...attack },
});

const attack = (
  sequence: number,
  correlationId: string,
  targetEntityId: string,
  a: Omit<AttackResolvedLike, 'attackerEntityId' | 'targetEntityId'>
): PacingFixtureEvent =>
  npcAttack(sequence, correlationId, PLAYER, targetEntityId, a);

const damage = (
  sequence: number,
  correlationId: string,
  entityId: string,
  amount: number,
  hpAfter: HitPointsLike
): PacingFixtureEvent => ({
  sequence,
  correlationId,
  case: 'entityDamaged',
  value: { entityId, amount, damageType: slashing, hpAfter },
});

const NO_ADV = { hasAdvantage: false, advantageSources: [] as RefLike[] };
const NO_DISADV = {
  hasDisadvantage: false,
  disadvantageSources: [] as RefLike[],
};

const playerHit: CombatPacingScenario = {
  id: 'player-hit',
  label: 'Player — hit',
  description: 'Declared strike, routine hit (roll 14+5=19 vs AC 16).',
  viewerEntityId: PLAYER,
  role: 'self',
  pace: 'cinematic',
  events: [
    action(1, 'corr-hit', GOBLIN),
    attack(2, 'corr-hit', GOBLIN, {
      hit: true,
      critical: false,
      attackRoll: 14,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
    damage(3, 'corr-hit', GOBLIN, 7, { current: 8, max: 15, temp: 0 }),
  ],
};

const playerMiss: CombatPacingScenario = {
  id: 'player-miss',
  label: 'Player — miss',
  description:
    'Declared strike, routine miss (roll 8+5=13 vs AC 16) — no EntityDamaged at all.',
  viewerEntityId: PLAYER,
  role: 'self',
  pace: 'cinematic',
  events: [
    action(1, 'corr-miss', GOBLIN),
    attack(2, 'corr-miss', GOBLIN, {
      hit: false,
      critical: false,
      attackRoll: 8,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
  ],
};

const playerCrit: CombatPacingScenario = {
  id: 'player-crit',
  label: 'Player — crit',
  description: 'Declared strike, critical hit (roll 20+5=25 vs AC 16).',
  viewerEntityId: PLAYER,
  role: 'self',
  pace: 'cinematic',
  events: [
    action(1, 'corr-crit', GOBLIN),
    attack(2, 'corr-crit', GOBLIN, {
      hit: true,
      critical: true,
      attackRoll: 20,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
    damage(3, 'corr-crit', GOBLIN, 14, { current: 1, max: 15, temp: 0 }),
  ],
};

const playerNat1: CombatPacingScenario = {
  id: 'player-nat1',
  label: 'Player — nat-1',
  description:
    'Declared strike, natural 1 (roll 1+5=6 vs AC 16) — playful, non-punitive, NOT critical.',
  viewerEntityId: PLAYER,
  role: 'self',
  pace: 'cinematic',
  events: [
    action(1, 'corr-nat1', GOBLIN),
    attack(2, 'corr-nat1', GOBLIN, {
      hit: false,
      critical: false,
      attackRoll: 1,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
  ],
};

const opportunityAttack: CombatPacingScenario = {
  id: 'opportunity-attack',
  label: 'Opportunity attack (no ActionResolved)',
  description:
    'NPC opportunity attack triggered by movement: AttackResolved + EntityDamaged, no ActionResolved — the toolkit resolves NPC OAs inline (design.md §"What we know about the wire"). The viewer is the TARGET, not the attacker, so this is spectator, not self.',
  viewerEntityId: PLAYER,
  role: 'spectator',
  pace: 'cinematic',
  events: [
    npcAttack(1, 'corr-oa', 'npc-goblin-2', PLAYER, {
      hit: true,
      critical: false,
      attackRoll: 16,
      attackBonus: 4,
      targetAc: 14,
      ...NO_ADV,
      ...NO_DISADV,
    }),
    damage(2, 'corr-oa', PLAYER, 5, { current: 20, max: 25, temp: 0 }),
  ],
};

const npcGruntSwing: CombatPacingScenario = {
  id: 'npc-grunt-swing',
  label: 'NPC grunt swing (Brisk)',
  description:
    "A goblin grunt attacks the viewer and misses — tiered Brisk so four goblins acting doesn't drag (design.md §4). The viewer is the TARGET, not the attacker, so this is spectator.",
  viewerEntityId: PLAYER,
  role: 'spectator',
  npcTier: 'grunt',
  pace: 'brisk',
  events: [
    npcAction(1, 'corr-grunt', GRUNT, PLAYER),
    npcAttack(2, 'corr-grunt', GRUNT, PLAYER, {
      hit: false,
      critical: false,
      attackRoll: 11,
      attackBonus: 3,
      targetAc: 15,
      ...NO_ADV,
      ...NO_DISADV,
    }),
  ],
};

const npcBossSwing: CombatPacingScenario = {
  id: 'npc-boss-swing',
  label: 'Elite/boss swing (Cinematic)',
  description:
    "A troll boss lands a crit — full Cinematic ceremony, the boss's crit should land like a player's (design.md §4).",
  viewerEntityId: PLAYER,
  role: 'spectator',
  npcTier: 'boss',
  pace: 'cinematic',
  events: [
    npcAttack(1, 'corr-boss', 'npc-troll-boss', PLAYER, {
      hit: true,
      critical: true,
      attackRoll: 19,
      attackBonus: 7,
      targetAc: 17,
      ...NO_ADV,
      ...NO_DISADV,
    }),
    damage(2, 'corr-boss', PLAYER, 22, { current: 3, max: 25, temp: 0 }),
  ],
};

const repeatedAttacks: CombatPacingScenario = {
  id: 'repeated-attacks',
  label: 'Repeated attacks (compression)',
  description:
    'Extra Attack: two swings in one turn — the first gets full ceremony, the second compresses (design.md §4).',
  viewerEntityId: PLAYER,
  role: 'self',
  pace: 'cinematic',
  events: [
    action(1, 'corr-rep-1', GOBLIN),
    attack(2, 'corr-rep-1', GOBLIN, {
      hit: true,
      critical: false,
      attackRoll: 15,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
    damage(3, 'corr-rep-1', GOBLIN, 6, { current: 9, max: 15, temp: 0 }),
    action(4, 'corr-rep-2', GOBLIN),
    attack(5, 'corr-rep-2', GOBLIN, {
      hit: false,
      critical: false,
      attackRoll: 9,
      attackBonus: 5,
      targetAc: 16,
      ...NO_ADV,
      ...NO_DISADV,
    }),
  ],
};

export const SCENARIOS: CombatPacingScenario[] = [
  playerHit,
  playerMiss,
  playerCrit,
  playerNat1,
  opportunityAttack,
  npcGruntSwing,
  npcBossSwing,
  repeatedAttacks,
];

export interface BeatGroupResult {
  correlationId: string;
  action?: ActionResolvedLike;
  attack?: AttackResolvedLike;
  damage?: EntityDamagedLike;
}

/** Splits a scenario's ordered fixture events into correlation groups,
 * preserving first-seen order. This is the concept adapter's one piece of
 * logic — explicitly a scenario-boundary convenience (design.md §7's own
 * caveat: a live reassembler has no such boundary to lean on). */
export function groupByCorrelation(
  events: PacingFixtureEvent[]
): BeatGroupResult[] {
  const order: string[] = [];
  const byId = new Map<string, BeatGroupResult>();
  for (const e of events) {
    if (!byId.has(e.correlationId)) {
      byId.set(e.correlationId, { correlationId: e.correlationId });
      order.push(e.correlationId);
    }
    const group = byId.get(e.correlationId)!;
    if (e.case === 'actionResolved') group.action = e.value;
    if (e.case === 'attackResolved') group.attack = e.value;
    if (e.case === 'entityDamaged') group.damage = e.value;
  }
  return order.map((id) => byId.get(id)!);
}
