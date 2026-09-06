import { PropModel } from '@/components/hex-grid/PropModel';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import type { WorldTransform } from '@/concepts/world-building/types';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { useMemo } from 'react';
import { decodeCompositionScene } from './compositionScene';

export interface CompositionModelProps {
  composition: Composition;
  /** Optional placed-prop instance identity; the composition itself is immutable. */
  instanceId?: string;
  transform: WorldTransform;
}

/**
 * Draw one immutable composition snapshot beneath one independently movable
 * placement root. World Building stores prop transforms in scene coordinates;
 * group/support relations describe authoring behavior, while item transforms
 * already contain the resulting positions. Nesting them again would double
 * transforms, so every visual leaf remains directly relative to this root.
 */
export function CompositionModel({
  composition,
  instanceId = composition.id,
  transform,
}: CompositionModelProps) {
  const scene = useMemo(
    () => decodeCompositionScene(composition),
    [composition]
  );
  const leaves = useMemo(
    () =>
      scene.items.map((item) => {
        const variant = resolvePropVariant(item.assetRef);
        if (!variant) {
          throw new Error(`Composition prop has no model: ${item.assetRef}`);
        }
        return { item, variant };
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
      {leaves.map(({ item, variant }) => (
        <group key={item.id} name={`composition-leaf-${item.id}`}>
          <PropModel
            variant={variant}
            position={[item.transform.x, item.transform.y, item.transform.z]}
            rotationY={item.transform.rotationY}
            anchor="bounds-floor-center"
          />
        </group>
      ))}
    </group>
  );
}
