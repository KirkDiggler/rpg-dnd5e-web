import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { Html } from '@react-three/drei';
import type { WorldPoint } from './types';

/** One resolved region's name in 3D: at its label's world point, in the
 * region's derived colour. Presentation only: never stored, never membership. */
export interface RegionLabel3D {
  id: string;
  text: string;
  location: WorldPoint;
  colour: string;
}

/** Floating region names over the 3D floor, one per resolved region. They
 * are display-only, like the actor chips: the Html wrapper and the chip are
 * pointer-transparent, so a label never swallows a canvas click. */
export function RegionLabels3D({
  labels,
}: {
  labels: readonly RegionLabel3D[];
}): React.JSX.Element {
  return (
    <>
      {labels.map((label) => (
        <group
          key={label.id}
          name={`region-label-${label.id}`}
          position={[
            label.location.x,
            DUNGEON_SURFACE_Y + 1.6,
            label.location.z,
          ]}
        >
          <Html center style={{ pointerEvents: 'none' }}>
            <output
              className="wb-region-label"
              aria-label={`Region ${label.text}`}
              style={{
                pointerEvents: 'none',
                color: label.colour,
                borderColor: label.colour,
              }}
            >
              {label.text}
            </output>
          </Html>
        </group>
      ))}
    </>
  );
}
