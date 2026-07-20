/**
 * Combat-log fixtures (round 7 — Kirk: "can we get the combat log to be
 * toggled on. we always want to see the info there.").
 *
 * Shaped EXACTLY like useCombatLog's CombatLogEntry union — the floating
 * panel renders these through the real CombatLog component, so the live
 * slice is a pure data-source swap (useCombatLog feeds it instead of
 * fixtures). Built with the same `as unknown as T` proto-mock idiom as
 * fixtures.ts.
 *
 * The sequence demonstrates: attack MISS, attack HIT + damage with a
 * breakdown, a condition applied, turn boundaries, a CRIT against the
 * viewer — ~9 entries so the capped panel shows newest-at-bottom with
 * scrollable history.
 */

import type { CombatLogEntry } from '../../hooks/useCombatLog';

type E<K extends CombatLogEntry['kind']> = Extract<
  CombatLogEntry,
  { kind: K }
>['event'];

/**
 * Field names are compile-checked against the real event type (a typo'd
 * key is an error); values stay loose because proto-ES event types are
 * nominal `Message` intersections a plain literal can't satisfy — the
 * fixture idiom casts at the boundary, same as fixtures.ts.
 */
function entry<K extends CombatLogEntry['kind']>(
  id: number,
  round: number,
  kind: K,
  event: Partial<Record<keyof E<K>, unknown>>
): CombatLogEntry {
  return { id, round, kind, event: event as unknown as E<K> } as CombatLogEntry;
}

export const CONCEPT_LOG_ENTRIES: CombatLogEntry[] = [
  entry(1, 1, 'turnStarted', { round: 1, entityId: 'goblin-3' }),
  entry(2, 1, 'attack', {
    attackerEntityId: 'goblin-3',
    targetEntityId: 'char-alice',
    hit: false,
    critical: false,
    attackRoll: 8,
    attackBonus: 4,
    targetAc: 14,
    hasAdvantage: false,
    hasDisadvantage: false,
    advantageSources: [],
    disadvantageSources: [],
  }),
  entry(3, 1, 'turnEnded', { entityId: 'goblin-3' }),
  entry(4, 1, 'turnStarted', { round: 1, entityId: 'char-alice' }),
  entry(5, 1, 'attack', {
    attackerEntityId: 'char-alice',
    targetEntityId: 'goblin-3',
    hit: true,
    critical: false,
    attackRoll: 14,
    attackBonus: 5,
    targetAc: 13,
    hasAdvantage: false,
    hasDisadvantage: false,
    advantageSources: [],
    disadvantageSources: [],
  }),
  entry(6, 1, 'damage', {
    entityId: 'goblin-3',
    amount: 7,
    damageType: { module: 'dnd5e', type: 'damage', id: 'slashing' },
    damageBreakdown: [
      { source: 'shortsword', amount: 5, isCritical: false },
      { source: 'sneak_attack', amount: 2, isCritical: false },
    ],
    hpAfter: { current: 3, max: 10 },
  }),
  entry(7, 1, 'statusApplied', {
    entityId: 'char-bob',
    sourceEntityId: 'char-bob',
    status: { source: { module: 'dnd5e', type: 'condition', id: 'raging' } },
  }),
  entry(8, 2, 'turnStarted', { round: 2, entityId: 'goblin-3' }),
  entry(9, 2, 'attack', {
    attackerEntityId: 'goblin-3',
    targetEntityId: 'char-alice',
    hit: true,
    critical: true,
    attackRoll: 20,
    attackBonus: 4,
    targetAc: 14,
    hasAdvantage: false,
    hasDisadvantage: false,
    advantageSources: [],
    disadvantageSources: [],
  }),
  entry(10, 2, 'damage', {
    entityId: 'char-alice',
    amount: 7,
    damageType: { module: 'dnd5e', type: 'damage', id: 'piercing' },
    damageBreakdown: [{ source: 'scimitar', amount: 7, isCritical: true }],
    hpAfter: { current: 17, max: 24 },
  }),
  entry(11, 2, 'turnStarted', { round: 2, entityId: 'char-alice' }),
];
