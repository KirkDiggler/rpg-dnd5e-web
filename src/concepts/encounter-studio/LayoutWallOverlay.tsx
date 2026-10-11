import {
  doorBindingState,
  type DoorBindings,
} from '../world-building/doorBindingEdits';
import { wallLength } from '../world-building/structuralWallEditing';
import { wallSolidIntervals } from '../world-building/structuralWallGeometry';
import { worldToClient, type LayoutTransform } from './layoutGeometry';
import type {
  StructuralWall,
  StudioDoorTarget,
  WallLine,
  WorldPoint,
} from './studioSession';

export interface LayoutWallPreview {
  line: WallLine;
  wall?: StructuralWall;
  point: WorldPoint;
  feedback: string;
}
interface LayoutWallOverlayProps {
  walls: readonly StructuralWall[];
  doorBindings?: DoorBindings;
  selectedDoor?: StudioDoorTarget | null;
  transform: LayoutTransform;
  selectedId: string | null;
  interactive: boolean;
  preview: LayoutWallPreview | null;
  /** Body precedes labels; handles follow labels to enforce Select priority. */
  layer: 'body' | 'handles';
}

/** SVG pixel projection of canonical walls. Openings cut the visible structure,
 * not a second door pose. Hits and handles remain usable at every zoom. */
export function LayoutWallOverlay({
  walls,
  doorBindings,
  selectedDoor,
  transform,
  selectedId,
  interactive,
  preview,
  layer,
}: LayoutWallOverlayProps): React.JSX.Element {
  const project = (point: WorldPoint): { x: number; y: number } => {
    const client = worldToClient(point, transform)!;
    return {
      x: client.x - transform.bounds.left,
      y: client.y - transform.bounds.top,
    };
  };
  const lineProps = (
    line: WallLine
  ): { x1: number; y1: number; x2: number; y2: number } => {
    const start = project(line.start),
      end = project(line.end);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  };
  return (
    <g
      className={`es-layout-walls-${layer}`}
      pointerEvents={interactive ? undefined : 'none'}
    >
      {walls.map((source) => {
        const wall = preview?.wall?.id === source.id ? preview.wall : source;
        if (layer === 'handles') {
          if (wall.id !== selectedId || !interactive) return null;
          return (
            <g key={wall.id}>
              {(['start', 'end'] as const).map((endpoint) => {
                const point = project(wall.line[endpoint]);
                return (
                  <g key={endpoint}>
                    <circle
                      data-wall-id={wall.id}
                      data-wall-endpoint={endpoint}
                      cx={point.x}
                      cy={point.y}
                      r={7}
                      fill="#a7ffeb"
                      stroke="#101923"
                      strokeWidth={2}
                      pointerEvents="all"
                      aria-label={`${endpoint} endpoint of ${wall.label}`}
                    />
                    <text
                      x={point.x + 10}
                      y={point.y - 10}
                      fontSize={11}
                      fill="#a7ffeb"
                      pointerEvents="none"
                    >
                      {endpoint === 'start' ? 'Start' : 'End'}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        }
        const length = wallLength(wall);
        const spans = wallSolidIntervals({
          wall,
          extent: { start: 0, end: length },
        });
        const along = (distance: number): WorldPoint => ({
          x:
            wall.line.start.x +
            ((wall.line.end.x - wall.line.start.x) * distance) / length,
          z:
            wall.line.start.z +
            ((wall.line.end.z - wall.line.start.z) * distance) / length,
        });
        return (
          <g key={wall.id} data-rendered-wall-id={wall.id}>
            {spans.map((span, index) => (
              <line
                key={index}
                data-wall-span={wall.id}
                {...lineProps({
                  start: along(span.start),
                  end: along(span.end),
                })}
                stroke={wall.id === selectedId ? '#a7ffeb' : '#e0d3ba'}
                strokeWidth={5}
                pointerEvents="none"
              />
            ))}
            {interactive && (
              <line
                data-wall-id={wall.id}
                {...lineProps(wall.line)}
                stroke="transparent"
                strokeWidth={18}
                pointerEvents="stroke"
              />
            )}
            {wall.openings
              .filter((opening) => opening.door)
              .map((opening) => {
                const selected =
                  selectedDoor?.wallId === wall.id &&
                  selectedDoor.openingId === opening.id &&
                  selectedDoor.doorId === opening.door!.id;
                const center = project(along(opening.position));
                const state = doorBindingState(
                  doorBindings?.[opening.door!.id]
                );
                return (
                  <g
                    key={opening.id}
                    data-wall-id={wall.id}
                    data-door-id={opening.door!.id}
                    data-opening-id={opening.id}
                    data-door-state={state}
                  >
                    <line
                      {...lineProps({
                        start: along(opening.position - opening.width / 2),
                        end: along(opening.position + opening.width / 2),
                      })}
                      stroke={selected ? '#fbbf24' : '#22d3ee'}
                      strokeWidth={state === 'open' ? 2 : 5}
                      strokeDasharray={state === 'open' ? '4 3' : undefined}
                      pointerEvents="none"
                    />
                    {interactive && (
                      <circle
                        cx={center.x}
                        cy={center.y}
                        r={8}
                        fill={selected ? '#fbbf24' : '#22d3ee'}
                        stroke="#101923"
                        strokeWidth={2}
                        pointerEvents="all"
                        aria-label={`Door ${opening.door!.id}`}
                      />
                    )}
                  </g>
                );
              })}
          </g>
        );
      })}
      {layer === 'body' && preview && (
        <g pointerEvents="none" aria-hidden="true">
          {!preview.wall && (
            <line
              data-wall-preview="create"
              {...lineProps(preview.line)}
              stroke="#a7ffeb"
              strokeWidth={4}
              strokeDasharray="6 4"
            />
          )}
          <circle
            data-wall-feedback={preview.feedback}
            cx={project(preview.point).x}
            cy={project(preview.point).y}
            r={4}
            fill="#67d8c2"
          />
          <text
            x={project(preview.point).x + 10}
            y={project(preview.point).y - 10}
            fontSize={12}
            fill="#fff4d8"
          >
            {preview.feedback}
          </text>
        </g>
      )}
    </g>
  );
}
