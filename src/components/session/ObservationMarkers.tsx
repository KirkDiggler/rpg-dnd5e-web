import { Html } from '@react-three/drei';
import type { ReactElement } from 'react';
import type { WorldPos } from '../hex-grid/hexMath';
import type { SceneKnowledgeState } from '../hex-grid/sceneKnowledge';

/** Render annotations supplied by an observation adapter. No world lookup,
 * visibility calculation, state transition or interaction authority lives here. */
export interface ObservationMarker {
  readonly id: string;
  readonly label: string;
  readonly position: WorldPos;
  readonly knowledge: SceneKnowledgeState;
}
export interface ObservationMarkersProps {
  readonly markers: readonly ObservationMarker[];
}

export function ObservationMarkers({
  markers,
}: ObservationMarkersProps): ReactElement {
  return (
    <group name="observation-markers">
      {markers.map((marker) => {
        const remembered = marker.knowledge === 'remembered';
        const color = remembered ? '#fbbf24' : '#6ee7b7';
        return (
          <group
            key={marker.id}
            position={[marker.position.x, 0, marker.position.z]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
              <ringGeometry args={[0.45, 0.5, 32]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.85}
                depthWrite={false}
              />
            </mesh>
            <Html
              center
              position={[0, 1.4, 0]}
              style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
              zIndexRange={[20, 0]}
            >
              <span
                style={{
                  color,
                  background: '#111827ed',
                  border: `1px solid ${color}`,
                  borderRadius: 4,
                  padding: '3px 6px',
                  fontSize: 11,
                }}
              >
                {remembered ? 'Remembered' : 'Current'} · {marker.label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
