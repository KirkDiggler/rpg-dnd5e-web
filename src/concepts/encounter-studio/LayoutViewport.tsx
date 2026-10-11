import {
  memo,
  useCallback,
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
  layoutCellCorners,
  layoutWorkspaceCells,
  panLayoutFrame,
  pickLayoutCell,
  zoomLayoutFrame,
  type ClientPoint,
  type LayoutBounds,
} from './layoutGeometry';
import type {
  LayoutFloorTool,
  LayoutViewportProps,
  RoomHexCell,
  StructuralWall,
  StudioDoorEditing,
  StudioDoorTarget,
  StudioWallEditing,
  WorldPoint,
} from './studioSession';

import {
  reshapeWallEndpoint,
  snapWallEndpoint,
  snapWallPoint,
  translateWall,
} from '../world-building/structuralWallEditing';
import { usePresentationWorkspace } from '../world-building/usePresentationWorkspace';
import {
  constrainWallPoint,
  pointOnWallAxis,
  wallAngleReference,
  type WallAngleReference,
} from '../world-building/wallAngleConstraint';
import {
  containsWorkspacePoint,
  workspaceBounds,
} from '../world-building/workspaceGeometry';
import { createWorkspaceRectangleSelection } from '../world-building/workspaceRectangleSelection';
import { LayoutWallOverlay, type LayoutWallPreview } from './LayoutWallOverlay';
import { MapLabelOverlay } from './MapLabelOverlay';
import { RegionBoundaryOverlay } from './RegionBoundaryOverlay';

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
  region?: {
    id: string;
    initial: readonly RoomHexCell[];
    mode: LayoutFloorTool;
    commit: NonNullable<
      LayoutViewportProps['regionEditing']
    >['setExplicitRegionArea'];
  };
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
  labelEditing,
  documentContext,
  wallEditing,
  doorEditing,
  regionEditing,
  selectedRegion,
  regionTool = 'paint',
  onExitRegionTool,
  onExitDoorTool,
  intentEpoch,
  onExitWallTool,
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
  const regionModeRef = useRef({ tool, onExitRegionTool });
  regionModeRef.current = { tool, onExitRegionTool };
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
        if (regionModeRef.current.tool === 'region')
          regionModeRef.current.onExitRegionTool?.();
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
    regionTool,
    labelEditing?.active,
    abandon,
  ]);

  useLayoutEffect(() => {
    // Linked projection changes caused by selecting a label must not cancel
    // that initiating label drag. Only a region gesture owns this target fence.
    const region = gestureRef.current?.region;
    if (region && region.id !== selectedRegion?.id) abandon();
  }, [selectedRegion?.id, abandon]);

  useLayoutEffect(() => {
    // Choosing an existing label cancels arming, not the grab that selected it.
    // Changing/canceling an armed placement still retires its live gesture.
    if (gestureRef.current?.label?.id === null) abandon();
  }, [labelEditing?.placementText, labelEditing?.placementKind, abandon]);

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
  const presentationWorkspace = usePresentationWorkspace(draft.workspace)!;
  const rectangleCells = useMemo(
    () => createWorkspaceRectangleSelection(presentationWorkspace),
    [presentationWorkspace]
  );
  const fitExtent = useMemo(
    () =>
      presentationWorkspace.kind === 'centered-odd-r'
        ? workspaceBounds(presentationWorkspace)
        : presentationWorkspace.horizontalLimit,
    [presentationWorkspace]
  );

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
        frame,
        { x: event.clientX, y: event.clientY },
        delta,
        createLayoutTransform(rect, frame, fitExtent)
      );
      if (next) onFrameChange(next);
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    return (): void => {
      surface.removeEventListener('wheel', wheel);
    };
  }, [frame, onFrameChange, fitExtent]);

  const transform = bounds
    ? createLayoutTransform(bounds, frame, fitExtent)
    : null;
  const workspace = useMemo(
    () => layoutWorkspaceCells(presentationWorkspace),
    [presentationWorkspace]
  );
  const committed = useMemo(
    () => new Set(draft.room.walkableHexes.map(cellKey)),
    [draft.room.walkableHexes]
  );

  // Read live bounds for picking: scrolling/reflow may translate the surface
  // without a ResizeObserver notification. Rendering uses the identical scale.
  const eventTransform = (
    surface: SVGSVGElement
  ): ReturnType<typeof createLayoutTransform> =>
    createLayoutTransform(surface.getBoundingClientRect(), frame, fitExtent);
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
          candidate = {
            line: { start: edit.start, end: target.point },
            point: target.point,
            feedback:
              target.feedback ??
              (target.joined
                ? 'Joined endpoint'
                : target.snapped
                  ? 'Snapped'
                  : 'Free point'),
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
          const result = reshapeWallEndpoint({
            wall: edit.source,
            endpoint: edit.endpoint,
            point: target.point,
          });
          candidate = {
            wall: result.wall,
            line: result.wall.line,
            point: result.wall.line[edit.endpoint],
            feedback: result.clamped
              ? 'Clamped to preserve openings'
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
        containsWorkspacePoint(presentationWorkspace, location);
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
      const cells = rectangleCells(gesture.anchor, world);
      gesture.cells = new Map(cells.map((cell) => [cellKey(cell), cell]));
    } else {
      const cell = pickLayoutCell(point, currentTransform, draft.workspace);
      if (cell) gesture.cells.set(cellKey(cell), cell);
    }
    setPreview([...gesture.cells.values()]);
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const active = gestureRef.current;
    if (active && active.pointerId !== event.pointerId) return;
    if (event.button === 2) {
      abandon();
      labelEditing?.onCancel();
      if (tool === 'wall') onExitWallTool?.();
      if (tool === 'door') onExitDoorTool?.();
      if (tool === 'region') onExitRegionTool?.();
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
      tool !== 'wall' && tool !== 'region' && !endpointHit
        ? target?.closest('[data-label-id]')?.getAttribute('data-label-id')
        : null;
    const label =
      labelEditing && labelId
        ? draft.scene.mapLabels?.find((candidate) => candidate.id === labelId)
        : undefined;
    const labelMode =
      tool === 'label' ||
      (tool !== 'select' &&
        tool !== 'wall' &&
        tool !== 'region' &&
        labelEditing?.active);
    const placing =
      event.button === 0 && labelMode && !label && labelEditing?.placementText;
    const source =
      tool === 'select' && wallEditing && !label && wallId
        ? draft.room.walls?.find((wall) => wall.id === wallId)
        : undefined;
    if (event.button === 0) {
      if (tool === 'region' && (!regionEditing || !selectedRegion)) return;
      if (tool === 'wall' && (!wallEditing || !wallEditing.assetRef)) {
        wallEditing?.reportRefusal('Choose a wall appearance before drawing.');
        return;
      }
      if (tool === 'select' && !label && !source) {
        wallEditing?.select(null);
        labelEditing?.onSelect(null);
        doorEditing?.select(null);
        return;
      }
      if (labelMode && !label && !placing) return;
      if (placing && !containsWorkspacePoint(presentationWorkspace, anchor))
        return;
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
              : tool === 'region'
                ? regionTool
                : (tool as LayoutFloorTool),
      anchor,
      client: pointerPoint(event),
      moved: false,
      commitFloor: onCommit,
      cells: new Map(),
    };
    if (
      event.button === 0 &&
      tool === 'region' &&
      regionEditing &&
      selectedRegion
    ) {
      gesture.region = {
        id: selectedRegion.id,
        initial:
          selectedRegion.boundary.kind === 'explicit'
            ? selectedRegion.boundary.cells
            : [],
        mode: regionTool,
        commit: regionEditing.setExplicitRegionArea,
      };
    }
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
        frame,
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
        if (JSON.stringify(source) !== JSON.stringify(preview.wall))
          editing.edit(preview.wall);
      } else if (
        preview.line.start.x !== preview.line.end.x ||
        preview.line.start.z !== preview.line.end.z
      ) {
        editing.create(preview.line);
      }
    } else if (gesture.label) {
      const { id, location, origin, valid } = gesture.label;
      if (
        valid &&
        (!id || location.x !== origin.x || location.z !== origin.z)
      ) {
        gesture.label.commit(location);
      }
    } else if (gesture.region && cells.length > 0) {
      const edit = gesture.region;
      const next = new Map(edit.initial.map((cell) => [cellKey(cell), cell]));
      for (const cell of cells) {
        if (edit.mode === 'erase') next.delete(cellKey(cell));
        else next.set(cellKey(cell), cell);
      }
      edit.commit(edit.id, [...next.values()]);
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
        if (tool === 'region') onExitRegionTool?.();
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
          tool !== 'region' &&
          labelEditing?.placementText
        ) {
          event.preventDefault();
          if (containsWorkspacePoint(presentationWorkspace, frame.center)) {
            labelEditing.onCreate(labelEditing.placementText, frame.center);
          }
        }
      }}
    >
      <title>Layout floor surface</title>
      <desc>
        {tool === 'region'
          ? `Drag to ${regionTool} region membership only; floor is unchanged.`
          : tool === 'wall'
            ? 'Drag to draw walls. Choose an appearance first. Escape or right-click exits Wall.'
            : tool === 'select'
              ? 'Select walls or labels. Drag walls or selected endpoints; Delete removes the selected wall.'
              : tool === 'label' || labelEditing?.active
                ? 'Select and drag map labels. When placement is armed, click inside the workspace or press Enter to place at the view center.'
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
      {transform && regionEditing && (
        <RegionBoundaryOverlay
          resolutions={regionEditing.resolutions}
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
              fill={
                (tool === 'region' ? regionTool : tool) === 'erase'
                  ? '#d47867'
                  : '#67d8c2'
              }
              fillOpacity={0.6}
              stroke={
                (tool === 'region' ? regionTool : tool) === 'erase'
                  ? '#ffb29f'
                  : '#a7ffeb'
              }
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
          regions={draft.scene.authoringRegions}
          resolutions={regionEditing?.resolutions}
          onSelect={(id): void => {
            labelEditing.onSelect(id);
            wallEditing?.select(null);
          }}
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
    </svg>
  );
}
