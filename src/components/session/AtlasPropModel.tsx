import { isExactPropRef } from '@/utils/refs';
import { Suspense } from 'react';
import { facingToYaw } from '../hex-grid/facingYaw';
import { resolvePropVariant } from '../hex-grid/propManifest';
import { PropModel } from '../hex-grid/PropModel';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import { propWorldPosition, type SceneProp3D } from './atlasToScene3D';

export interface AtlasPropModelProps {
  prop: SceneProp3D;
  hexSize: number;
  orientation: 'pointy';
}

export function AtlasPropModel({ prop, hexSize }: AtlasPropModelProps) {
  const world = propWorldPosition(prop, hexSize);
  const placeholder = (
    <mesh position={[world.x, hexSize * 0.5, world.z]}>
      <cylinderGeometry args={[hexSize * 0.3, hexSize * 0.3, hexSize, 6]} />
      <meshStandardMaterial color="#a16207" />
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
        />
      </ErrorBoundary>
    </Suspense>
  );
}
