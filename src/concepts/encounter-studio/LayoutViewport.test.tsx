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

  it('controlled rerenders retain gesture samples and use the latest callback and draft', () => {
    const input = props();
    const view = render(<LayoutViewport {...input} />);
    fireEvent.pointerDown(surface(), { ...at(zero), pointerId: 7 });
    const next = props({
      draft: {
        ...input.draft,
        room: { ...input.draft.room, walkableHexes: [{ q: 2, r: 0 }] },
      },
      frame: { center: { x: 2, z: -1 }, zoom: 2 },
    });
    view.rerender(<LayoutViewport {...next} />);
    expect(previewCells()).toEqual(['0,0']);
    expect(
      surface()
        .querySelector('[data-cell="2,0"]')!
        .getAttribute('data-walkable')
    ).toBe('true');
    fireEvent.pointerMove(surface(), { ...at(one, next.frame), pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(one, next.frame), pointerId: 7 });
    expect(input.onCommit).not.toHaveBeenCalled();
    expect(next.onCommit).toHaveBeenCalledExactlyOnceWith([zero, one], 'paint');
  });

  it('middle pan and anchored clamped wheel zoom never commit floor', () => {
    const onCommit = vi.fn(() => true);
    let latest = initialFrame;
    const onFrameChange = vi.fn();
    function Controlled(): React.JSX.Element {
      const [frame, setFrame] = useState(initialFrame);
      latest = frame;
      return (
        <LayoutViewport
          {...props()}
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
    const before = surface()
      .querySelector('[data-cell="0,0"]')!
      .getAttribute('points');
    bounds = { left: 170, top: 220, width: 600, height: 800 };
    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });
    expect(surface().getAttribute('viewBox')).toBe('0 0 600 800');
    expect(
      surface().querySelector('[data-cell="0,0"]')!.getAttribute('points')
    ).not.toBe(before);
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
