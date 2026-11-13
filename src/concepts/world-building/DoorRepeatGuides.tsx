import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { doorFrameExtents } from './doorwayPlacement';
import { wallDirectionYaw, wallLength } from './structuralWallEditing';
import type { StudioDoorPreview } from './studioDoorEditing';

/** Transient editor guides, never geometry, blockers or delivered play state. */
export function DoorRepeatGuides({ preview }: { preview: StudioDoorPreview }) {
  if (!preview.valid || !preview.repeatGuide) return null;
  const {
    wall,
    repeatGuide: { period, origin },
  } = preview;
  const first = Math.ceil(-origin / period);
  const count = Math.min(
    512,
    Math.max(0, Math.floor((wallLength(wall) - origin) / period) - first + 1)
  );
  const opening = wall.openings.find((o) => o.id === preview.target.openingId)!;
  const extent = doorFrameExtents(opening.door?.assetRef, opening.width);
  const points = [
    ...Array.from({ length: count }, (_, i) => ({
      x: origin + (first + i) * period,
      color: '#65c9ff',
      key: `repeat-${i}`,
    })),
    { x: opening.position - extent.left, color: '#ffb05b', key: 'frame-start' },
    { x: opening.position + extent.right, color: '#ffb05b', key: 'frame-end' },
  ];
  return (
    <group
      name="door-placement-repeat-guides"
      position={[
        wall.line.start.x,
        wall.appearance.elevation + DUNGEON_SURFACE_Y,
        wall.line.start.z,
      ]}
      rotation={[0, wallDirectionYaw(wall), 0]}
    >
      {points.map((point) => (
        <mesh
          key={point.key}
          name={point.key}
          position={[point.x, wall.appearance.height / 2, 0]}
          raycast={() => null}
          renderOrder={100}
        >
          <boxGeometry args={[0.018, wall.appearance.height + 0.35, 0.018]} />
          <meshBasicMaterial
            color={point.color}
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
