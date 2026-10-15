import {
  CompositionPlacementModel,
  type CompositionResolution,
} from '@/compositions/CompositionPlacementModel';
import { compositionIdFromRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { isExactPropRef } from '@/utils/refs';
import { Suspense } from 'react';
import { facingToYaw } from '../hex-grid/facingYaw';
import { resolvePropVariant } from '../hex-grid/propManifest';
import { PropModel } from '../hex-grid/PropModel';
import { REMEMBERED_TINT } from '../hex-grid/sceneKnowledge';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import { propWorldPosition, type SceneProp3D } from './atlasToScene3D';

export interface AtlasPropModelProps {
  prop: SceneProp3D;
  hexSize: number;
  orientation: 'pointy';
  compositionSource?: CompositionSource;
  compositionResolution?: CompositionResolution;
  /** Fog of war (rpg-project#586): the prop stands on a remembered cell.
   * Applied to catalogue props and the placeholder; a composition placement
   * has no remembered treatment of its own yet and draws lit. */
  remembered?: boolean;
}

export function AtlasPropModel({
  prop,
  hexSize,
  compositionSource,
  compositionResolution,
  remembered = false,
}: AtlasPropModelProps) {
  const world = propWorldPosition(prop, hexSize);
  const compositionId = compositionIdFromRef(prop.ref);
  if (compositionId) {
    return (
      <CompositionPlacementModel
        compositionId={compositionId}
        instanceId={prop.id ?? ''}
        source={compositionSource}
        managedResolution={compositionResolution}
        renderLights={false}
        transform={{
          x: world.x,
          y: world.y,
          z: world.z,
          rotationY: facingToYaw(prop.facing),
        }}
      />
    );
  }
  const placeholder = (
    <mesh position={[world.x, hexSize * 0.5, world.z]}>
      <cylinderGeometry args={[hexSize * 0.3, hexSize * 0.3, hexSize, 6]} />
      <meshStandardMaterial color={remembered ? REMEMBERED_TINT : '#a16207'} />
    </mesh>
  );
  const variant = resolvePropVariant(prop.ref);
  if (!variant) return isExactPropRef(prop.ref) ? null : placeholder;
  return (
    <Suspense fallback={placeholder}>
      <ErrorBoundary fallback={placeholder}>
        <PropModel
          variant={variant}
          position={[world.x, world.y, world.z]}
          rotationY={facingToYaw(prop.facing)}
          remembered={remembered}
        />
      </ErrorBoundary>
    </Suspense>
  );
}
