import { WORLD_BUILDING_CATALOG_BY_REF } from '@/concepts/world-building/catalog';
import type { WorldTransform } from '@/concepts/world-building/types';
import { WorldPropModel } from '@/concepts/world-building/WorldPropModel';
import { DUNGEON_POINT_LIGHT_BUDGET } from '@/rendering/dungeonLighting';
import { VisualPointLights } from '@/rendering/visualPointLights';
import { selectBoundedVisualPointLights } from '@/rendering/visualPointLightSelection';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { useMemo } from 'react';
import { projectCompositionPointLights } from './compositionLightSources';
import { decodeCompositionScene } from './compositionScene';

export interface CompositionModelProps {
  composition: Composition;
  /** Identity of this placement, distinct from the immutable composition ID. */
  instanceId: string;
  transform: WorldTransform;
  /** DungeonEnvironment owns the shared scene budget and disables leaf lights. */
  renderLights?: boolean;
}

/**
 * Draw one immutable composition snapshot beneath one independently movable
 * placement root. Each caller must wrap the entire component in one
 * per-placement Suspense/ErrorBoundary pair; that pair owns pending/failed GLB
 * presentation and also catches snapshot decode or prop-resolution failures.
 *
 * World Building stores prop transforms in scene coordinates; group/support
 * relations describe authoring behavior, while item transforms already contain
 * the resulting positions. Nesting them again would double transforms, so
 * every visual leaf remains directly relative to this root.
 */
export function CompositionModel({
  composition,
  instanceId,
  transform,
  renderLights = true,
}: CompositionModelProps) {
  const scene = useMemo(
    () => decodeCompositionScene(composition),
    [composition]
  );
  const lights = useMemo(
    () =>
      renderLights
        ? selectBoundedVisualPointLights(
            projectCompositionPointLights(scene, {
              compositionId: composition.id,
              placementId: instanceId,
              transform: { x: 0, y: 0, z: 0, rotationY: 0 },
            }),
            { x: 0, z: 0 },
            DUNGEON_POINT_LIGHT_BUDGET
          )
        : [],
    [composition.id, instanceId, renderLights, scene]
  );
  const leaves = useMemo(
    () =>
      scene.items.map((item) => {
        const entry = WORLD_BUILDING_CATALOG_BY_REF.get(item.assetRef);
        if (!entry) {
          throw new Error(`Composition prop has no model: ${item.assetRef}`);
        }
        return { item, entry };
      }),
    [scene]
  );

  return (
    <group
      name={`composition-placement-${instanceId}`}
      position={[transform.x, transform.y, transform.z]}
      rotation={[0, transform.rotationY, 0]}
      userData={{
        compositionId: composition.id,
        compositionWorldId: composition.worldId,
        compositionInstanceId: instanceId,
      }}
    >
      {leaves.map(({ item, entry }) => (
        <group key={item.id} name={`composition-leaf-${item.id}`}>
          <WorldPropModel
            entry={entry}
            position={[item.transform.x, item.transform.y, item.transform.z]}
            rotationY={item.transform.rotationY}
          />
        </group>
      ))}
      <VisualPointLights lights={lights} />
    </group>
  );
}
