import { mark, markIfArmed, takeArmedMark } from '@/dev/perfMarks';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { doorAlongWall } from '../world-building/studioDoorEditing';
import {
  clientToWorld,
  createLayoutTransform,
  layoutCellCenter,
  layoutCellCorners,
  layoutWorkspaceCells,
  MAX_LAYOUT_ZOOM,
  MIN_LAYOUT_ZOOM,
  panLayoutFrame,
  pickLayoutCell,
  zoomLayoutFrame,
  type ClientPoint,
  type LayoutBounds,
} from './layoutGeometry';
import type {
  LayoutFloorTool,
  LayoutFrame,
  LayoutViewportProps,
  RoomHexCell,
  StructuralWall,
  StudioDoorEditing,
  StudioDoorTarget,
  StudioWallEditing,
  WorldPoint,
} from './studioSession';

import { cellsInWorldRectangle, floorCells } from '../world-building/roomDraft';
import {
  reshapeWallEndpoint,
  snapWallEndpoint,
  snapWallPoint,
  translateWall,
} from '../world-building/structuralWallEditing';
import { useContentWorkspace } from '../world-building/usePresentationWorkspace';
import {
  constrainWallPoint,
  pointOnWallAxis,
  wallAngleReference,
  type WallAngleReference,
} from '../world-building/wallAngleConstraint';
import { snapPerpendicularCorner } from '../world-building/wallCornerJoins';
import {
  cellAtWorldPoint,
  rectangleOf,
  workspaceBounds,
} from '../world-building/workspaceGeometry';
import { MAX_WORLD_COORD } from '../world-building/worldBounds';
import { LayoutPlacedOverlay } from './LayoutPlacedOverlay';
import { LayoutWallOverlay, type LayoutWallPreview } from './LayoutWallOverlay';
import { MapLabelOverlay } from './MapLabelOverlay';
import { regionOverview } from './overviewColours';
import { frameOf } from './overviewFrame';
import { RegionBoundaryOverlay } from './RegionBoundaryOverlay';

/** A point an author may place a note at: finite and within the world
 * bound. The canvas is unbounded (rpg-project#725 R3), so no grid edge
 * refuses it. */
const withinWorld = (point: WorldPoint): boolean =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.z) &&
  Math.abs(point.x) <= MAX_WORLD_COORD &&
  Math.abs(point.z) <= MAX_WORLD_COORD;

/** The route being picked, drawn over the map: each leg from waypoint to
 * waypoint, the closing leg dashed (a route loops), and each waypoint a
 * numbered disc on its cell (rpg-project#720). Presentation only — the legs
 * are straight lines between centres, not the engine's hex line. */
function LayoutRouteOverlay({
  waypoints,
  loop,
  transform,
}: {
  waypoints: readonly RoomHexCell[];
  loop: boolean;
  transform: string | undefined;
}): React.JSX.Element {
  const centres = waypoints.map(layoutCellCenter);
  const legs = centres.slice(1).map((to, i) => [centres[i]!, to] as const);
  const closing =
    loop && centres.length > 2
      ? ([centres[centres.length - 1]!, centres[0]!] as const)
      : null;
  return (
    <g
      transform={transform}
      pointerEvents="none"
      aria-label="Route being picked"
      data-testid="route-pick-overlay"
    >
      {legs.map(([from, to], i) => (
        <line
          key={`leg-${i}`}
          x1={from.x}
          y1={from.z}
          x2={to.x}
          y2={to.z}
          stroke="#ffd36e"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {closing && (
        <line
          x1={closing[0].x}
          y1={closing[0].z}
          x2={closing[1].x}
          y2={closing[1].z}
          stroke="#ffd36e"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {centres.map((centre, i) => (
        <g key={`stop-${i}`} data-route-waypoint={i}>
          <circle
            cx={centre.x}
            cy={centre.z}
            r={0.42}
            fill="#ffd36e"
            stroke="#1b1300"
            strokeWidth={0.05}
          />
          <text
            x={centre.x}
            y={centre.z + 0.17}
            fontSize={0.48}
            textAnchor="middle"
            fill="#1b1300"
            fontWeight="bold"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

type WallConstraint = { anchor: WorldPoint; reference: WallAngleReference };

// World-space polygons stay stable through pan/zoom and preview-only renders.
const LayoutGrid = memo(function LayoutGrid({
  cells,
  committed,
}: {
  cells: readonly RoomHexCell[];
  committed: ReadonlySet<string>;
}): React.JSX.Element {
  return (
    <>
      {cells.map((cell) => (
        <polygon
          key={cellKey(cell)}
          data-cell={cellKey(cell)}
          data-walkable={committed.has(cellKey(cell))}
          points={polygonPoints(cell)}
          fill={committed.has(cellKey(cell)) ? '#44687a' : '#182633'}
          stroke="#2d414e"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
});
const polygonPoints = (cell: RoomHexCell): string =>
  layoutCellCorners(cell)
    .map((p) => `${p.x},${p.z}`)
    .join(' ');

type Gesture = {
  pointerId: number;
  surface: SVGSVGElement;
  tool: LayoutFloorTool | 'pan' | 'label' | 'wall' | 'door';
  client: ClientPoint;
  moved: boolean;
  commitFloor: LayoutViewportProps['onCommit'];
  wall?: {
    source?: StructuralWall;
    endpoint?: 'start' | 'end';
    start: WorldPoint;
    preview: LayoutWallPreview | null;
    valid: boolean;
    editing: StudioWallEditing;
    constraint?: WallConstraint;
  };
  door?: {
    target: StudioDoorTarget;
    wall: StructuralWall;
    origin: number;
    anchor: number;
    position: number;
    valid: boolean;
    editing: StudioDoorEditing;
  };
  anchor: WorldPoint;
  cells: Map<string, RoomHexCell>;
  /** A rectangle past the paint cap: refused on release, never silent. */
  refusal?: string;
  label?: {
    id: string | null;
    origin: WorldPoint;
    location: WorldPoint;
    valid: boolean;
    commit(location: WorldPoint): boolean;
  };
};
const cellKey = (cell: RoomHexCell): string => `${cell.q},${cell.r}`;
const pointerPoint = (
  event: ReactPointerEvent<SVGSVGElement>
): ClientPoint => ({
  x: event.clientX,
  y: event.clientY,
});

/** Controlled schematic only: the owner decides whether a completed floor or
 * wall or label gesture is accepted. Previews and pointer capture are transient. */
function snapEndpoint(
  point: WorldPoint,
  editing: StudioWallEditing,
  walls: readonly StructuralWall[],
  scale: number,
  excludedWallId?: string,
  constraint?: WallConstraint
): { point: WorldPoint; snapped: boolean; joined: boolean; feedback?: string } {
  const constrained = constraint
    ? constrainWallPoint({ ...constraint, point })
    : undefined;
  const desired = constrained?.point ?? point;
  const accept =
    constraint && constrained
      ? (candidate: WorldPoint): boolean =>
          pointOnWallAxis({
            anchor: constraint.anchor,
            point: candidate,
            direction: constrained.direction,
          })
      : undefined;
  const endpoint = snapWallEndpoint({
    point: desired,
    enabled: editing.endpointSnapEnabled,
    walls,
    excludedWallId,
    radius: 12 / scale,
    accept,
  });
  if (endpoint.snapped)
    return {
      ...endpoint,
      joined: true,
      feedback: constrained
        ? `Joined endpoint · ${constrained.feedback}`
        : undefined,
    };
  const grid = snapWallPoint({ point: desired, enabled: editing.snapEnabled });
  const allowed = !accept || accept(grid.point);
  return {
    ...(allowed ? grid : { point: desired, snapped: false }),
    joined: false,
    feedback: constrained
      ? `${constrained.feedback}${grid.snapped && allowed ? ' · hex snapped' : ''}`
      : undefined,
  };
}

export function LayoutViewport({
  draft,
  tool,
  frame,
  onFrameChange,
  onCommit,
  onRefuse,
  labelEditing,
  documentContext,
  wallEditing,
  doorEditing,
  regionEditing,
  selectedRegion,
  onSelectRegion,
  patternStart,
  onExitDoorTool,
  intentEpoch,
  onExitWallTool,
  onSelectHex,
  onClearSelection,
  placedEditing,
  exits,
  concealedCells,
  frameTarget,
  routePick,
}: LayoutViewportProps): React.JSX.Element {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [bounds, setBounds] = useState<LayoutBounds | null>(null);
  const [preview, setPreview] = useState<RoomHexCell[]>([]);
  const [labelPreview, setLabelPreview] = useState<{
    id: string;
    location: WorldPoint;
  } | null>(null);
  const [wallPreview, setWallPreview] = useState<LayoutWallPreview | null>(
    null
  );
  const wallModeRef = useRef({ tool, onExitWallTool });
  wallModeRef.current = { tool, onExitWallTool };
  const doorEditingRef = useRef(doorEditing);
  doorEditingRef.current = doorEditing;
  const doorModeRef = useRef({ tool, onExitDoorTool });
  doorModeRef.current = { tool, onExitDoorTool };
  const labelEditingRef = useRef(labelEditing);
  labelEditingRef.current = labelEditing;

  const abandon = useCallback((updatePreview: boolean = true): void => {
    const gesture = gestureRef.current;
    // Clear ownership before releasing: lostpointercapture must never commit.
    gestureRef.current = null;
    if (gesture) {
      try {
        if (gesture.surface.hasPointerCapture?.(gesture.pointerId)) {
          gesture.surface.releasePointerCapture(gesture.pointerId);
        }
      } catch {
        // The UA may already have retired this pointer/capture.
      }
    }
    if (updatePreview) {
      setPreview([]);
      setLabelPreview(null);
      setWallPreview(null);
      doorEditingRef.current?.cancelPreview();
    }
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = (): void => {
      const rect = surface.getBoundingClientRect();
      setBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(surface);
    window.addEventListener('resize', measure);
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (gestureRef.current?.door) doorEditingRef.current?.setActive(false);
        abandon();
        labelEditingRef.current?.onCancel();
        if (doorModeRef.current.tool === 'door')
          doorModeRef.current.onExitDoorTool?.();
        if (wallModeRef.current.tool === 'wall')
          wallModeRef.current.onExitWallTool?.();
      }
    };
    window.addEventListener('keydown', escape);
    return (): void => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', escape);
      abandon(false);
    };
  }, [abandon]);

  const hasWallEditing = !!wallEditing;
  useLayoutEffect(() => {
    abandon();
  }, [
    tool,
    draft,
    documentContext,
    intentEpoch,
    wallEditing?.assetRef,
    wallEditing?.snapEnabled,
    hasWallEditing,
    labelEditing?.active,
    abandon,
  ]);

  useLayoutEffect(() => {
    // Choosing an existing label cancels arming, not the grab that selected it.
    // Changing/canceling an armed placement still retires its live gesture.
    if (gestureRef.current?.label?.id === null) abandon();
  }, [labelEditing?.placementText, abandon]);

  useLayoutEffect(() => {
    const gesture = gestureRef.current?.door;
    const selected = doorEditing?.selectedTarget;
    if (
      gesture &&
      (!selected ||
        selected.wallId !== gesture.target.wallId ||
        selected.openingId !== gesture.target.openingId ||
        selected.doorId !== gesture.target.doorId)
    )
      abandon();
  }, [doorEditing?.selectedTarget, abandon]);
  // The grid is derived from the content, never stored (rpg-project#725 R3).
  // Content wider than the grid cap is drawn as a window around the view.
  const presentationWorkspace = useContentWorkspace(draft, frame.center);
  // A rectangle selects every cell whose centre it holds, anywhere: the
  // canvas is unbounded (R3). Past the paint cap it selects nothing and
  // carries the cap's sentence, which the release reports as a notice.
  const rectangleCells = (
    start: WorldPoint,
    end: WorldPoint
  ): { cells: RoomHexCell[]; refusal?: string } => {
    try {
      return { cells: cellsInWorldRectangle(start, end) };
    } catch (error) {
      return {
        cells: [],
        refusal: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const fitExtent = useMemo(
    () =>
      rectangleOf(presentationWorkspace) !== null
        ? workspaceBounds(presentationWorkspace)
        : presentationWorkspace.horizontalLimit,
    [presentationWorkspace]
  );
  // THE VIEW HOLDS STILL WHILE THE GRID GROWS (rpg-project#725 R3). Zoom is
  // relative to the fit of the derived grid, so a grid that grows when paint
  // nears its edge would shrink the map under the pointer. When the extent
  // changes, the zoom is rescaled by the ratio of the two fits: the on-screen
  // scale is kept, and the frame stays view state, never document state.
  const extentRef = useRef(fitExtent);
  const frameAfterGrowth = ((): LayoutFrame => {
    if (!bounds || extentRef.current === fitExtent) return frame;
    const before = createLayoutTransform(bounds, frame, extentRef.current);
    const after = createLayoutTransform(bounds, frame, fitExtent);
    if (!before || !after) return frame;
    const zoom = Math.min(
      MAX_LAYOUT_ZOOM,
      Math.max(MIN_LAYOUT_ZOOM, (frame.zoom * before.scale) / after.scale)
    );
    return zoom === frame.zoom ? frame : { ...frame, zoom };
  })();
  useLayoutEffect(() => {
    if (extentRef.current === fitExtent) return;
    extentRef.current = fitExtent;
    if (frameAfterGrowth !== frame) onFrameChange(frameAfterGrowth);
  });
  const viewFrame = frameAfterGrowth;

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const wheel = (event: WheelEvent): void => {
      // React delegates wheel through a passive listener. Use a non-passive
      // surface listener so zoom does not also scroll the enclosing page.
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const next = zoomLayoutFrame(
        viewFrame,
        { x: event.clientX, y: event.clientY },
        delta,
        createLayoutTransform(rect, viewFrame, fitExtent)
      );
      if (next) onFrameChange(next);
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    return (): void => {
      surface.removeEventListener('wheel', wheel);
    };
  }, [viewFrame, onFrameChange, fitExtent]);

  // Frame a requested region or the whole content, at this surface's size.
  const frameRequestRef = useRef({ onFrameChange, fitExtent });
  frameRequestRef.current = { onFrameChange, fitExtent };
  /** A standing request, the frame it last produced and the frame shown when
   * it did (the commit that applies it still renders that one). Any other
   * frame (pan, zoom, growth rescale) means the view was navigated, and the
   * request stops standing. */
  const standingRef = useRef<{
    target: NonNullable<typeof frameTarget>;
    applied: LayoutFrame;
    before: LayoutFrame;
  } | null>(null);
  const shownFrameRef = useRef(frame);
  shownFrameRef.current = frame;
  const sameFrame = (a: LayoutFrame, b: LayoutFrame): boolean =>
    a.zoom === b.zoom && a.center.x === b.center.x && a.center.z === b.center.z;
  const applyFrameTarget = (
    target: NonNullable<typeof frameTarget>
  ): LayoutFrame | null => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    // An overlay over one side of the surface narrows the part a frame fits.
    const inset = { left: 0, right: 0 };
    for (const o of target.occluders?.() ?? []) {
      if (Math.min(o.right, rect.right) - Math.max(o.left, rect.left) <= 0)
        continue;
      if (o.left + o.right > rect.left + rect.right)
        inset.right = Math.max(inset.right, rect.right - o.left);
      else inset.left = Math.max(inset.left, o.right - rect.left);
    }
    const next = frameOf(
      target.bounds,
      rect,
      frameRequestRef.current.fitExtent,
      undefined,
      inset
    );
    if (next) frameRequestRef.current.onFrameChange(next);
    return next ?? null;
  };
  const applyFrameTargetRef = useRef(applyFrameTarget);
  applyFrameTargetRef.current = applyFrameTarget;
  useLayoutEffect(() => {
    if (!frameTarget) return;
    const next = applyFrameTargetRef.current(frameTarget);
    standingRef.current =
      frameTarget.standing && next
        ? { target: frameTarget, applied: next, before: shownFrameRef.current }
        : null;
  }, [frameTarget]);
  useLayoutEffect(() => {
    const standing = standingRef.current;
    if (
      standing &&
      !sameFrame(frame, standing.applied) &&
      !sameFrame(frame, standing.before)
    )
      standingRef.current = null;
  }, [frame]);
  // The surface took a new size: a standing request frames again at it.
  const surfaceSize = bounds ? `${bounds.width}x${bounds.height}` : null;
  useLayoutEffect(() => {
    const standing = standingRef.current;
    if (!standing || surfaceSize === null) return;
    const before = shownFrameRef.current;
    const next = applyFrameTargetRef.current(standing.target);
    if (next) {
      standing.applied = next;
      standing.before = before;
    }
  }, [surfaceSize]);

  const transform = bounds
    ? createLayoutTransform(bounds, viewFrame, fitExtent)
    : null;
  const workspace = useMemo(
    () => layoutWorkspaceCells(presentationWorkspace),
    [presentationWorkspace]
  );
  const committed = useMemo(
    () => new Set(floorCells(draft).map(cellKey)),
    [draft]
  );
  // Benchmark harness: the grid's commit of an opened document, and the
  // frame after its commit of a stroke. Only an armed mark fires (an import
  // or a stroke arms it), so a remount or an unrelated edit marks nothing.
  const gridDrawn = transform !== null;
  useEffect(() => {
    if (!gridDrawn) return;
    markIfArmed('studio:open:first-paint');
    // Not cancelled on a re-render: the armed stroke was taken, so its
    // mark must still land.
    if (takeArmedMark('studio:stroke:painted'))
      requestAnimationFrame(() => mark('studio:stroke:painted'));
  }, [committed, gridDrawn]);
  const resolutions = regionEditing?.resolutions;
  const overview = useMemo(
    () => (resolutions ? regionOverview(draft, resolutions) : null),
    [resolutions, draft]
  );

  // Read live bounds for picking: scrolling/reflow may translate the surface
  // without a ResizeObserver notification. Rendering uses the identical scale.
  const eventTransform = (
    surface: SVGSVGElement
  ): ReturnType<typeof createLayoutTransform> =>
    createLayoutTransform(
      surface.getBoundingClientRect(),
      viewFrame,
      fitExtent
    );
  const sample = (
    event: ReactPointerEvent<SVGSVGElement>,
    gesture: Gesture
  ): void => {
    const currentTransform = eventTransform(event.currentTarget);
    const point = pointerPoint(event);
    if (!currentTransform) {
      if (gesture.wall) {
        gesture.wall.valid = false;
        gesture.wall.preview = null;
        setWallPreview(null);
        gesture.wall.editing.reportRefusal(
          'Wall gesture unavailable: canvas geometry changed.'
        );
      }
      return;
    }
    const rect = currentTransform.bounds;
    const changed =
      point.x !== gesture.client.x || point.y !== gesture.client.y;
    if (changed) gesture.moved = true;
    gesture.client = point;
    if (gesture.door) {
      if (!changed) return;
      const world = clientToWorld(point, currentTransform);
      if (!world) {
        gesture.door.valid = false;
        return;
      }
      const edit = gesture.door;
      edit.position =
        edit.origin + (doorAlongWall(edit.wall, world) - edit.anchor);
      edit.valid = edit.editing.previewMove(edit.target, edit.position);
      return;
    }
    if (gesture.wall) {
      // Selection reflow/frame roundtrips at an unchanged client pointer are
      // never authoring movement. Reuse the last applied preview on release.
      if (!changed) return;
      const edit = gesture.wall;
      const world = clientToWorld(point, currentTransform);
      if (!world) {
        edit.valid = false;
        edit.preview = null;
        setWallPreview(null);
        edit.editing.reportRefusal(
          'Wall gesture requires a finite pointer location.'
        );
        return;
      }
      try {
        let candidate: LayoutWallPreview;
        const enabled = edit.editing.snapEnabled;
        if (!edit.source) {
          const target = snapEndpoint(
            world,
            edit.editing,
            draft.room.walls ?? [],
            currentTransform.scale,
            undefined,
            edit.constraint
          );
          const desired = edit.constraint
            ? constrainWallPoint({ ...edit.constraint, point: world }).point
            : world;
          const corner = edit.editing.endpointSnapEnabled
            ? snapPerpendicularCorner({
                line: { start: edit.start, end: desired },
                endpoint: 'end',
                point: desired,
                walls: draft.room.walls ?? [],
                radius: 12 / currentTransform.scale,
              })
            : undefined;
          candidate = {
            corner,
            line: {
              start: edit.start,
              end: corner?.join.point ?? target.point,
            },
            point: corner?.join.point ?? target.point,
            feedback: corner
              ? 'Joined corner · both ends'
              : (target.feedback ??
                (target.joined
                  ? 'Joined endpoint'
                  : target.snapped
                    ? 'Snapped'
                    : 'Free point')),
          };
        } else if (edit.endpoint) {
          const requested =
            !enabled &&
            world.x === gesture.anchor.x &&
            world.z === gesture.anchor.z
              ? edit.source.line[edit.endpoint]
              : world;
          const target = snapEndpoint(
            requested,
            edit.editing,
            draft.room.walls ?? [],
            currentTransform.scale,
            edit.source.id,
            edit.constraint
          );
          const desired = edit.constraint
            ? constrainWallPoint({ ...edit.constraint, point: requested }).point
            : requested;
          const line = edit.constraint
            ? { ...edit.source.line, [edit.endpoint]: desired }
            : edit.source.line;
          const corner = edit.editing.endpointSnapEnabled
            ? snapPerpendicularCorner({
                line,
                endpoint: edit.endpoint,
                point: desired,
                walls: draft.room.walls ?? [],
                excludedWallId: edit.source.id,
                radius: 12 / currentTransform.scale,
              })
            : undefined;
          const result = reshapeWallEndpoint({
            wall: edit.source,
            endpoint: edit.endpoint,
            point: corner?.join.point ?? target.point,
          });
          candidate = {
            corner: result.clamped ? undefined : corner,
            wall: result.wall,
            line: result.wall.line,
            point: result.wall.line[edit.endpoint],
            feedback: result.clamped
              ? 'Clamped to preserve openings'
              : corner
                ? 'Joined corner · both ends'
                : (target.feedback ??
                  (target.joined
                    ? 'Joined endpoint'
                    : target.snapped
                      ? 'Snapped'
                      : 'Free point')),
          };
        } else {
          const target = snapWallPoint({
            point: {
              x: edit.source.line.start.x + (world.x - gesture.anchor.x),
              z: edit.source.line.start.z + (world.z - gesture.anchor.z),
            },
            enabled,
          });
          const delta = {
            x: target.point.x - edit.source.line.start.x,
            z: target.point.z - edit.source.line.start.z,
          };
          // A zero translation is not a transform: even identity pivot math
          // can round fractional endpoints and would invent an authoring edit.
          const wall =
            delta.x === 0 && delta.z === 0
              ? edit.source
              : translateWall(edit.source, delta);
          candidate = {
            wall,
            line: wall.line,
            point: wall.line.start,
            feedback: target.snapped ? 'Snapped' : 'Free point',
          };
        }
        edit.valid = true;
        edit.preview = candidate;
        setWallPreview(candidate);
      } catch (error) {
        edit.valid = false;
        edit.preview = null;
        setWallPreview(null);
        edit.editing.reportRefusal(
          error instanceof Error ? error.message : 'Wall edit refused.'
        );
      }
      return;
    }
    if (gesture.label) {
      if (gesture.label.id && !changed) return;
      const world = clientToWorld(point, currentTransform);
      const location =
        world &&
        (gesture.label.id
          ? {
              x: gesture.label.origin.x + (world.x - gesture.anchor.x),
              z: gesture.label.origin.z + (world.z - gesture.anchor.z),
            }
          : world);
      gesture.label.valid =
        !!location &&
        point.x >= rect.left &&
        point.y >= rect.top &&
        point.x <= rect.left + rect.width &&
        point.y <= rect.top + rect.height &&
        withinWorld(location);
      if (location && gesture.label.valid) {
        gesture.label.location = location;
        if (gesture.label.id)
          setLabelPreview({ id: gesture.label.id, location });
      }
      return;
    }
    if (
      point.x < rect.left ||
      point.y < rect.top ||
      point.x > rect.left + rect.width ||
      point.y > rect.top + rect.height
    )
      return;
    if (gesture.tool === 'rectangle') {
      const world = clientToWorld(point, currentTransform);
      if (!world) return;
      const { cells, refusal } = rectangleCells(gesture.anchor, world);
      gesture.cells = new Map(cells.map((cell) => [cellKey(cell), cell]));
      gesture.refusal = refusal;
    } else {
      const cell = pickLayoutCell(point, currentTransform);
      if (cell) gesture.cells.set(cellKey(cell), cell);
    }
    setPreview([...gesture.cells.values()]);
  };
  /** Pick on map (rpg-project#720): in the CAPTURE phase, so a creature,
   * a label or a wall drawn on the cell never takes the click — the cell is
   * the answer, whatever stands on it. */
  const routePickDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!routePick || event.button !== 0 || event.isPrimary === false) return;
    event.stopPropagation();
    event.preventDefault();
    const world = clientToWorld(
      pointerPoint(event),
      eventTransform(event.currentTarget)
    );
    // Unbounded like paint (rpg-project#725 R3): any cell is a pick.
    const cell = world ? cellAtWorldPoint(world) : null;
    if (cell) routePick.onPick(cell);
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const active = gestureRef.current;
    if (active && active.pointerId !== event.pointerId) return;
    if (event.button === 2) {
      abandon();
      labelEditing?.onCancel();
      if (tool === 'wall') onExitWallTool?.();
      if (tool === 'door') onExitDoorTool?.();
      return;
    }
    if (
      active ||
      (event.button !== 0 && event.button !== 1) ||
      event.isPrimary === false
    )
      return;
    const startingTransform = eventTransform(event.currentTarget);
    const anchor = clientToWorld(pointerPoint(event), startingTransform);
    if (!anchor || !startingTransform) return;
    const target = event.target instanceof Element ? event.target : null;
    const wallId = target
      ?.closest('[data-wall-id]')
      ?.getAttribute('data-wall-id');
    const doorHit = target?.closest('[data-door-id]');
    if (event.button === 0 && tool === 'door' && doorEditing) {
      event.preventDefault();
      event.currentTarget.focus();
      if (wallId && doorEditing.create(wallId, anchor)) onExitDoorTool?.();
      return;
    }
    if (
      event.button === 0 &&
      tool === 'select' &&
      doorEditing &&
      wallId &&
      doorHit
    ) {
      const wall = draft.room.walls?.find((wall) => wall.id === wallId);
      const opening = wall?.openings.find(
        (opening) =>
          opening.id === doorHit.getAttribute('data-opening-id') &&
          opening.door?.id === doorHit.getAttribute('data-door-id')
      );
      if (!wall || !opening?.door) return;
      const intended: StudioDoorTarget = {
        kind: 'door',
        wallId,
        openingId: opening.id,
        doorId: opening.door.id,
      };
      if (!doorEditing.select(intended)) return;
      event.preventDefault();
      event.currentTarget.focus();
      gestureRef.current = {
        pointerId: event.pointerId,
        surface: event.currentTarget,
        tool: 'door',
        client: pointerPoint(event),
        moved: false,
        commitFloor: onCommit,
        anchor,
        cells: new Map(),
        door: {
          target: intended,
          wall,
          origin: opening.position,
          anchor: doorAlongWall(wall, anchor),
          position: opening.position,
          valid: true,
          editing: doorEditing,
        },
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        abandon();
      }
      return;
    }
    const endpoint = target
      ?.closest('[data-wall-endpoint]')
      ?.getAttribute('data-wall-endpoint');
    const endpointHit =
      tool === 'select' &&
      wallId === wallEditing?.selectedId &&
      (endpoint === 'start' || endpoint === 'end')
        ? endpoint
        : undefined;
    const labelId =
      tool !== 'wall' && !endpointHit
        ? target?.closest('[data-label-id]')?.getAttribute('data-label-id')
        : null;
    const label =
      labelEditing && labelId
        ? draft.scene.mapLabels?.find((candidate) => candidate.id === labelId)
        : undefined;
    const labelMode =
      tool === 'label' ||
      (tool !== 'select' && tool !== 'wall' && labelEditing?.active);
    const placing =
      event.button === 0 && labelMode && !label && labelEditing?.placementText;
    const source =
      tool === 'select' && wallEditing && !label && wallId
        ? draft.room.walls?.find((wall) => wall.id === wallId)
        : undefined;
    if (event.button === 0) {
      if (tool === 'wall' && (!wallEditing || !wallEditing.assetRef)) {
        wallEditing?.reportRefusal('Choose a wall appearance before drawing.');
        return;
      }
      if (tool === 'select' && !label && !source) {
        wallEditing?.select(null);
        labelEditing?.onSelect(null);
        doorEditing?.select(null);
        // A click selects the hex under it anywhere on the unbounded canvas.
        const cell = cellAtWorldPoint(anchor);
        if (cell) onSelectHex?.(cell);
        else onClearSelection?.();
        return;
      }
      if (labelMode && !label && !placing) return;
      if (placing && !withinWorld(anchor)) return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    const gesture: Gesture = {
      pointerId: event.pointerId,
      surface: event.currentTarget,
      tool:
        event.button === 1
          ? 'pan'
          : tool === 'wall' || source
            ? 'wall'
            : label || placing
              ? 'label'
              : (tool as LayoutFloorTool),
      anchor,
      client: pointerPoint(event),
      moved: false,
      commitFloor: onCommit,
      cells: new Map(),
    };
    if (event.button === 0 && wallEditing && (tool === 'wall' || source)) {
      const editing = wallEditing;
      if (source) {
        if (!editing.select(source.id)) return;
        labelEditing?.onSelect(null);
      }
      const target = snapEndpoint(
        anchor,
        editing,
        draft.room.walls ?? [],
        startingTransform.scale,
        source?.id
      );
      const start = target.point;
      let constraint: WallConstraint | undefined;
      if (editing.rightAngleEnabled && (!source || endpointHit)) {
        const fixed =
          source && endpointHit
            ? source.line[endpointHit === 'start' ? 'end' : 'start']
            : start;
        try {
          const reference = wallAngleReference({
            anchor: fixed,
            walls: draft.room.walls ?? [],
            excludedWallId: source?.id,
          });
          // Validate ambiguity before capturing the gesture, not after commit.
          constrainWallPoint({ anchor: fixed, point: fixed, reference });
          constraint = { anchor: { ...fixed }, reference };
        } catch (error) {
          editing.reportRefusal(
            error instanceof Error ? error.message : String(error)
          );
          return;
        }
      }
      gesture.wall = {
        source,
        endpoint: endpointHit,
        start,
        preview: null,
        valid: true,
        editing,
        constraint,
      };
      if (!source) {
        gesture.wall.preview = {
          line: { start, end: start },
          point: start,
          feedback: target.joined
            ? 'Joined endpoint'
            : target.snapped
              ? 'Snapped'
              : 'Free point',
        };
        setWallPreview(gesture.wall.preview);
      }
    }
    if (event.button === 0 && labelEditing && (label || placing)) {
      const editing = labelEditing;
      if (label) {
        editing.onSelect(label.id);
        wallEditing?.select(null);
      }
      gesture.label = {
        id: label?.id ?? null,
        origin: label?.location ?? anchor,
        location: label?.location ?? anchor,
        valid: true,
        commit: label
          ? (location) => editing.onMove(label.id, location)
          : (location) => editing.onCreate(placing as string, location),
      };
    }
    gestureRef.current = gesture;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      abandon();
      return;
    }
    if (gesture.tool !== 'pan') sample(event, gesture);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const gesture = gestureRef.current;
    if (!gesture && tool === 'door' && doorEditing) {
      const wallId =
        event.target instanceof Element
          ? event.target.closest('[data-wall-id]')?.getAttribute('data-wall-id')
          : null;
      const world = clientToWorld(
        pointerPoint(event),
        eventTransform(event.currentTarget)
      );
      if (wallId && world) doorEditing.previewPlacement(wallId, world);
      else doorEditing.cancelPreview();
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.tool === 'pan') {
      const next = panLayoutFrame(
        viewFrame,
        gesture.anchor,
        pointerPoint(event),
        eventTransform(event.currentTarget)
      );
      if (next) onFrameChange(next);
    } else sample(event, gesture);
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.button !== (gesture.tool === 'pan' ? 1 : 0)) return;
    if (gesture.tool !== 'pan') sample(event, gesture);
    const cells = [...gesture.cells.values()];
    abandon();
    if (gesture.door) {
      if (gesture.moved && gesture.door.valid)
        gesture.door.editing.move(gesture.door.target, gesture.door.position);
    } else if (gesture.wall) {
      const { source, preview, valid, editing } = gesture.wall;
      if (!gesture.moved || !valid || !preview) return;
      if (source && preview.wall) {
        if (
          preview.corner ||
          JSON.stringify(source) !== JSON.stringify(preview.wall)
        ) {
          if (preview.corner) editing.edit(preview.wall, preview.corner.join);
          else editing.edit(preview.wall);
        }
      } else if (
        preview.line.start.x !== preview.line.end.x ||
        preview.line.start.z !== preview.line.end.z
      ) {
        if (preview.corner) editing.create(preview.line, preview.corner.join);
        else editing.create(preview.line);
      }
    } else if (gesture.label) {
      const { id, location, origin, valid } = gesture.label;
      if (
        valid &&
        (!id || location.x !== origin.x || location.z !== origin.z)
      ) {
        gesture.label.commit(location);
      }
    } else if (gesture.refusal !== undefined) {
      onRefuse?.(gesture.refusal);
    } else if (gesture.tool !== 'pan' && cells.length > 0) {
      gesture.commitFloor(cells, gesture.tool === 'erase' ? 'erase' : 'paint');
    }
  };
  const cancelPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (gestureRef.current?.pointerId === event.pointerId) {
      if (gestureRef.current.door) doorEditing?.setActive(false);
      abandon();
    }
  };
  const worldTransform =
    transform && bounds
      ? `translate(${bounds.width / 2 - transform.center.x * transform.scale} ${bounds.height / 2 - transform.center.z * transform.scale}) scale(${transform.scale})`
      : undefined;

  return (
    <svg
      ref={surfaceRef}
      className="encounter-studio-layout"
      role="application"
      aria-label="Layout floor surface"
      // The live view frame, as presentation state (never document state):
      // zoom is relative to the derived grid's fit and rescales as the grid
      // grows, so a reader mapping points needs the frame actually drawn.
      data-frame-zoom={viewFrame.zoom}
      data-frame-x={viewFrame.center.x}
      data-frame-z={viewFrame.center.z}
      tabIndex={0}
      width="100%"
      height="100%"
      style={{
        display: 'block',
        minHeight: 240,
        touchAction: 'none',
        background: '#101923',
      }}
      viewBox={
        transform && bounds ? `0 0 ${bounds.width} ${bounds.height}` : undefined
      }
      onPointerDownCapture={routePick ? routePickDown : undefined}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerLeave={() => {
        if (!gestureRef.current) doorEditing?.cancelPreview();
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onContextMenu={(event): void => {
        event.preventDefault();
        if (gestureRef.current?.door) doorEditing?.setActive(false);
        abandon();
        labelEditing?.onCancel();
        if (tool === 'wall') onExitWallTool?.();
        if (tool === 'door') onExitDoorTool?.();
      }}
      onKeyDown={(event): void => {
        if (event.target !== event.currentTarget) return;
        if (
          (event.key === 'Delete' || event.key === 'Backspace') &&
          tool === 'select' &&
          wallEditing?.selectedId
        ) {
          event.preventDefault();
          abandon();
          wallEditing.remove(wallEditing.selectedId);
        }
        if (
          event.key === 'Enter' &&
          tool !== 'wall' &&
          tool !== 'select' &&
          labelEditing?.placementText
        ) {
          event.preventDefault();
          if (withinWorld(frame.center)) {
            labelEditing.onCreate(labelEditing.placementText, frame.center);
          }
        }
      }}
    >
      <title>Layout floor surface</title>
      <desc>
        {routePick
          ? routePick.mode === 'cell'
            ? 'Click the cell to walk to. Escape cancels.'
            : 'Click cells in walking order; the route loops back to its first waypoint. Escape cancels.'
          : tool === 'wall'
            ? 'Drag to draw walls. Choose an appearance first. Escape or right-click exits Wall.'
            : tool === 'select'
              ? 'Select walls or labels. Drag walls or selected endpoints; Delete removes the selected wall.'
              : tool === 'label' || labelEditing?.active
                ? 'Select and drag map labels. When placement is armed, click on the map or press Enter to place at the view center.'
                : `Drag to ${tool === 'rectangle' ? 'paint a rectangle' : tool} floor.`}
        Middle drag to pan, wheel to zoom. Escape cancels.
      </desc>
      {transform && (
        <g
          className="encounter-studio-layout-committed"
          pointerEvents="none"
          transform={worldTransform}
        >
          <LayoutGrid cells={workspace} committed={committed} />
        </g>
      )}
      {transform && patternStart && (
        <g
          transform={worldTransform}
          pointerEvents="none"
          aria-label="Pattern start marker"
        >
          <circle
            cx={patternStart.x}
            cy={patternStart.z}
            r={0.18}
            fill="#a7ffeb"
            stroke="#182a33"
            strokeWidth={0.04}
          />
          <text
            x={patternStart.x + 0.25}
            y={patternStart.z - 0.25}
            fontSize={0.35}
            fill="#a7ffeb"
          >
            Pattern start
          </text>
        </g>
      )}
      {transform && regionEditing && (
        <RegionBoundaryOverlay
          resolutions={regionEditing.resolutions}
          colours={overview?.colours}
          selectedId={selectedRegion?.id}
          transform={worldTransform}
        />
      )}
      {transform && (
        <g
          className="encounter-studio-layout-preview"
          transform={worldTransform}
          aria-hidden="true"
          pointerEvents="none"
        >
          {preview.map((cell) => (
            <polygon
              key={cellKey(cell)}
              data-preview-cell={cellKey(cell)}
              points={polygonPoints(cell)}
              fill={tool === 'erase' ? '#d47867' : '#67d8c2'}
              fillOpacity={0.6}
              stroke={tool === 'erase' ? '#ffb29f' : '#a7ffeb'}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="5 3"
            />
          ))}
        </g>
      )}
      {transform && (
        <LayoutWallOverlay
          walls={(draft.room.walls ?? []).map((wall) =>
            doorEditing?.preview?.valid &&
            doorEditing.preview.wall.id === wall.id
              ? doorEditing.preview.wall
              : wall
          )}
          doorBindings={
            doorEditing?.preview?.valid &&
            doorEditing.preview.purpose === 'placement'
              ? {
                  ...draft.room.doorBindings,
                  [doorEditing.preview.target.doorId]: { closed: true },
                }
              : draft.room.doorBindings
          }
          selectedDoor={doorEditing?.selectedTarget}
          transform={transform}
          selectedId={wallEditing?.selectedId ?? null}
          interactive={(tool === 'select' || tool === 'door') && !!wallEditing}
          preview={wallPreview}
          layer="body"
        />
      )}
      {transform && labelEditing && (
        <MapLabelOverlay
          labels={draft.scene.mapLabels ?? []}
          transform={transform}
          selectedId={labelEditing.selectedId}
          preview={labelPreview}
          regions={draft.room.regions}
          selectedRegionId={selectedRegion?.id ?? null}
          onSelectRegion={onSelectRegion}
          colours={overview?.colours}
          onSelect={(id): void => {
            labelEditing.onSelect(id);
            wallEditing?.select(null);
          }}
        />
      )}
      {/* Placed nouns draw over the map labels: a room's label covers its
          centre, where a creature often stands, and must not take its click. */}
      {transform && placedEditing && (
        <LayoutPlacedOverlay
          monsters={draft.room.monsterDeclarations}
          items={draft.scene.items}
          declarations={draft.room.propDeclarations}
          partyStart={draft.room.partyStart}
          exits={exits}
          concealedCells={concealedCells}
          editing={placedEditing}
          interactive={tool === 'select'}
          worldTransform={worldTransform}
          transform={transform}
        />
      )}
      {transform && (
        <LayoutWallOverlay
          walls={(draft.room.walls ?? []).map((wall) =>
            doorEditing?.preview?.valid &&
            doorEditing.preview.wall.id === wall.id
              ? doorEditing.preview.wall
              : wall
          )}
          doorBindings={
            doorEditing?.preview?.valid &&
            doorEditing.preview.purpose === 'placement'
              ? {
                  ...draft.room.doorBindings,
                  [doorEditing.preview.target.doorId]: { closed: true },
                }
              : draft.room.doorBindings
          }
          selectedDoor={doorEditing?.selectedTarget}
          transform={transform}
          selectedId={wallEditing?.selectedId ?? null}
          interactive={tool === 'select' && !!wallEditing}
          preview={wallPreview}
          layer="handles"
        />
      )}
      {transform && routePick && (
        <LayoutRouteOverlay
          waypoints={routePick.waypoints}
          loop={routePick.mode === 'route'}
          transform={worldTransform}
        />
      )}
    </svg>
  );
}
