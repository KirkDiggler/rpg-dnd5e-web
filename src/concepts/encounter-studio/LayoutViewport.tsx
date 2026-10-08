import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clientToWorld,
  createLayoutTransform,
  layoutCellCorners,
  layoutRectangleCells,
  layoutWorkspaceCells,
  panLayoutFrame,
  pickLayoutCell,
  worldToClient,
  zoomLayoutFrame,
  type ClientPoint,
  type LayoutBounds,
} from './layoutGeometry';
import type {
  LayoutFloorTool,
  LayoutViewportProps,
  RoomHexCell,
  WorldPoint,
} from './studioSession';

type Gesture = {
  pointerId: number;
  surface: SVGSVGElement;
  tool: LayoutFloorTool | 'pan';
  anchor: WorldPoint;
  cells: Map<string, RoomHexCell>;
};
const cellKey = (cell: RoomHexCell): string => `${cell.q},${cell.r}`;
const pointerPoint = (
  event: ReactPointerEvent<SVGSVGElement>
): ClientPoint => ({
  x: event.clientX,
  y: event.clientY,
});

/** Controlled schematic only: the owner decides whether a completed floor
 * gesture is accepted. Preview and pointer capture are the only edit state here. */
export function LayoutViewport({
  draft,
  tool,
  frame,
  onFrameChange,
  onCommit,
}: LayoutViewportProps): React.JSX.Element {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [bounds, setBounds] = useState<LayoutBounds | null>(null);
  const [preview, setPreview] = useState<RoomHexCell[]>([]);

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
    if (updatePreview) setPreview([]);
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
      if (event.key === 'Escape') abandon();
    };
    window.addEventListener('keydown', escape);
    return (): void => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', escape);
      abandon(false);
    };
  }, [abandon]);

  useLayoutEffect(() => {
    abandon();
  }, [tool, abandon]);

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
        createLayoutTransform(rect, frame, draft.workspace.horizontalLimit)
      );
      if (next) onFrameChange(next);
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    return (): void => {
      surface.removeEventListener('wheel', wheel);
    };
  }, [frame, onFrameChange, draft.workspace.horizontalLimit]);

  const transform = bounds
    ? createLayoutTransform(bounds, frame, draft.workspace.horizontalLimit)
    : null;
  const workspace = useMemo(
    () => layoutWorkspaceCells(draft.workspace.hexRadius),
    [draft.workspace.hexRadius]
  );
  const committed = new Set(draft.room.walkableHexes.map(cellKey));

  // Read live bounds for picking: scrolling/reflow may translate the surface
  // without a ResizeObserver notification. Rendering uses the identical scale.
  const eventTransform = (
    surface: SVGSVGElement
  ): ReturnType<typeof createLayoutTransform> =>
    createLayoutTransform(
      surface.getBoundingClientRect(),
      frame,
      draft.workspace.horizontalLimit
    );
  const sample = (
    event: ReactPointerEvent<SVGSVGElement>,
    gesture: Gesture
  ): void => {
    const currentTransform = eventTransform(event.currentTarget);
    const point = pointerPoint(event);
    if (!currentTransform) return;
    const rect = currentTransform.bounds;
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
      const cells = layoutRectangleCells(
        gesture.anchor,
        world,
        draft.workspace.hexRadius
      );
      gesture.cells = new Map(cells.map((cell) => [cellKey(cell), cell]));
    } else {
      const cell = pickLayoutCell(
        point,
        currentTransform,
        draft.workspace.hexRadius
      );
      if (cell) gesture.cells.set(cellKey(cell), cell);
    }
    setPreview([...gesture.cells.values()]);
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const active = gestureRef.current;
    if (active && active.pointerId !== event.pointerId) return;
    if (event.button === 2) {
      abandon();
      return;
    }
    if (
      active ||
      (event.button !== 0 && event.button !== 1) ||
      event.isPrimary === false
    )
      return;
    const anchor = clientToWorld(
      pointerPoint(event),
      eventTransform(event.currentTarget)
    );
    if (!anchor) return;
    event.preventDefault();
    event.currentTarget.focus();
    const gesture: Gesture = {
      pointerId: event.pointerId,
      surface: event.currentTarget,
      tool: event.button === 1 ? 'pan' : tool,
      anchor,
      cells: new Map(),
    };
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
    if (gesture.tool !== 'pan' && cells.length > 0) {
      onCommit(cells, gesture.tool === 'erase' ? 'erase' : 'paint');
    }
  };
  const cancelPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (gestureRef.current?.pointerId === event.pointerId) abandon();
  };
  const polygonPoints = (cell: RoomHexCell): string =>
    layoutCellCorners(cell)
      .map((corner) => {
        const point = worldToClient(corner, transform);
        return point && bounds
          ? `${point.x - bounds.left},${point.y - bounds.top}`
          : '';
      })
      .join(' ');

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
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onContextMenu={(event): void => {
        event.preventDefault();
        abandon();
      }}
    >
      <title>Layout floor surface</title>
      <desc>
        Drag to {tool === 'rectangle' ? 'paint a rectangle' : tool} floor.
        Middle drag to pan, wheel to zoom. Escape cancels.
      </desc>
      {transform && (
        <g className="encounter-studio-layout-committed" pointerEvents="none">
          {workspace.map((cell) => (
            <polygon
              key={cellKey(cell)}
              data-cell={cellKey(cell)}
              data-walkable={committed.has(cellKey(cell))}
              points={polygonPoints(cell)}
              fill={committed.has(cellKey(cell)) ? '#44687a' : '#182633'}
              stroke="#2d414e"
              strokeWidth={1}
            />
          ))}
        </g>
      )}
      {transform && (
        <g
          className="encounter-studio-layout-preview"
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
              strokeDasharray="5 3"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
