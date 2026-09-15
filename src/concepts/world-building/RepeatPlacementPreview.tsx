import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { Html } from '@react-three/drei';
import { Suspense } from 'react';
import type { GeneratedWorldBuildingCatalogEntry } from './catalog';
import type { WorldTransform } from './types';
import { WorldPropModel } from './WorldPropModel';

export function RepeatPlacementCount({ count }: { count: number }) {
  return (
    <output className="wb-repeat-preview-count" aria-live="polite">
      {count} {count === 1 ? 'piece' : 'pieces'}
    </output>
  );
}

export function RepeatPlacementPreview({
  entry,
  transforms,
}: {
  entry: GeneratedWorldBuildingCatalogEntry;
  transforms: readonly WorldTransform[];
}) {
  if (transforms.length === 0) return null;
  const last = transforms[transforms.length - 1]!;
  return (
    <group
      name="repeat-placement-preview"
      userData={{ count: transforms.length }}
    >
      {transforms.map((transform, index) => (
        <group key={index} name={`repeat-preview-copy-${index}`}>
          <Suspense fallback={null}>
            <ErrorBoundary fallback={null}>
              <WorldPropModel
                entry={entry}
                position={[transform.x, transform.y, transform.z]}
                rotationY={transform.rotationY}
              />
            </ErrorBoundary>
          </Suspense>
          <mesh
            position={[transform.x, DUNGEON_SURFACE_Y + 0.04, transform.z]}
            rotation={[-Math.PI / 2, 0, transform.rotationY]}
            raycast={() => null}
          >
            <planeGeometry args={[entry.asset.boundsMeters[0], 0.08]} />
            <meshBasicMaterial
              color="#67e8f9"
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
        </group>
      ))}
      <Html
        position={[
          last.x,
          DUNGEON_SURFACE_Y + entry.asset.boundsMeters[1] + 0.25,
          last.z,
        ]}
        center
      >
        <RepeatPlacementCount count={transforms.length} />
      </Html>
    </group>
  );
}
