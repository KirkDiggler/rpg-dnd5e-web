import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import type { ThreeEvent } from '@react-three/fiber';
import type { SiteConcealments } from './siteScope';
import { wallDirectionYaw, wallLength } from './structuralWallEditing';
import { wallSolidIntervals } from './structuralWallGeometry';
import type { StructuralWall } from './structuralWalls';

/** Explicit membership hit targets. A wall's gaps never pick the wall: an
 * attached door has its own target and source id. Passive highlights do not
 * intercept any other tool's floor gestures. No mesh creates membership. */
export function StructuralConcealmentGuides({
  walls,
  concealments,
  activeId,
  onPick,
}: {
  walls: readonly StructuralWall[];
  concealments?: SiteConcealments;
  activeId?: string | null;
  onPick?: (id: string) => void;
}) {
  const picking = Boolean(activeId && onPick);
  const colorFor = (id: string): string | undefined => {
    if (activeId && concealments?.[activeId]?.props?.includes(id))
      return '#fbbf24';
    return Object.values(concealments ?? {}).some((secret) =>
      secret.props?.includes(id)
    )
      ? '#c084fc'
      : undefined;
  };
  return (
    <group name="structural-concealment-guides">
      {walls.map((wall) => {
        const length = wallLength(wall);
        const targets = [
          ...wallSolidIntervals({
            wall,
            extent: { start: 0, end: length },
          }).map((span, index) => ({
            key: `wall-${wall.id}-${index}`,
            id: wall.id,
            center: (span.start + span.end) / 2,
            width: span.end - span.start,
          })),
          ...wall.openings.flatMap((opening) =>
            opening.door
              ? [
                  {
                    key: `door-${opening.door.id}`,
                    id: opening.door.id,
                    center: opening.position,
                    width: opening.width,
                  },
                ]
              : []
          ),
        ];
        return (
          <group
            key={wall.id}
            position={[
              wall.line.start.x,
              DUNGEON_SURFACE_Y +
                wall.appearance.elevation +
                wall.appearance.height / 2,
              wall.line.start.z,
            ]}
            rotation={[0, wallDirectionYaw(wall), 0]}
          >
            {targets.map((target) => {
              const color = colorFor(target.id);
              if (!picking && !color) return null;
              const pick = (event: ThreeEvent<PointerEvent>) => {
                if (!picking || event.button !== 0) return;
                event.stopPropagation();
                onPick?.(target.id);
              };
              return (
                <mesh
                  key={target.key}
                  name={`concealment-${target.key}`}
                  position={[target.center, 0, 0]}
                  {...(!picking ? { raycast: () => null } : {})}
                  onPointerDown={picking ? pick : undefined}
                >
                  <boxGeometry
                    args={[
                      target.width,
                      wall.appearance.height,
                      wall.appearance.thickness,
                    ]}
                  />
                  <meshBasicMaterial
                    color={color ?? '#ffffff'}
                    wireframe={Boolean(color)}
                    transparent
                    opacity={color ? 0.9 : 0}
                    colorWrite={Boolean(color)}
                    depthWrite={false}
                    depthTest={false}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
