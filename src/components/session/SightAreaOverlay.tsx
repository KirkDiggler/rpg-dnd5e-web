import type { SightArea } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { Billboard, Text } from '@react-three/drei';
import { Suspense } from 'react';
import { cubeToWorld } from '../hex-grid/hexMath';
import { NON_INTERACTIVE_FOOTPRINT_RAYCAST } from './AreaFootprintPreview';
import { positionToCube } from './positionBridge';

/** Temporary art for the provider's current, member-local sight volumes. */
export function SightAreaOverlay({
  areas,
  hexSize,
}: {
  areas: readonly SightArea[];
  hexSize: number;
}) {
  return (
    <group name="sight-areas">
      {areas.map((area) => {
        if (
          !area.center ||
          !Number.isFinite(area.radiusFeet) ||
          area.radiusFeet <= 0
        )
          return null;
        const center = cubeToWorld(positionToCube(area.center), hexSize);
        return (
          <group
            key={area.id}
            name={`sight-area-${area.id}`}
            position={[center.x, 0.24, center.z]}
          >
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
            >
              <circleGeometry
                args={[(area.radiusFeet * Math.sqrt(3) * hexSize) / 5, 48]}
              />
              <meshBasicMaterial
                color="#94a3b8"
                transparent
                opacity={0.5}
                depthWrite={false}
              />
            </mesh>
            <Billboard position={[0, 0.9, 0]}>
              <Suspense fallback={null}>
                <Text
                  fontSize={0.42}
                  color="white"
                  outlineColor="#1e293b"
                  outlineWidth={0.04}
                  raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
                >
                  {area.name || 'Fog'}
                </Text>
              </Suspense>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
