/**
 * Prop-resolution signals -> reference key (rpg-dnd5e-web#528, charter
 * #523). Two independent signals exist on the wire TODAY, from two proto
 * generations, and this module resolves both:
 *
 * 1. v1alpha2 `Entity.data` (`obstacle`/`prop` oneof cases) — the shape
 *    that actually backs today's LIVE EncounterView route (via
 *    useEncounterState's EntityMeta.propRefId, populated in
 *    EncounterView.tsx from ObstacleData.obstacle_ref.id / PropData.
 *    prop_ref.id). A `Ref.id` (e.g. "barrel") is already the exact tail
 *    segment of the dnd5e:props:<name> convention — the SAME id shape
 *    this codebase already reads for monster_ref/class_ref
 *    (classCharacterModels.ts). Composing the key is mechanical:
 *    `dnd5e:props:${refId}`, no hand-authored table needed, and it
 *    activates automatically the moment platform starts populating
 *    either ref (rpg-dnd5e-web#523's hand-off) — verified against
 *    rpg-api's `main` (2026-07-19, commit 8c770a2) that NO server code
 *    path sets obstacle_ref or prop_ref yet (`grep -rn
 *    "EntityType_ENTITY_TYPE_OBSTACLE\|obstacleRef\|propRef" internal/`
 *    turns up nothing that constructs one), so this signal is always
 *    undefined in practice today — real route evidence for this PR
 *    proves the resolver via a client-side dev-only injected refId, not
 *    a faked server response (see the PR's evidence doc).
 *
 * 2. v1alpha1 `EntityState.details.obstacleDetails.obstacleType`
 *    (`ObstacleType` enum, @kirkdiggler/rpg-api-protos' encounter_pb.ts)
 *    — generated, shipped, but not the shape the live route's stream
 *    events use (entityHelpers.ts's mapEntitiesForRender, which reads
 *    this field, has no production caller today — see its own file).
 *    Kept as a secondary signal in case a v1alpha1-shaped consumer ever
 *    needs it; HexEntity.tsx prefers the v2 propRefId signal whenever
 *    both are present (resolvePropKeyForEntity below).
 *
 * Mapping #2 is intentionally conservative: an ObstacleType only gets an
 * entry here when a shipped prop key is a genuine semantic match. Several
 * enum values (STATUE, ALTAR, BRAZIER, TABLE) have no matching piece in
 * the wave-1 catalog (rpg-game-assets#12) — left unmapped rather than
 * force-fit onto an unrelated key, same judgment call the asset side made
 * for SM_Prop_Globe_01/SM_Prop_Papers_01. Unmapped/unresolved signals of
 * either kind fall back to HexEntity's existing primitive-shape
 * rendering, unchanged.
 */

import { ObstacleType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { resolvePropVariant, type PropVariant } from './propManifest';

/** Compose a v1alpha2 Ref.id (obstacle_ref or prop_ref) into a prop
 * reference key. Mechanical, table-free — the id IS the key's tail
 * segment by convention. Undefined for an undefined/empty refId. */
export function resolvePropKeyForRefId(
  refId: string | undefined
): string | undefined {
  if (!refId) return undefined;
  return `dnd5e:props:${refId}`;
}

const OBSTACLE_TYPE_TO_PROP_KEY: Partial<Record<ObstacleType, string>> = {
  [ObstacleType.STALAGMITE]: 'dnd5e:props:stalagmite',
  // BOULDER: closest shipped semantic match is the rock-pile family (a
  // rockfall/formation obstacle), not a single discrete boulder piece —
  // judgment call, revisit if a dedicated boulder piece ships.
  [ObstacleType.BOULDER]: 'dnd5e:props:rock-pile',
  [ObstacleType.PILLAR]: 'dnd5e:props:pillar',
  [ObstacleType.SARCOPHAGUS]: 'dnd5e:props:tomb',
  [ObstacleType.CRATE]: 'dnd5e:props:crate',
  [ObstacleType.BARREL]: 'dnd5e:props:barrel',
};

/** Resolve a server-sent ObstacleType to a prop reference key, or
 * undefined for UNSPECIFIED / an unmapped type (STATUE, ALTAR, BRAZIER,
 * TABLE today) / an undefined obstacleType entirely. */
export function resolvePropKeyForObstacleType(
  obstacleType: ObstacleType | undefined
): string | undefined {
  if (obstacleType === undefined) return undefined;
  return OBSTACLE_TYPE_TO_PROP_KEY[obstacleType];
}

/** Convenience one-shot: ObstacleType straight to a resolved manifest
 * variant, or undefined if unmapped/unresolvable. Callers needing the
 * intermediate key (e.g. for logging) should compose
 * resolvePropKeyForObstacleType + resolvePropVariant themselves instead. */
export function resolvePropVariantForObstacleType(
  obstacleType: ObstacleType | undefined
): PropVariant | undefined {
  return resolvePropVariant(resolvePropKeyForObstacleType(obstacleType));
}

export interface EntityPropSignals {
  /** v1alpha1 EntityState.details.obstacleDetails.obstacleType. */
  obstacleType?: ObstacleType;
  /** v1alpha2 ObstacleData.obstacle_ref.id / PropData.prop_ref.id. */
  propRefId?: string;
}

/**
 * Resolve a reference key from whichever prop signal(s) an entity
 * carries, preferring the v1alpha2 `propRefId` (the richer, live-route
 * signal — a direct id, not an enum needing a hand-authored table) over
 * the v1alpha1 `obstacleType` enum mapping when both are present.
 * Returns undefined when neither signal is set or resolves.
 */
export function resolvePropKeyForEntity(
  signals: EntityPropSignals
): string | undefined {
  return (
    resolvePropKeyForRefId(signals.propRefId) ??
    resolvePropKeyForObstacleType(signals.obstacleType)
  );
}

/** Convenience one-shot: entity prop signals straight to a resolved
 * manifest variant, or undefined if neither signal resolves. */
export function resolvePropVariantForEntity(
  signals: EntityPropSignals
): PropVariant | undefined {
  return resolvePropVariant(resolvePropKeyForEntity(signals));
}
