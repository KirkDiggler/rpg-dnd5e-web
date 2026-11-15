/**
 * THE INSPECTOR'S INNER EDGE (rpg-project#979): drag it, or focus it and use
 * the arrows, to give the inspector room; the map takes the rest. A drag
 * previews through the `--es-inspector-width` variable alone and commits on
 * release, so the workspace does not re-render on every pointer move.
 */
import { useRef } from 'react';
import {
  clampInspectorWidth,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_WIDTH_STEP,
} from './inspectorWidth';

export function StudioInspectorResize({
  width,
  max,
  onCommit,
}: {
  width: number;
  max: number;
  onCommit(width: number): void;
}): React.JSX.Element {
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null
  );
  const clamp = (next: number): number => clampInspectorWidth(next, max);
  /** The handle is on the inspector's LEFT edge: moving it left widens. */
  const widthAt = (clientX: number): number =>
    drag.current ? clamp(drag.current.width + drag.current.x - clientX) : width;
  const preview = (element: Element, next: number): void => {
    (
      element.closest('.encounter-studio') as HTMLElement | null
    )?.style.setProperty('--es-inspector-width', `${next}px`);
  };
  return (
    <div
      className="es-inspector-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-controls="studio-sidebar"
      aria-valuenow={width}
      aria-valuemin={INSPECTOR_MIN_WIDTH}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize the inspector; double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { pointer: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        preview(event.currentTarget, widthAt(event.clientX));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        const next = widthAt(event.clientX);
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onCommit(next);
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        preview(event.currentTarget, width);
      }}
      onDoubleClick={() => onCommit(clamp(INSPECTOR_DEFAULT_WIDTH))}
      onKeyDown={(event) => {
        const next =
          event.key === 'ArrowLeft'
            ? width + INSPECTOR_WIDTH_STEP
            : event.key === 'ArrowRight'
              ? width - INSPECTOR_WIDTH_STEP
              : event.key === 'Home'
                ? INSPECTOR_MIN_WIDTH
                : event.key === 'End'
                  ? max
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        onCommit(clamp(next));
      }}
    />
  );
}
