import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { walkableCellsInWorldRectangle } from '../world-building/roomDraft';
import {
  reshapeWallEndpoint,
  rotateWall,
  snapWallPoint,
  translateWall,
} from '../world-building/structuralWallEditing';
import {
  centeredRoomWorkspace,
  workspaceBounds,
} from '../world-building/workspaceGeometry';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import {
  createLayoutTransform,
  layoutCellCenter,
  worldToClient,
  type LayoutBounds,
} from './layoutGeometry';
import { LayoutViewport } from './LayoutViewport';
import type {
  LayoutFrame,
  LayoutViewportProps,
  RoomHexCell,
  StructuralWall,
  StudioWallEditing,
  WorldPoint,
} from './studioSession';

const initialFrame: LayoutFrame = { center: { x: 0, z: 0 }, zoom: 1 };
let bounds: LayoutBounds;
let captures: Set<number>;
let capture: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;
let resizeCallback: ResizeObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeEach(() => {
  bounds = { left: 30, top: 70, width: 960, height: 600 };
  captures = new Set();
  capture = vi.fn((id: number): void => {
    captures.add(id);
  });
  release = vi.fn((id: number): void => {
    captures.delete(id);
  });
  disconnect = vi.fn();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({
      ...bounds,
      x: bounds.left,
      y: bounds.top,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
      toJSON: (): object => ({}),
    })
  );
  Object.defineProperties(SVGSVGElement.prototype, {
    setPointerCapture: { configurable: true, value: capture },
    releasePointerCapture: { configurable: true, value: release },
    hasPointerCapture: {
      configurable: true,
      value: (id: number): boolean => captures.has(id),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function props(
  overrides: Partial<LayoutViewportProps> = {}
): LayoutViewportProps {
  const draft = createPopulatedStudioDocument().draft;
  return {
    draft,
    tool: 'paint',
    frame: initialFrame,
    onCommit: vi.fn(() => true),
    onFrameChange: vi.fn(),
    ...overrides,
  };
}
function surface(): SVGSVGElement {
  return screen.getByRole('application', {
    name: 'Layout floor surface',
  }) as unknown as SVGSVGElement;
}
function position(
  world: WorldPoint,
  frame: LayoutFrame = initialFrame
): { clientX: number; clientY: number } {
  const point = worldToClient(world, createLayoutTransform(bounds, frame, 12))!;
  return { clientX: point.x, clientY: point.y };
}
function at(
  cell: RoomHexCell,
  frame: LayoutFrame = initialFrame
): { clientX: number; clientY: number } {
  return position(layoutCellCenter(cell), frame);
}
const zero = { q: 0, r: 0 };
const one = { q: 1, r: 0 };
function previewCells(): string[] {
  return [...surface().querySelectorAll('[data-preview-cell]')].map(
    (node) => node.getAttribute('data-preview-cell')!
  );
}
function brush(): void {
  fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7, button: 0 });
  fireEvent.pointerMove(surface(), { ...at(one), pointerId: 7 });
}

describe('controlled rectangular Layout', () => {
  it.each([
    [73, 48, 3504],
    [128, 128, 16384],
  ])(
    'draws actual %s × %s (%s) cells, not its enclosing disk',
    (w, h, count) => {
      const input = props();
      input.draft = { ...input.draft, workspace: centeredRoomWorkspace(w, h) };
      render(<LayoutViewport {...input} />);
      expect(surface().querySelectorAll('[data-cell]')).toHaveLength(count);
      const transform = createLayoutTransform(
        bounds,
        initialFrame,
        workspaceBounds(input.draft.workspace)
      )!;
      const point = worldToClient(
        layoutCellCenter({ q: -36, r: 0 }),
        transform
      )!;
      fireEvent.pointerDown(surface(), {
        clientX: point.x,
        clientY: point.y,
        pointerId: 7,
      });
      const positive = worldToClient(
        layoutCellCenter({ q: 36, r: 0 }),
        transform
      )!;
      fireEvent.pointerMove(surface(), {
        clientX: positive.x,
        clientY: positive.y,
        pointerId: 7,
      });
      fireEvent.pointerUp(surface(), {
        clientX: positive.x,
        clientY: positive.y,
        pointerId: 7,
      });
      expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
        [
          { q: -36, r: 0 },
          { q: 36, r: 0 },
        ],
        'paint'
      );
      const outside = worldToClient(
        layoutCellCenter({ q: 37, r: 0 }),
        transform
      )!;
      if (h === 48) {
        fireEvent.pointerDown(surface(), {
          clientX: outside.x,
          clientY: outside.y,
          pointerId: 8,
        });
        fireEvent.pointerUp(surface(), {
          clientX: outside.x,
          clientY: outside.y,
          pointerId: 8,
        });
        expect(previewCells()).toEqual([]);
        expect(input.onCommit).toHaveBeenCalledTimes(1);
      }
    }
  );

  it.each(['rectangle', 'erase'] as const)(
    'uses actual expanded bounds for a %s gesture',
    (tool) => {
      const input = props({ tool });
      input.draft = {
        ...input.draft,
        workspace: centeredRoomWorkspace(73, 48),
      };
      render(<LayoutViewport {...input} />);
      const transform = createLayoutTransform(
        bounds,
        initialFrame,
        workspaceBounds(input.draft.workspace)
      )!;
      const a = worldToClient(layoutCellCenter({ q: -36, r: 0 }), transform)!,
        b = worldToClient(layoutCellCenter({ q: 36, r: 0 }), transform)!;
      fireEvent.pointerDown(surface(), {
        clientX: a.x,
        clientY: a.y,
        pointerId: 7,
      });
      fireEvent.pointerMove(surface(), {
        clientX: b.x,
        clientY: b.y,
        pointerId: 7,
      });
      expect(previewCells()).toHaveLength(tool === 'rectangle' ? 73 : 2);
      fireEvent.pointerUp(surface(), {
        clientX: b.x,
        clientY: b.y,
        pointerId: 7,
      });
      const expected =
        tool === 'rectangle'
          ? Array.from({ length: 73 }, (_, i) => ({ q: i - 36, r: 0 }))
          : [
              { q: -36, r: 0 },
              { q: 36, r: 0 },
            ];
      expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
        expected,
        tool === 'erase' ? 'erase' : 'paint'
      );
    }
  );

  it.each(['document', 'workspace'])(
    'cancels captured previews across %s replacement without a history callback',
    (reason) => {
      const input = props();
      const view = render(<LayoutViewport {...input} />);
      brush();
      const draft =
        reason === 'workspace'
          ? { ...input.draft, workspace: centeredRoomWorkspace(73, 48) }
          : {
              ...input.draft,
              room: { ...input.draft.room, walkableHexes: [{ q: 2, r: 0 }] },
            };
      view.rerender(<LayoutViewport {...input} draft={draft} />);
      expect(previewCells()).toEqual([]);
      expect(release).toHaveBeenCalledWith(7);
      fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
      expect(input.onCommit).not.toHaveBeenCalled();
    }
  );
});

describe('controlled Layout floor surface', () => {
  it('brush samples 0,0 and 1,0 once despite repeated movement', () => {
    const input = props();
    const original = structuredClone(input.draft);
    render(<LayoutViewport {...input} />);
    brush();
    fireEvent.pointerMove(surface(), { ...at(one), pointerId: 7 });
    fireEvent.pointerMove(surface(), { ...at(zero), pointerId: 7 });
    expect(previewCells()).toEqual(['0,0', '1,0']);
    expect(input.onCommit).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7, button: 0 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'paint'
    );
    expect(previewCells()).toEqual([]);
    expect(release).toHaveBeenCalledWith(7);
    expect(input.draft).toEqual(original);
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledTimes(1);
  });

  it('erase submits the same cell identities with erase mode', () => {
    const input = props({ tool: 'erase' });
    render(<LayoutViewport {...input} />);
    brush();
    expect(previewCells()).toEqual(['0,0', '1,0']);
    expect(input.onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7, button: 0 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'erase'
    );
  });

  it.each([false, true])(
    'rectangle includes 0,0 and 1,0 by center in either drag direction: %s',
    (reverse) => {
      const input = props({ tool: 'rectangle' });
      render(<LayoutViewport {...input} />);
      const first = { x: -0.1, z: -0.1 };
      const last = { x: Math.sqrt(3) + 0.1, z: 0.1 };
      const start = reverse ? last : first;
      const end = reverse ? first : last;
      fireEvent.pointerDown(surface(), { ...position(start), pointerId: 7 });
      fireEvent.pointerMove(surface(), { ...position(end), pointerId: 7 });
      expect(previewCells()).toEqual(['0,0', '1,0']);
      expect(input.onCommit).not.toHaveBeenCalled();
      fireEvent.pointerUp(surface(), { ...position(end), pointerId: 7 });
      expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
        [zero, one],
        'paint'
      );
      // Exact boundary semantics are the canonical helper's, not axial-box selection.
      expect(
        walkableCellsInWorldRectangle(
          layoutCellCenter(zero),
          layoutCellCenter(one),
          6
        )
      ).toEqual([zero, one]);
    }
  );

  it.each([false, true])(
    'rectangle includes exact center boundaries: reverse %s',
    (reverse) => {
      const input = props({ tool: 'rectangle' });
      render(<LayoutViewport {...input} />);
      const start = reverse ? one : zero;
      const end = reverse ? zero : one;
      fireEvent.pointerDown(surface(), { ...at(start), pointerId: 7 });
      fireEvent.pointerMove(surface(), { ...at(end), pointerId: 7 });
      expect(previewCells()).toEqual(['0,0', '1,0']);
      fireEvent.pointerUp(surface(), { ...at(end), pointerId: 7 });
      expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
        [zero, one],
        'paint'
      );
    }
  );

  it('rectangle does not select axial box cells outside the world-XZ box', () => {
    const input = props({ tool: 'rectangle' });
    render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), {
      ...position({ x: -0.1, z: -0.1 }),
      pointerId: 7,
    });
    fireEvent.pointerMove(surface(), {
      ...position({ x: Math.sqrt(3) + 0.1, z: 1.6 }),
      pointerId: 7,
    });
    fireEvent.pointerUp(surface(), {
      ...position({ x: Math.sqrt(3) + 0.1, z: 1.6 }),
      pointerId: 7,
    });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one, { q: 0, r: 1 }],
      'paint'
    );
  });

  it('primary release commits once and another pointer cannot finish it', () => {
    const input = props();
    render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7 });
    fireEvent.pointerDown(surface(), { ...at(one), pointerId: 8 });
    fireEvent.pointerMove(surface(), { ...at(one), pointerId: 8 });
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 8 });
    fireEvent.pointerCancel(surface(), { pointerId: 8 });
    fireEvent.lostPointerCapture(surface(), { pointerId: 8 });
    expect(previewCells()).toEqual(['0,0']);
    expect(input.onCommit).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface(), { ...at(zero), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith([zero], 'paint');
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it.each(['paint', 'rectangle'] as const)(
    'captured off-surface release finishes %s without sampling release location',
    (tool) => {
      const input = props({ tool });
      render(<LayoutViewport {...input} />);
      if (tool === 'paint') brush();
      else {
        fireEvent.pointerDown(surface(), {
          ...position({ x: -0.1, z: -0.1 }),
          pointerId: 7,
        });
        fireEvent.pointerMove(surface(), {
          ...position({ x: Math.sqrt(3) + 0.1, z: 0.1 }),
          pointerId: 7,
        });
      }
      fireEvent.pointerMove(surface(), {
        clientX: -100,
        clientY: -100,
        pointerId: 7,
      });
      fireEvent.pointerUp(surface(), {
        clientX: -100,
        clientY: -100,
        pointerId: 7,
      });
      expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
        [zero, one],
        'paint'
      );
    }
  );

  it.each(
    [
      'escape',
      'right click',
      'contextmenu',
      'pointercancel',
      'lost capture',
      'tool change',
      'unmount',
    ].flatMap((route) =>
      (['paint', 'erase', 'rectangle'] as const).map((tool) => ({
        route,
        tool,
      }))
    )
  )(
    'cancel routes never commit and release capture: $route / $tool',
    ({ route, tool }) => {
      const input = props({ tool });
      const view = render(<LayoutViewport {...input} />);
      brush();
      const node = surface();
      switch (route) {
        case 'escape':
          fireEvent.keyDown(window, { key: 'Escape' });
          break;
        case 'right click':
          fireEvent.pointerDown(node, { pointerId: 7, button: 2 });
          break;
        case 'contextmenu':
          fireEvent.contextMenu(node);
          break;
        case 'pointercancel':
          fireEvent.pointerCancel(node, { pointerId: 7 });
          break;
        case 'lost capture':
          fireEvent.lostPointerCapture(node, { pointerId: 7 });
          break;
        case 'tool change':
          view.rerender(
            <LayoutViewport
              {...input}
              tool={tool === 'erase' ? 'paint' : 'erase'}
            />
          );
          break;
        case 'unmount':
          view.unmount();
          break;
      }
      expect(release).toHaveBeenCalledExactlyOnceWith(7);
      expect(captures.size).toBe(0);
      if (route !== 'unmount') expect(previewCells()).toEqual([]);
      fireEvent.pointerUp(node, { ...at(one), pointerId: 7 });
      expect(input.onCommit).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledTimes(route === 'unmount' ? 1 : 0);
    }
  );

  it.each([0, NaN, Infinity])(
    'zero-sized/nonfinite bounds produce no cell or commit: %s',
    (width) => {
      bounds.width = width;
      const input = props();
      render(<LayoutViewport {...input} />);
      fireEvent.pointerDown(surface(), { clientX: 30, clientY: 70 });
      fireEvent.pointerMove(surface(), { clientX: 30, clientY: 70 });
      fireEvent.pointerUp(surface(), { clientX: 30, clientY: 70 });
      expect(previewCells()).toEqual([]);
      expect(capture).not.toHaveBeenCalled();
      expect(input.onCommit).not.toHaveBeenCalled();
    }
  );

  it('workspace boundary filters outside cells without altering committed content', () => {
    const input = props();
    const original = structuredClone(input.draft);
    render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at({ q: 6, r: 0 }), pointerId: 7 });
    fireEvent.pointerMove(surface(), { ...at({ q: 7, r: 0 }), pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at({ q: 7, r: 0 }), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [{ q: 6, r: 0 }],
      'paint'
    );
    expect(input.draft).toEqual(original);
  });

  it('refused callback leaves committed cells unchanged after clearing preview', () => {
    const input = props({ onCommit: vi.fn(() => false) });
    render(<LayoutViewport {...input} />);
    const committed = surface().querySelector(
      '.encounter-studio-layout-committed'
    )!.innerHTML;
    brush();
    expect(previewCells()).toEqual(['0,0', '1,0']);
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'paint'
    );
    expect(previewCells()).toEqual([]);
    expect(
      surface().querySelector('.encounter-studio-layout-committed')!.innerHTML
    ).toBe(committed);
  });

  it('presentation/callback rerenders retain samples when the document is unchanged', () => {
    const input = props();
    const view = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7 });
    const next = props({
      draft: input.draft,
      frame: { center: { x: 2, z: -1 }, zoom: 2 },
    });
    view.rerender(<LayoutViewport {...next} />);
    expect(previewCells()).toEqual(['0,0']);
    fireEvent.pointerMove(surface(), { ...at(one, next.frame), pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(one, next.frame), pointerId: 7 });
    expect(next.onCommit).not.toHaveBeenCalled();
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'paint'
    );
  });

  it('middle pan and anchored clamped wheel zoom never commit floor', () => {
    const onCommit = vi.fn(() => true);
    let latest = initialFrame;
    const onFrameChange = vi.fn();
    const input = props();
    function Controlled(): React.JSX.Element {
      const [frame, setFrame] = useState(initialFrame);
      latest = frame;
      return (
        <LayoutViewport
          {...input}
          frame={frame}
          onCommit={onCommit}
          onFrameChange={(next): void => {
            onFrameChange(next);
            setFrame(next);
          }}
        />
      );
    }
    render(<Controlled />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7, button: 1 });
    fireEvent.pointerMove(surface(), {
      clientX: 560,
      clientY: 345,
      pointerId: 7,
    });
    expect(latest).toEqual({ center: { x: -2, z: 1 }, zoom: 1 });
    fireEvent.pointerMove(surface(), {
      clientX: 585,
      clientY: 345,
      pointerId: 7,
    });
    expect(latest).toEqual({ center: { x: -3, z: 1 }, zoom: 1 });
    fireEvent.pointerUp(surface(), {
      clientX: 585,
      clientY: 345,
      pointerId: 7,
      button: 1,
    });
    const pointed = { q: 2, r: 0 };
    const point = at(pointed, latest);
    expect(fireEvent.wheel(surface(), { ...point, deltaY: -100000 })).toBe(
      false
    );
    expect(latest.zoom).toBe(4);
    expect(at(pointed, latest).clientX).toBeCloseTo(point.clientX);
    expect(at(pointed, latest).clientY).toBeCloseTo(point.clientY);
    fireEvent.wheel(surface(), { ...point, deltaY: 100000 });
    expect(latest.zoom).toBe(0.25);
    expect(at(pointed, latest).clientX).toBeCloseTo(point.clientX);
    expect(at(pointed, latest).clientY).toBeCloseTo(point.clientY);
    expect(onFrameChange).toHaveBeenCalledTimes(4);
    expect(onCommit).not.toHaveBeenCalled();
    expect(previewCells()).toEqual([]);
  });

  it('resize updates drawn coordinates and picking through the same transform', () => {
    const input = props();
    render(<LayoutViewport {...input} />);
    const polygon = surface().querySelector('[data-cell="0,0"]')!;
    const before = polygon.getAttribute('points');
    const beforeTransform = surface()
      .querySelector('.encounter-studio-layout-committed')!
      .getAttribute('transform');
    bounds = { left: 170, top: 220, width: 600, height: 800 };
    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });
    expect(surface().getAttribute('viewBox')).toBe('0 0 600 800');
    expect(
      surface().querySelector('[data-cell="0,0"]')!.getAttribute('points')
    ).toBe(before); // World geometry is stable; only presentation moves.
    expect(surface().querySelector('[data-cell="0,0"]')).toBe(polygon);
    expect(
      surface()
        .querySelector('.encounter-studio-layout-committed')!
        .getAttribute('transform')
    ).not.toBe(beforeTransform);
    brush();
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'paint'
    );
  });

  it('brush samples rather than interpolating skipped cells', () => {
    const input = props();
    render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7 });
    fireEvent.pointerMove(surface(), { ...at({ q: 3, r: 0 }), pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at({ q: 3, r: 0 }), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, { q: 3, r: 0 }],
      'paint'
    );
  });

  it('nonprimary and unsupported buttons do not capture or edit', () => {
    const input = props();
    render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), {
      ...at(zero),
      pointerId: 8,
      isPrimary: false,
    });
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7, button: 3 });
    fireEvent.pointerUp(surface(), { ...at(zero), pointerId: 7 });
    expect(capture).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });

  it('failed capture and naturally lost capture abandon without a late commit', () => {
    const input = props();
    render(<LayoutViewport {...input} />);
    capture.mockImplementationOnce(() => {
      throw new Error('retired pointer');
    });
    brush();
    expect(previewCells()).toEqual([]);
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
    expect(input.onCommit).not.toHaveBeenCalled();
    brush();
    captures.delete(7); // Native capture loss already released the pointer.
    fireEvent.lostPointerCapture(surface(), { pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(one), pointerId: 7 });
    expect(previewCells()).toEqual([]);
    expect(input.onCommit).not.toHaveBeenCalled();
  });

  it('rectangle keeps its world anchor through a controlled frame rerender', () => {
    const input = props({ tool: 'rectangle' });
    const view = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7 });
    const frame: LayoutFrame = { center: { x: 2, z: -1 }, zoom: 2 };
    view.rerender(<LayoutViewport {...input} frame={frame} />);
    fireEvent.pointerMove(surface(), { ...at(one, frame), pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(one, frame), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [zero, one],
      'paint'
    );
  });

  it('remount consumes supplied framing rather than resetting it', () => {
    const input = props({ frame: { center: { x: 3, z: -2 }, zoom: 2 } });
    const view = render(<LayoutViewport {...input} />);
    const points = surface()
      .querySelector('[data-cell="0,0"]')!
      .getAttribute('points');
    view.unmount();
    render(<LayoutViewport {...input} />);
    expect(
      surface().querySelector('[data-cell="0,0"]')!.getAttribute('points')
    ).toBe(points);
    fireEvent.pointerDown(surface(), {
      ...at(zero, input.frame),
      pointerId: 7,
    });
    fireEvent.pointerUp(surface(), { ...at(zero, input.frame), pointerId: 7 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith([zero], 'paint');
    expect(input.onFrameChange).not.toHaveBeenCalled();
  });

  it('suppresses context menu only on the surface', () => {
    render(<LayoutViewport {...props()} />);
    expect(fireEvent.contextMenu(surface())).toBe(false);
    expect(fireEvent.contextMenu(document.body)).toBe(true);
  });
});

describe('2D map label pointer ownership and shared transforms', () => {
  function labelled(
    overrides: Partial<LayoutViewportProps> = {}
  ): LayoutViewportProps {
    const input = props(overrides);
    input.draft = {
      ...input.draft,
      scene: {
        ...input.draft.scene,
        version: 2,
        mapLabels: [
          { id: 'kitchen', text: 'Kitchen', location: { x: 0, z: 0 } },
        ],
      },
    };
    input.labelEditing = {
      active: true,
      placementText: null,
      selectedId: null,
      onSelect: vi.fn(),
      onCreate: vi.fn(() => true),
      onMove: vi.fn(() => true),
      onCancel: vi.fn(),
      ...overrides.labelEditing,
    };
    return input;
  }
  function label(): Element {
    return surface().querySelector('[data-label-id="kitchen"]')!;
  }
  function downLabel(): void {
    fireEvent.pointerDown(label(), {
      ...position({ x: 0, z: 0 }),
      pointerId: 7,
      button: 0,
    });
  }
  function finish(): void {
    fireEvent.pointerUp(surface(), {
      ...position({ x: 1, z: 1 }),
      pointerId: 7,
      button: 0,
    });
  }

  it('creates exactly once on completed placement with no floor paint; empty Label mode is inert', () => {
    const input = labelled();
    const { rerender } = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7, button: 0 });
    fireEvent.pointerUp(surface(), { ...at(zero), pointerId: 7, button: 0 });
    expect(input.onCommit).not.toHaveBeenCalled();
    const armed = {
      ...input,
      labelEditing: { ...input.labelEditing!, placementText: 'Courtyard' },
    };
    rerender(<LayoutViewport {...armed} />);
    fireEvent.pointerDown(surface(), {
      ...position({ x: 2, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    expect(armed.labelEditing.onCreate).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface(), {
      ...position({ x: 2, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...position({ x: 2, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    expect(armed.labelEditing.onCreate).toHaveBeenCalledExactlyOnceWith(
      'Courtyard',
      { x: 2, z: -1 }
    );
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('label hits select and drag by stable ID even in Paint; captured floor strokes crossing text remain floor-owned', () => {
    const input = labelled();
    input.labelEditing!.active = false;
    render(<LayoutViewport {...input} />);
    downLabel();
    fireEvent.pointerMove(surface(), {
      ...position({ x: 1, z: 1 }),
      pointerId: 7,
    });
    expect(input.labelEditing!.onSelect).toHaveBeenCalledExactlyOnceWith(
      'kitchen'
    );
    expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
    finish();
    expect(input.labelEditing!.onMove).toHaveBeenCalledExactlyOnceWith(
      'kitchen',
      { x: 1, z: 1 }
    );
    expect(input.onCommit).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface(), { ...at(one), pointerId: 8, button: 0 });
    fireEvent.pointerMove(label(), { ...at(zero), pointerId: 8 });
    fireEvent.pointerUp(label(), { ...at(zero), pointerId: 8, button: 0 });
    expect(input.onCommit).toHaveBeenCalledExactlyOnceWith(
      [one, zero],
      'paint'
    );
    expect(input.labelEditing!.onMove).toHaveBeenCalledTimes(1);
    expect(input.labelEditing!.onSelect).toHaveBeenCalledTimes(1);
  });
  it('select-only click is a real no-op even at a fractional world anchor', () => {
    const input = labelled();
    input.draft.scene.mapLabels![0].location = {
      x: 0.123456789,
      z: -0.987654321,
    };
    render(<LayoutViewport {...input} />);
    const hit = position(input.draft.scene.mapLabels![0].location);
    fireEvent.pointerDown(label(), { ...hit, pointerId: 7, button: 0 });
    fireEvent.pointerUp(surface(), { ...hit, pointerId: 7, button: 0 });
    expect(input.labelEditing!.onSelect).toHaveBeenCalledExactlyOnceWith(
      'kitchen'
    );
    expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('refused or generation-retired captured intent never falls back to floor, retries, or retains preview', () => {
    const input = labelled();
    input.labelEditing!.onMove = vi.fn(() => false);
    render(<LayoutViewport {...input} />);
    downLabel();
    fireEvent.pointerMove(surface(), {
      ...position({ x: 1, z: 1 }),
      pointerId: 7,
    });
    finish();
    finish();
    expect(input.labelEditing!.onMove).toHaveBeenCalledExactlyOnceWith(
      'kitchen',
      { x: 1, z: 1 }
    );
    expect(Number(label().getAttribute('x'))).toBe(bounds.width / 2);
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('does not let another pointer steal a label capture, and canceling arming cancels an unfinished placement', () => {
    const input = labelled();
    const { rerender } = render(<LayoutViewport {...input} />);
    downLabel();
    fireEvent.pointerDown(surface(), {
      ...position({ x: 2, z: 1 }),
      pointerId: 8,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...position({ x: 2, z: 1 }),
      pointerId: 8,
      button: 0,
    });
    expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
    finish();
    expect(input.labelEditing!.onMove).toHaveBeenCalledTimes(1);
    rerender(
      <LayoutViewport
        {...input}
        labelEditing={{ ...input.labelEditing!, placementText: 'Courtyard' }}
      />
    );
    fireEvent.pointerDown(surface(), {
      ...position({ x: 2, z: 1 }),
      pointerId: 7,
      button: 0,
    });
    rerender(<LayoutViewport {...input} />);
    finish();
    expect(input.labelEditing!.onCreate).not.toHaveBeenCalled();
  });
  it('uses actual world transform under translated bounds/pan/zoom, preserves grab offset and screen font size', () => {
    const frame = { center: { x: 2, z: -3 }, zoom: 2 };
    const input = labelled({ frame });
    render(<LayoutViewport {...input} />);
    const text = label();
    const anchor = worldToClient(
      { x: 0, z: 0 },
      createLayoutTransform(bounds, frame, 12)
    )!;
    expect(Number(text.getAttribute('x'))).toBeCloseTo(anchor.x - bounds.left);
    expect(Number(text.getAttribute('y'))).toBeCloseTo(anchor.y - bounds.top);
    expect(text.getAttribute('font-size')).toBe('14');
    fireEvent.pointerDown(text, {
      ...position({ x: 0.25, z: 0.5 }, frame),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerMove(surface(), {
      ...position({ x: 1.25, z: 1.5 }, frame),
      pointerId: 7,
    });
    expect(Number(label().getAttribute('x'))).toBeCloseTo(
      anchor.x - bounds.left + 50
    );
    fireEvent.pointerUp(surface(), {
      ...position({ x: 1.25, z: 1.5 }, frame),
      pointerId: 7,
      button: 0,
    });
    expect(input.labelEditing!.onMove).toHaveBeenCalledExactlyOnceWith(
      'kitchen',
      { x: 1, z: 1 }
    );
  });
  it.each([
    'escape',
    'right-click',
    'capture-loss',
    'pointer-cancel',
    'unmount',
    'tool',
    'document',
    'mode',
  ] as const)(
    '%s abandons a label gesture without any label/floor intent',
    (kind) => {
      const input = labelled();
      const { rerender, unmount } = render(<LayoutViewport {...input} />);
      downLabel();
      fireEvent.pointerMove(surface(), {
        ...position({ x: 1, z: 1 }),
        pointerId: 7,
      });
      if (kind === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
      if (kind === 'right-click') fireEvent.contextMenu(surface());
      if (kind === 'capture-loss')
        fireEvent.lostPointerCapture(surface(), { pointerId: 7 });
      if (kind === 'pointer-cancel')
        fireEvent.pointerCancel(surface(), { pointerId: 7 });
      if (kind === 'tool') rerender(<LayoutViewport {...input} tool="erase" />);
      if (kind === 'document')
        rerender(<LayoutViewport {...input} draft={{ ...input.draft }} />);
      if (kind === 'mode')
        rerender(
          <LayoutViewport
            {...input}
            labelEditing={{ ...input.labelEditing!, active: false }}
          />
        );
      if (kind === 'unmount') unmount();
      else finish();
      expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
      expect(input.labelEditing!.onCreate).not.toHaveBeenCalled();
      expect(input.onCommit).not.toHaveBeenCalled();
      expect(captures.size).toBe(0);
    }
  );
  it('full owner document identity retires scope-only changes even when the draft object is unchanged', () => {
    const input = labelled();
    const documentContext = { draft: input.draft, scope: {} };
    const { rerender } = render(
      <LayoutViewport {...input} documentContext={documentContext} />
    );
    downLabel();
    rerender(
      <LayoutViewport {...input} documentContext={{ ...documentContext }} />
    );
    finish();
    expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('callback-only rerender does not cancel or replace the live gesture intent; frame changes sample with the live transform', () => {
    const input = labelled();
    const { rerender } = render(<LayoutViewport {...input} />);
    downLabel();
    const nextMove = vi.fn(() => true);
    const frame = { center: { x: 1, z: 0 }, zoom: 1.5 };
    rerender(
      <LayoutViewport
        {...input}
        frame={frame}
        labelEditing={{ ...input.labelEditing!, onMove: nextMove }}
      />
    );
    fireEvent.pointerUp(surface(), {
      ...position({ x: 2, z: 1 }, frame),
      pointerId: 7,
      button: 0,
    });
    expect(input.labelEditing!.onMove).toHaveBeenCalledExactlyOnceWith(
      'kitchen',
      { x: 2, z: 1 }
    );
    expect(nextMove).not.toHaveBeenCalled();
  });
  it('rejects enclosing-envelope-only label points and an invalid move release instead of using last valid preview', () => {
    const input = labelled();
    input.draft = { ...input.draft, workspace: centeredRoomWorkspace(3, 3) };
    input.labelEditing!.placementText = 'Courtyard';
    const transform = createLayoutTransform(
      bounds,
      initialFrame,
      workspaceBounds(input.draft.workspace)
    )!;
    const atWorld = (p: WorldPoint): { clientX: number; clientY: number } => {
      const client = worldToClient(p, transform)!;
      return { clientX: client.x, clientY: client.y };
    };
    const { rerender } = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), {
      ...atWorld({ x: 5, z: 0 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...atWorld({ x: 5, z: 0 }),
      pointerId: 7,
      button: 0,
    });
    expect(input.labelEditing!.onCreate).not.toHaveBeenCalled();
    rerender(
      <LayoutViewport
        {...input}
        labelEditing={{ ...input.labelEditing!, placementText: null }}
      />
    );
    fireEvent.pointerDown(label(), {
      ...atWorld({ x: 0, z: 0 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerMove(surface(), {
      ...atWorld({ x: 1, z: 0 }),
      pointerId: 7,
    });
    fireEvent.pointerUp(surface(), {
      ...atWorld({ x: 5, z: 0 }),
      pointerId: 7,
      button: 0,
    });
    expect(input.labelEditing!.onMove).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('keyboard selects labels without floor edits and Enter on the surface places at the actual frame center', () => {
    const input = labelled({ frame: { center: { x: 1, z: 2 }, zoom: 1.5 } });
    input.labelEditing!.placementText = 'Courtyard';
    render(<LayoutViewport {...input} />);
    fireEvent.keyDown(label(), { key: 'Enter' });
    expect(input.labelEditing!.onSelect).toHaveBeenCalledExactlyOnceWith(
      'kitchen'
    );
    expect(input.labelEditing!.onCreate).not.toHaveBeenCalled();
    fireEvent.keyDown(surface(), { key: 'Enter' });
    expect(input.labelEditing!.onCreate).toHaveBeenCalledExactlyOnceWith(
      'Courtyard',
      { x: 1, z: 2 }
    );
    expect(input.onCommit).not.toHaveBeenCalled();
  });
});

describe('controlled Layout wall gestures', () => {
  function walls(
    overrides: Partial<LayoutViewportProps> = {}
  ): LayoutViewportProps & { wallEditing: StudioWallEditing } {
    const input = props({ tool: 'wall', ...overrides });
    return {
      ...input,
      intentEpoch: 1,
      wallEditing: {
        selectedId: null,
        assetRef: input.draft.room.walls![0].appearance.assetRef,
        snapEnabled: false,
        endpointSnapEnabled: false,
        setEndpointSnap: vi.fn(() => true),
        options: [],
        select: vi.fn(() => true),
        setAsset: vi.fn(() => true),
        setSnap: vi.fn(() => true),
        create: vi.fn(() => true),
        edit: vi.fn(() => true),
        remove: vi.fn(() => true),
        reportRefusal: vi.fn(),
        ...overrides.wallEditing,
      },
    };
  }
  function body(id = 'studio-wall'): Element {
    return surface().querySelector(`line[data-wall-id="${id}"]`)!;
  }
  function handle(endpoint: 'start' | 'end'): Element {
    return surface().querySelector(`[data-wall-endpoint="${endpoint}"]`)!;
  }
  function down(
    node: Element,
    point: WorldPoint,
    pointerId = 7,
    button = 0
  ): void {
    fireEvent.pointerDown(node, { ...position(point), pointerId, button });
  }
  function move(point: WorldPoint, pointerId = 7): void {
    fireEvent.pointerMove(surface(), { ...position(point), pointerId });
  }
  function up(point: WorldPoint, pointerId = 7, button = 0): void {
    fireEvent.pointerUp(surface(), { ...position(point), pointerId, button });
  }
  function expectPreviewEndpoint(
    endpoint: 'start' | 'end',
    point: WorldPoint
  ): void {
    const client = position(point);
    expect(Number(handle(endpoint).getAttribute('cx'))).toBeCloseTo(
      client.clientX - bounds.left
    );
    expect(Number(handle(endpoint).getAttribute('cy'))).toBeCloseTo(
      client.clientY - bounds.top
    );
  }
  function endpointWall(input: LayoutViewportProps): StructuralWall {
    const wall = input.draft.room.walls![0];
    wall.line = { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } };
    wall.openings = [
      {
        id: 'studio-opening',
        position: 7,
        width: 2,
        door: wall.openings[1].door,
      },
    ];
    wall.blocker = {
      blocksMovement: false,
      blocksLineOfSight: true,
      footprint: { width: 12, depth: 0.6, offsetX: 0.2, offsetZ: -0.1 },
    };
    return wall;
  }

  it.each([0.75, 2])(
    'joins a dragged endpoint exactly within the same screen radius at zoom %s',
    (zoom) => {
      const input = walls({ tool: 'select', frame: { ...initialFrame, zoom } });
      const source = endpointWall(input);
      const target = { x: 10.135791357913579, z: 2.3456789012345 };
      input.draft.room.walls = [
        source,
        {
          ...structuredClone(source),
          id: 'join-target',
          line: { start: target, end: { x: target.x, z: 8.7 } },
          openings: [],
        },
      ];
      input.wallEditing = {
        ...input.wallEditing,
        selectedId: source.id,
        endpointSnapEnabled: true,
      };
      render(<LayoutViewport {...input} />);
      const from = position(source.line.end, input.frame);
      const to = position(target, input.frame);
      const near = { clientX: to.clientX + 6, clientY: to.clientY };
      fireEvent.pointerDown(handle('end'), {
        ...from,
        pointerId: 7,
        button: 0,
      });
      fireEvent.pointerMove(surface(), { ...near, pointerId: 7 });
      const feedback = surface().querySelector(
        '[data-wall-feedback="Joined endpoint"]'
      )!;
      expect(feedback).not.toBeNull();
      expect(Number(feedback.getAttribute('cx'))).toBeCloseTo(
        to.clientX - bounds.left
      );
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
      fireEvent.pointerUp(surface(), { ...near, pointerId: 7, button: 0 });
      const result = vi.mocked(input.wallEditing.edit).mock.calls[0][0];
      expect(result.line.end).toEqual(target);
      expect(result.line.start).toEqual(source.line.start);
      expect(result.openings).toEqual(source.openings);
      expect(input.wallEditing.edit).toHaveBeenCalledTimes(1);
      expect(input.onCommit).not.toHaveBeenCalled();
    }
  );

  it('copies an existing endpoint on both ends of a newly drawn wall', () => {
    const input = walls();
    const source = endpointWall(input);
    const target = { x: 6.135791357913579, z: 5.3456789012345 };
    input.draft.room.walls = [
      source,
      {
        ...structuredClone(source),
        id: 'join-target',
        line: { start: target, end: { x: target.x, z: 9 } },
        openings: [],
      },
    ];
    input.wallEditing = { ...input.wallEditing, endpointSnapEnabled: true };
    render(<LayoutViewport {...input} />);
    const from = position(source.line.start),
      to = position(target);
    fireEvent.pointerDown(surface(), {
      clientX: from.clientX + 5,
      clientY: from.clientY,
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerMove(surface(), {
      clientX: to.clientX + 5,
      clientY: to.clientY,
      pointerId: 7,
    });
    expect(
      surface().querySelector('[data-wall-feedback="Joined endpoint"]')
    ).not.toBeNull();
    fireEvent.pointerUp(surface(), {
      clientX: to.clientX + 5,
      clientY: to.clientY,
      pointerId: 7,
      button: 0,
    });
    expect(input.wallEditing.create).toHaveBeenCalledExactlyOnceWith({
      start: source.line.start,
      end: target,
    });
  });

  it.each([false, true])(
    'creates consecutive strokes with snapped/free feedback and preview/commit parity: %s',
    (snapEnabled) => {
      const input = walls();
      input.wallEditing = { ...input.wallEditing, snapEnabled: snapEnabled };
      render(<LayoutViewport {...input} />);
      const a = { x: 0.23, z: 0.21 },
        b = { x: 2.12, z: 1.07 };
      for (const id of [7, 8]) {
        down(surface(), a, id);
        move(b, id);
        expect(input.wallEditing.create).toHaveBeenCalledTimes(id - 7);
        const start = snapWallPoint({ point: a, enabled: snapEnabled }).point;
        const end = snapWallPoint({ point: b, enabled: snapEnabled }).point;
        const line = surface().querySelector('[data-wall-preview="create"]')!;
        expect(Number(line.getAttribute('x1'))).toBeCloseTo(
          position(start).clientX - bounds.left
        );
        expect(Number(line.getAttribute('y2'))).toBeCloseTo(
          position(end).clientY - bounds.top
        );
        expect(
          surface()
            .querySelector('[data-wall-feedback]')
            ?.getAttribute('data-wall-feedback')
        ).toBe(snapEnabled ? 'Snapped' : 'Free point');
        up(b, id);
        const candidate = vi.mocked(input.wallEditing.create).mock.calls[
          id - 7
        ][0];
        expect(candidate.start.x).toBeCloseTo(start.x);
        expect(candidate.start.z).toBeCloseTo(start.z);
        expect(candidate.end.x).toBeCloseTo(end.x);
        expect(candidate.end.z).toBeCloseTo(end.z);
        expect(surface().querySelector('[data-wall-preview]')).toBeNull();
      }
      expect(input.wallEditing.create).toHaveBeenCalledTimes(2);
      expect(input.onCommit).not.toHaveBeenCalled();
    }
  );
  it('zero-length/unchanged-client strokes and unarmed drawing produce no content intent', () => {
    const input = walls();
    const { rerender } = render(<LayoutViewport {...input} />);
    const a = { x: 0.123456789, z: -0.987654321 };
    down(surface(), a);
    move(a);
    up(a);
    expect(input.wallEditing.create).not.toHaveBeenCalled();
    rerender(
      <LayoutViewport
        {...input}
        wallEditing={{ ...input.wallEditing, assetRef: null }}
      />
    );
    down(surface(), a);
    move({ x: 2, z: 1 });
    up({ x: 2, z: 1 });
    expect(input.wallEditing.reportRefusal).toHaveBeenCalledExactlyOnceWith(
      'Choose a wall appearance before drawing.'
    );
    expect(input.wallEditing.create).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('Wall ignores label hits, while Select prioritizes endpoints, labels, wall bodies, then empty deselection', () => {
    const input = walls({ tool: 'select' });
    input.draft.scene.mapLabels = [
      {
        id: 'label',
        text: 'Wall label',
        location: input.draft.room.walls![0].line.start,
      },
    ];
    input.labelEditing = {
      active: false,
      selectedId: 'label',
      placementText: null,
      onSelect: vi.fn(),
      onMove: vi.fn(() => true),
      onCreate: vi.fn(() => true),
      onCancel: vi.fn(),
    };
    input.wallEditing = { ...input.wallEditing, selectedId: 'studio-wall' };
    const { rerender } = render(<LayoutViewport {...input} />);
    const a = input.draft.room.walls![0].line.start;
    down(handle('start'), a);
    up(a);
    expect(input.wallEditing.select).toHaveBeenLastCalledWith('studio-wall');
    expect(input.labelEditing.onSelect).toHaveBeenLastCalledWith(null);
    const label = surface().querySelector('[data-label-id]')!;
    // Actual DOM layer order makes endpoints higher than labels, labels higher than bodies.
    expect(
      surface()
        .querySelector('.es-layout-walls-body')!
        .compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      label.compareDocumentPosition(handle('start')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    down(label, a);
    up(a);
    expect(input.labelEditing.onSelect).toHaveBeenLastCalledWith('label');
    expect(input.wallEditing.select).toHaveBeenLastCalledWith(null);
    down(body(), a);
    up(a);
    expect(input.labelEditing.onSelect).toHaveBeenLastCalledWith(null);
    down(surface(), { x: 0, z: 0 });
    up({ x: 0, z: 0 });
    expect(input.wallEditing.select).toHaveBeenLastCalledWith(null);
    expect(input.labelEditing.onSelect).toHaveBeenLastCalledWith(null);
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
    rerender(<LayoutViewport {...input} tool="wall" />);
    down(surface().querySelector('[data-label-id]')!, a);
    move({ x: 0, z: 0 });
    up({ x: 0, z: 0 });
    expect(input.wallEditing.create).toHaveBeenCalledTimes(1);
    expect(input.labelEditing.onMove).not.toHaveBeenCalled();
  });
  it.each(['paint', 'erase', 'rectangle', 'label', 'select'] as const)(
    'keeps %s isolated from wall drawing',
    (tool) => {
      const input = walls({ tool });
      render(<LayoutViewport {...input} />);
      down(surface(), { x: 0, z: 0 });
      move({ x: 1, z: 1 });
      up({ x: 1, z: 1 });
      expect(input.wallEditing.create).not.toHaveBeenCalled();
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
      if (tool === 'label' || tool === 'select')
        expect(input.onCommit).not.toHaveBeenCalled();
      else expect(input.onCommit).toHaveBeenCalledTimes(1);
      if (tool !== 'select')
        expect(surface().querySelector('line[data-wall-id]')).toBeNull();
    }
  );
  it('middle-button pan wins over selected endpoint and label hits', () => {
    const input = walls({ tool: 'select' });
    input.wallEditing = { ...input.wallEditing, selectedId: 'studio-wall' };
    render(<LayoutViewport {...input} />);
    down(handle('start'), { x: -4, z: -3 }, 7, 1);
    move({ x: -3, z: -2 });
    up({ x: -3, z: -2 }, 7, 1);
    expect(input.onFrameChange).toHaveBeenCalledTimes(1);
    expect(input.wallEditing.select).not.toHaveBeenCalled();
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('rigid move snaps the proposed start once, preserves the rotated vector and all attachment/blocker fields', () => {
    const input = walls({ tool: 'select' });
    const source = rotateWall(input.draft.room.walls![0], { angle: 0.37 });
    input.draft.room.walls = [source];
    input.wallEditing = { ...input.wallEditing, snapEnabled: true };
    input.wallEditing = { ...input.wallEditing, selectedId: source.id };
    render(<LayoutViewport {...input} />);
    const anchor = { x: 0.25, z: -3.1 },
      target = { x: 1.7, z: -1.9 };
    down(body(), anchor);
    move(target);
    const snapped = snapWallPoint({
      point: {
        x: source.line.start.x + target.x - anchor.x,
        z: source.line.start.z + target.z - anchor.z,
      },
      enabled: true,
    }).point;
    const expected = translateWall(source, {
      x: snapped.x - source.line.start.x,
      z: snapped.z - source.line.start.z,
    });
    expectPreviewEndpoint('start', expected.line.start);
    expectPreviewEndpoint('end', expected.line.end);
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    up(target);
    const candidate = vi.mocked(input.wallEditing.edit).mock.calls[0][0];
    expect(candidate.line.start.x).toBeCloseTo(expected.line.start.x);
    expect(candidate.line.end.z).toBeCloseTo(expected.line.end.z);
    expect(candidate.openings).toEqual(source.openings);
    expect(candidate.blocker).toEqual(source.blocker);
    expect(candidate.appearance).toEqual(source.appearance);
    expect(candidate.line.end.x - candidate.line.start.x).toBeCloseTo(
      source.line.end.x - source.line.start.x
    );
    expect(input.draft.room.walls![0]).toEqual(source);
  });
  it.each([
    {
      endpoint: 'end' as const,
      target: { x: 0, z: 6 },
      clamped: true,
      rotated: false,
    },
    {
      endpoint: 'start' as const,
      target: { x: 10, z: -2 },
      clamped: true,
      rotated: false,
    },
    {
      endpoint: 'start' as const,
      target: { x: 10, z: -12 },
      clamped: false,
      rotated: false,
    },
    {
      endpoint: 'end' as const,
      target: { x: -2, z: 6 },
      clamped: true,
      rotated: true,
    },
    {
      endpoint: 'start' as const,
      target: { x: 5, z: -5 },
      clamped: false,
      rotated: true,
    },
  ])(
    'endpoint $endpoint rotated=$rotated previews/submits the protected helper result and retains attached data',
    ({ endpoint, target, clamped, rotated }) => {
      const input = walls({ tool: 'select' });
      const original = endpointWall(input);
      const source = rotated
        ? rotateWall(original, { angle: 0.4, pivot: { x: 0, z: 0 } })
        : original;
      input.draft.room.walls = [source];
      input.wallEditing = { ...input.wallEditing, selectedId: source.id };
      const before = structuredClone(input.draft);
      render(<LayoutViewport {...input} />);
      down(handle(endpoint), source.line[endpoint]);
      move(target);
      const expected = reshapeWallEndpoint({
        wall: source,
        endpoint,
        point: target,
      });
      expect(expected.clamped).toBe(clamped);
      expectPreviewEndpoint(endpoint, expected.wall.line[endpoint]);
      expectPreviewEndpoint(
        endpoint === 'start' ? 'end' : 'start',
        source.line[endpoint === 'start' ? 'end' : 'start']
      );
      expect(
        surface()
          .querySelector('[data-wall-feedback]')
          ?.getAttribute('data-wall-feedback')
      ).toBe(clamped ? 'Clamped to preserve openings' : 'Free point');
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
      up(target);
      const candidate = vi.mocked(input.wallEditing.edit).mock.calls[0][0];
      expect(candidate.line[endpoint].x).toBeCloseTo(
        expected.wall.line[endpoint].x
      );
      expect(candidate.line[endpoint].z).toBeCloseTo(
        expected.wall.line[endpoint].z
      );
      expect(candidate.openings[0].position).toBeCloseTo(
        expected.wall.openings[0].position
      );
      expect(candidate.openings[0].door).toEqual(source.openings[0].door);
      expect(candidate.appearance).toEqual(source.appearance);
      expect(candidate.blocker.footprint.width).toBeCloseTo(
        expected.wall.blocker.footprint.width
      );
      expect(candidate.blocker.footprint.depth).toBe(
        source.blocker.footprint.depth
      );
      expect(candidate.blocker.blocksMovement).toBe(false);
      expect(candidate.blocker.blocksLineOfSight).toBe(true);
      expect(input.draft).toEqual(before);
    }
  );
  it('free end-to-(0,6) without an opening lands at requested point; snapped endpoints use the snap helper first', () => {
    const input = walls({ tool: 'select' });
    const wall = endpointWall(input);
    wall.openings = [];
    input.wallEditing = { ...input.wallEditing, selectedId: wall.id };
    const { rerender } = render(<LayoutViewport {...input} />);
    down(handle('end'), wall.line.end);
    move({ x: 0, z: 6 });
    up({ x: 0, z: 6 });
    const first = vi.mocked(input.wallEditing.edit).mock.calls[0][0];
    expect(first.line.end.x).toBeCloseTo(0);
    expect(first.line.end.z).toBeCloseTo(6);
    input.wallEditing = { ...input.wallEditing, snapEnabled: true };
    rerender(<LayoutViewport {...input} />);
    const target = { x: 0.15, z: 5.9 };
    down(handle('end'), wall.line.end);
    move(target);
    const snapped = snapWallPoint({ point: target, enabled: true }).point;
    const expected = reshapeWallEndpoint({
      wall,
      endpoint: 'end',
      point: snapped,
    }).wall;
    expectPreviewEndpoint('end', expected.line.end);
    up(target);
    const second = vi.mocked(input.wallEditing.edit).mock.calls[1][0];
    expect(second.line.end.x).toBeCloseTo(expected.line.end.x);
    expect(second.line.end.z).toBeCloseTo(expected.line.end.z);
  });
  it('fractional selection and control-panel reflow at unchanged client pointer never move a wall', () => {
    const input = walls({ tool: 'select' });
    const wall = input.draft.room.walls![0];
    wall.line.start.x = -4.123456789;
    const { rerender } = render(<LayoutViewport {...input} />);
    const hit = position({ x: -2.123456789, z: -3 });
    fireEvent.pointerDown(body(), { ...hit, pointerId: 7 });
    bounds = { ...bounds, top: bounds.top + 60, height: bounds.height - 60 };
    rerender(
      <LayoutViewport
        {...input}
        wallEditing={{ ...input.wallEditing, selectedId: wall.id }}
      />
    );
    fireEvent.pointerMove(surface(), { ...hit, pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...hit, pointerId: 7 });
    expect(input.wallEditing.select).toHaveBeenCalledWith(wall.id);
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it.each(['body', 'start', 'end'] as const)(
    'returning a fractional %s drag to its original pointer is a no-op',
    (kind) => {
      const input = walls({ tool: 'select' });
      const source = rotateWall(input.draft.room.walls![0], {
        angle: 0.123456789,
      });
      input.draft.room.walls = [source];
      input.wallEditing = { ...input.wallEditing, selectedId: source.id };
      render(<LayoutViewport {...input} />);
      const anchor =
        kind === 'body'
          ? { x: -1.123456789, z: -3.987654321 }
          : source.line[kind];
      down(kind === 'body' ? body() : handle(kind), anchor);
      move({ x: anchor.x + 1, z: anchor.z + 1 });
      move(anchor);
      up(anchor);
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
      expect(input.onCommit).not.toHaveBeenCalled();
    }
  );
  it('endpoint blocker-width refusal reports through the provider and discards the invalid candidate', () => {
    const input = walls({ tool: 'select' });
    const source = endpointWall(input);
    source.openings = [];
    source.blocker.footprint.width = 1;
    input.wallEditing = { ...input.wallEditing, selectedId: source.id };
    render(<LayoutViewport {...input} />);
    down(handle('end'), source.line.end);
    move({ x: 0, z: 6 });
    up({ x: 0, z: 6 });
    expect(input.wallEditing.reportRefusal).toHaveBeenCalledWith(
      expect.stringContaining('blocker')
    );
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    expect(source.blocker.footprint.width).toBe(1);
  });
  it.each(['epoch', 'scope'] as const)(
    'a %s replacement fences endpoint callbacks and permits only fresh gestures',
    (reason) => {
      const input = walls({ tool: 'select' });
      const source = endpointWall(input);
      input.wallEditing = { ...input.wallEditing, selectedId: source.id };
      const documentContext = { draft: input.draft, scope: {} };
      const { rerender } = render(
        <LayoutViewport {...input} documentContext={documentContext} />
      );
      down(handle('end'), source.line.end);
      move({ x: 0, z: 6 });
      const nextEdit = vi.fn(() => true);
      rerender(
        <LayoutViewport
          {...input}
          intentEpoch={reason === 'epoch' ? 2 : 1}
          documentContext={
            reason === 'scope' ? { ...documentContext } : documentContext
          }
          wallEditing={{ ...input.wallEditing, edit: nextEdit }}
        />
      );
      up({ x: 0, z: 6 });
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
      expect(nextEdit).not.toHaveBeenCalled();
      down(handle('end'), source.line.end, 8);
      move({ x: 0, z: 6 }, 8);
      up({ x: 0, z: 6 }, 8);
      expect(nextEdit).toHaveBeenCalledTimes(1);
      expect(input.wallEditing.edit).not.toHaveBeenCalled();
    }
  );
  it('preserves preview/captured callbacks across selection, frame, thumbnail and callback-only rerenders', () => {
    const input = walls({ tool: 'select' });
    const source = input.draft.room.walls![0];
    const { rerender } = render(<LayoutViewport {...input} />);
    down(body(), { x: 0, z: -3 });
    move({ x: 1, z: -2 });
    const nextEdit = vi.fn(() => true);
    const frame = { center: { x: 2, z: 1 }, zoom: 2 };
    rerender(
      <LayoutViewport
        {...input}
        frame={frame}
        wallEditing={{
          ...input.wallEditing,
          selectedId: source.id,
          edit: nextEdit,
          options: [
            {
              ref: source.appearance.assetRef,
              label: 'Ready',
              wallMatch: true,
              thumbnail: { status: 'ready', image: 'image' },
            },
          ],
        }}
      />
    );
    const previewClient = worldToClient(
      { x: -3, z: -2 },
      createLayoutTransform(bounds, frame, 12)
    )!;
    expect(Number(handle('start').getAttribute('cx'))).toBeCloseTo(
      previewClient.x - bounds.left
    );
    // Release at the same client pointer as last preview: frame changes cannot alter it.
    up({ x: 1, z: -2 });
    expect(nextEdit).not.toHaveBeenCalled();
    const candidate = vi.mocked(input.wallEditing.edit).mock.calls[0][0];
    expect(candidate.line.start).toEqual({ x: -3, z: -2 });
  });
  it.each([
    'escape',
    'right-click',
    'capture-loss',
    'cancel',
    'tool',
    'document',
    'epoch',
    'asset',
    'snap',
    'unmount',
  ] as const)(
    '%s retires a captured wall gesture without a late release',
    (reason) => {
      const input = walls({ onExitWallTool: vi.fn() });
      const { rerender, unmount } = render(<LayoutViewport {...input} />);
      const node = surface();
      down(node, { x: 0, z: 0 });
      move({ x: 2, z: 1 });
      if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
      if (reason === 'right-click') fireEvent.contextMenu(node);
      if (reason === 'capture-loss')
        fireEvent.lostPointerCapture(node, { pointerId: 7 });
      if (reason === 'cancel') fireEvent.pointerCancel(node, { pointerId: 7 });
      if (reason === 'tool')
        rerender(<LayoutViewport {...input} tool="select" />);
      if (reason === 'document')
        rerender(<LayoutViewport {...input} draft={{ ...input.draft }} />);
      if (reason === 'epoch')
        rerender(
          <LayoutViewport
            {...input}
            intentEpoch={2}
            wallEditing={{ ...input.wallEditing, create: vi.fn(() => true) }}
          />
        );
      if (reason === 'asset')
        rerender(
          <LayoutViewport
            {...input}
            wallEditing={{ ...input.wallEditing, assetRef: 'different' }}
          />
        );
      if (reason === 'snap')
        rerender(
          <LayoutViewport
            {...input}
            wallEditing={{ ...input.wallEditing, snapEnabled: true }}
          />
        );
      if (reason === 'unmount') unmount();
      fireEvent.pointerUp(node, { ...position({ x: 2, z: 1 }), pointerId: 7 });
      expect(input.wallEditing.create).not.toHaveBeenCalled();
      expect(input.onCommit).not.toHaveBeenCalled();
      expect(captures.size).toBe(0);
      expect(input.onExitWallTool).toHaveBeenCalledTimes(
        reason === 'escape' || reason === 'right-click' ? 1 : 0
      );
      expect(input.wallEditing.setAsset).not.toHaveBeenCalled();
    }
  );
  it('unavailable release geometry refuses instead of committing the last valid wall preview', () => {
    const input = walls();
    render(<LayoutViewport {...input} />);
    down(surface(), { x: 0, z: 0 });
    move({ x: 2, z: 1 });
    const releasePoint = position({ x: 2, z: 1 });
    bounds.width = 0;
    fireEvent.pointerUp(surface(), { ...releasePoint, pointerId: 7 });
    expect(input.wallEditing.create).not.toHaveBeenCalled();
    expect(input.wallEditing.reportRefusal).toHaveBeenCalledExactlyOnceWith(
      'Wall gesture unavailable: canvas geometry changed.'
    );
    expect(surface().querySelector('[data-wall-preview]')).toBeNull();
  });
  it('another pointer cannot replace/sample/finish/cancel the owner; primary right click exits Wall', () => {
    const input = walls({ onExitWallTool: vi.fn() });
    render(<LayoutViewport {...input} />);
    down(surface(), { x: 0, z: 0 });
    move({ x: 2, z: 1 });
    down(surface(), { x: 4, z: 3 }, 8);
    move({ x: 4, z: 3 }, 8);
    up({ x: 4, z: 3 }, 8);
    fireEvent.pointerCancel(surface(), { pointerId: 8 });
    fireEvent.lostPointerCapture(surface(), { pointerId: 8 });
    expect(input.wallEditing.create).not.toHaveBeenCalled();
    up({ x: 2, z: 1 });
    expect(input.wallEditing.create).toHaveBeenCalledExactlyOnceWith({
      start: { x: 0, z: 0 },
      end: { x: 2, z: 1 },
    });
    down(surface(), { x: 0, z: 0 }, 9);
    down(surface(), { x: 2, z: 1 }, 9, 2);
    up({ x: 2, z: 1 }, 9);
    expect(input.onExitWallTool).toHaveBeenCalledTimes(1);
    expect(input.wallEditing.create).toHaveBeenCalledTimes(1);
  });
  it('helper refusal/collapsed endpoint and owner-refused edit leave canonical wall untouched', () => {
    const input = walls({ tool: 'select' });
    const source = endpointWall(input);
    input.wallEditing = { ...input.wallEditing, selectedId: source.id };
    input.wallEditing.edit = vi.fn(() => false);
    const before = structuredClone(input.draft);
    render(<LayoutViewport {...input} />);
    down(handle('end'), source.line.end);
    move(source.line.start);
    up(source.line.start);
    expect(input.wallEditing.reportRefusal).toHaveBeenCalledWith(
      expect.stringContaining('endpoint radius')
    );
    expect(input.wallEditing.edit).not.toHaveBeenCalled();
    down(body(), { x: 5, z: 0 });
    move({ x: 5, z: 1 });
    up({ x: 5, z: 1 });
    up({ x: 5, z: 1 });
    expect(input.wallEditing.edit).toHaveBeenCalledTimes(1);
    expect(input.draft).toEqual(before);
    expect(surface().querySelector('[data-wall-feedback]')).toBeNull();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it.each(['Delete', 'Backspace'])(
    '%s deletes only selected walls from root canvas Select focus, never label controls or text',
    (key) => {
      const input = walls({ tool: 'select' });
      input.wallEditing = { ...input.wallEditing, selectedId: 'studio-wall' };
      const { rerender } = render(
        <>
          <input aria-label="outside text" />
          <textarea />
          <select />
          <div contentEditable />
          <LayoutViewport {...input} />
        </>
      );
      const canvas = surface();
      for (const target of [
        screen.getByLabelText('outside text'),
        document.querySelector('textarea')!,
        document.querySelector('select')!,
        document.querySelector('[contenteditable]')!,
        handle('end'),
      ])
        fireEvent.keyDown(target, { key });
      expect(input.wallEditing.remove).not.toHaveBeenCalled();
      fireEvent.keyDown(canvas, { key });
      expect(input.wallEditing.remove).toHaveBeenCalledExactlyOnceWith(
        'studio-wall'
      );
      rerender(<LayoutViewport {...input} tool="paint" />);
      fireEvent.keyDown(surface(), { key });
      expect(input.wallEditing.remove).toHaveBeenCalledTimes(1);
    }
  );
});

describe('explicit region gesture routing', () => {
  const region = {
    id: 'forest',
    labelId: 'forest-label',
    boundary: { kind: 'explicit' as const, cells: [{ q: 0, r: 0 }] },
  };
  function regionProps(
    overrides: Partial<LayoutViewportProps> = {}
  ): LayoutViewportProps {
    return props({
      tool: 'region',
      selectedRegion: region,
      regionTool: 'paint',
      regionEditing: {
        resolutions: [],
        createRoomLabel: vi.fn(),
        useEnclosingWalls: vi.fn(),
        removeRegionAndLabel: vi.fn(),
        setExplicitRegionArea: vi.fn(() => true),
      },
      ...overrides,
    });
  }
  it('stages membership only and releases one whole replacement; region hits never move labels or touch floor', () => {
    const input = regionProps();
    const create = vi.fn();
    const move = vi.fn();
    render(
      <LayoutViewport
        {...input}
        labelEditing={{
          active: false,
          selectedId: 'forest-label',
          placementText: null,
          onSelect: vi.fn(),
          onCreate: create,
          onMove: move,
          onCancel: vi.fn(),
        }}
      />
    );
    fireEvent.pointerDown(surface(), {
      ...at({ q: 1, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface(), { ...at({ q: 2, r: 0 }), pointerId: 1 });
    expect(input.regionEditing!.setExplicitRegionArea).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface(), {
      ...at({ q: 2, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    expect(
      input.regionEditing!.setExplicitRegionArea
    ).toHaveBeenCalledExactlyOnceWith('forest', [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(input.onCommit).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    'escape',
    'capture',
    'document',
    'target',
    'epoch',
    'mode',
  ] as const)('retires %s without region or floor writes', (retirement) => {
    const input = regionProps();
    const { rerender } = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), {
      ...at({ q: 1, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    if (retirement === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
    if (retirement === 'capture')
      fireEvent.lostPointerCapture(surface(), { pointerId: 1 });
    if (retirement === 'document')
      rerender(<LayoutViewport {...input} draft={{ ...input.draft }} />);
    if (retirement === 'target')
      rerender(<LayoutViewport {...input} selectedRegion={undefined} />);
    if (retirement === 'epoch')
      rerender(<LayoutViewport {...input} intentEpoch={2} />);
    if (retirement === 'mode')
      rerender(<LayoutViewport {...input} regionTool="erase" />);
    fireEvent.pointerUp(surface(), {
      ...at({ q: 2, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    expect(input.regionEditing!.setExplicitRegionArea).not.toHaveBeenCalled();
    expect(input.onCommit).not.toHaveBeenCalled();
  });
  it('erases only selected membership; rectangle sampling never falls through to floor', () => {
    const input = regionProps({ regionTool: 'erase' });
    const { rerender } = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), {
      ...at({ q: 0, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(surface(), {
      ...at({ q: 0, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    expect(input.regionEditing!.setExplicitRegionArea).toHaveBeenLastCalledWith(
      'forest',
      []
    );
    rerender(<LayoutViewport {...input} regionTool="rectangle" />);
    fireEvent.pointerDown(surface(), {
      ...at({ q: 0, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface(), { ...at({ q: 1, r: 0 }), pointerId: 1 });
    fireEvent.pointerUp(surface(), {
      ...at({ q: 1, r: 0 }),
      button: 0,
      pointerId: 1,
    });
    expect(input.regionEditing!.setExplicitRegionArea).toHaveBeenLastCalledWith(
      'forest',
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ]
    );
    expect(input.onCommit).not.toHaveBeenCalled();
  });
});

it('selecting a linked room label preserves the initiating drag when its region projection appears', () => {
  const draft = createPopulatedStudioDocument().draft;
  draft.scene.mapLabels = [
    { id: 'label', text: 'Room', location: { x: 0, z: 0 } },
  ];
  const move = vi.fn<(id: string, location: WorldPoint) => boolean>(() => true);
  function JoinedLabel(): React.JSX.Element {
    const [selected, select] = useState<string | null>(null);
    return (
      <LayoutViewport
        {...props({ draft, tool: 'select' })}
        selectedRegion={
          selected
            ? {
                id: 'region',
                labelId: 'label',
                boundary: { kind: 'automatic' },
              }
            : undefined
        }
        labelEditing={{
          active: false,
          selectedId: selected,
          placementText: null,
          onSelect: select,
          onCreate: vi.fn(),
          onMove: move,
          onCancel: vi.fn(),
        }}
      />
    );
  }
  render(<JoinedLabel />);
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Select map label Room' }),
    { ...position({ x: 0, z: 0 }), button: 0, pointerId: 1 }
  );
  fireEvent.pointerMove(surface(), {
    ...position({ x: 1, z: 0 }),
    pointerId: 1,
  });
  fireEvent.pointerUp(surface(), {
    ...position({ x: 1, z: 0 }),
    button: 0,
    pointerId: 1,
  });
  expect(move).toHaveBeenCalledOnce();
  expect(move.mock.calls[0][0]).toBe('label');
  expect(move.mock.calls[0][1].x).toBeCloseTo(1, 12);
});
