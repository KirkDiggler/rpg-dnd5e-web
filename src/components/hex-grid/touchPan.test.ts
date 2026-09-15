import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindTouchPan } from './touchPan';

function pointer(
  target: EventTarget,
  type: string,
  x = 20,
  y = 20,
  id = 1,
  pointerType = 'touch'
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: pointerType },
  });
  target.dispatchEvent(event);
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});
function setup(withPinch = false, rotationEnabled = false) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  canvas.style.touchAction = 'pan-y';
  const pan = vi.fn();
  const pinch = vi.fn();
  const click = vi.fn();
  canvas.addEventListener('click', click);
  const dispose = bindTouchPan({
    canvas,
    onPan: pan,
    onPinch: withPinch ? pinch : undefined,
    rotationEnabled,
  });
  cleanups.push(() => {
    dispose();
    canvas.remove();
  });
  return { canvas, pan, pinch, click, dispose };
}
function clickCanvas(canvas: HTMLCanvasElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

describe('deliberate two-finger twist', () => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  function contact(
    canvas: HTMLCanvasElement,
    type: string,
    degrees: number,
    radius = 100,
    id = 2
  ) {
    pointer(
      canvas,
      type,
      200 + radius * Math.cos(radians(degrees)),
      200 + radius * Math.sin(radians(degrees)),
      id
    );
  }
  it('ignores angular pinch jitter, then applies only the deliberate excess without a jump', () => {
    const { canvas, pinch } = setup(true, true);
    pointer(canvas, 'pointerdown', 200, 200);
    contact(canvas, 'pointerdown', 0);
    contact(canvas, 'pointermove', 5, 130);
    expect(pinch.mock.lastCall![0].rotationRad).toBe(0);
    expect(pinch.mock.lastCall![0].scale).toBeCloseTo(1.3);
    contact(canvas, 'pointermove', 8.5, 130);
    expect(pinch.mock.lastCall![0].rotationRad).toBeCloseTo(radians(0.5));
    contact(canvas, 'pointermove', 20, 130);
    expect(
      pinch.mock.calls.reduce((sum, [change]) => sum + change.rotationRad, 0)
    ).toBeCloseTo(radians(12));
  });
  it('returns an out-and-back twist to its starting heading without a click', () => {
    const { canvas, pinch, click } = setup(true, true);
    pointer(canvas, 'pointerdown', 200, 200);
    contact(canvas, 'pointerdown', 0);
    contact(canvas, 'pointermove', 30);
    contact(canvas, 'pointermove', 0);
    expect(
      pinch.mock.calls.reduce((sum, [change]) => sum + change.rotationRad, 0)
    ).toBeCloseTo(0);
    pointer(canvas, 'pointerup', 200, 200);
    contact(canvas, 'pointerup', 0);
    clickCanvas(canvas);
    expect(click).not.toHaveBeenCalled();
  });
  it('crosses the angle wrap without a full-turn jump', () => {
    const { canvas, pinch } = setup(true, true);
    pointer(canvas, 'pointerdown', 200, 200);
    contact(canvas, 'pointerdown', 170);
    contact(canvas, 'pointermove', -170);
    expect(pinch.mock.lastCall![0].rotationRad).toBeCloseTo(radians(12));
  });
  it('gives a replacement second finger a fresh twist baseline', () => {
    const { canvas, pinch } = setup(true, true);
    pointer(canvas, 'pointerdown', 200, 200);
    contact(canvas, 'pointerdown', 0);
    contact(canvas, 'pointermove', 20);
    contact(canvas, 'pointerup', 20);
    contact(canvas, 'pointerdown', 90, 100, 3);
    contact(canvas, 'pointermove', 94, 100, 3);
    expect(pinch.mock.lastCall![0].rotationRad).toBe(0);
  });
});

describe('two-finger pinch', () => {
  it('reports relative scale and moving midpoint without panning or clicking', () => {
    const { canvas, pinch, pan, click } = setup(true);
    pointer(canvas, 'pointerdown', 20, 20);
    pointer(canvas, 'pointerdown', 80, 20, 2);
    pointer(canvas, 'pointermove', 10, 20);
    expect(pinch).toHaveBeenLastCalledWith({
      scale: 70 / 60,
      from: { x: 50, y: 20 },
      to: { x: 45, y: 20 },
    });
    pointer(canvas, 'pointermove', 90, 20, 2);
    expect(pinch).toHaveBeenLastCalledWith({
      scale: 80 / 70,
      from: { x: 45, y: 20 },
      to: { x: 50, y: 20 },
    });
    expect(pan).not.toHaveBeenCalled();
    pointer(canvas, 'pointerup', 10, 20);
    pointer(canvas, 'pointerup', 90, 20, 2);
    clickCanvas(canvas);
    expect(click).not.toHaveBeenCalled();
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointerup');
    clickCanvas(canvas);
    expect(click).toHaveBeenCalledOnce();
  });

  it('transitions from pan to pinch and back to the remaining finger without a jump', () => {
    const { canvas, pinch, pan, click } = setup(true);
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointermove', 40, 20);
    pointer(canvas, 'pointerdown', 80, 20, 2);
    pointer(canvas, 'pointermove', 100, 20, 2);
    expect(pinch).toHaveBeenLastCalledWith({
      scale: 1.5,
      from: { x: 60, y: 20 },
      to: { x: 70, y: 20 },
    });
    pointer(canvas, 'pointerup', 40, 20);
    pointer(canvas, 'pointermove', 103, 20, 2);
    expect(pan.mock.calls).toEqual([[{ dx: 20, dy: 0 }], [{ dx: 3, dy: 0 }]]);
    pointer(canvas, 'pointerup', 103, 20, 2);
    clickCanvas(canvas);
    expect(click).not.toHaveBeenCalled();
  });

  it('refuses a HUD-origin second finger and never promotes it into pinch', () => {
    const { canvas, pinch, pan, click } = setup(true);
    pointer(canvas, 'pointerdown');
    pointer(document.body, 'pointerdown', 80, 20, 2);
    pointer(canvas, 'pointermove', 5, 20);
    pointer(window, 'pointermove', 100, 20, 2);
    pointer(window, 'pointerup', 100, 20, 2);
    pointer(canvas, 'pointerup', 5, 20);
    clickCanvas(canvas);
    expect(pinch).not.toHaveBeenCalled();
    expect(pan).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it.each(['third finger', 'lostpointercapture', 'pointercancel', 'blur'])(
    'cancels pinch on %s until a fresh gesture',
    (reason) => {
      const { canvas, pinch, pan, click } = setup(true);
      pointer(canvas, 'pointerdown');
      pointer(canvas, 'pointerdown', 80, 20, 2);
      pointer(canvas, 'pointermove', 90, 20, 2);
      expect(pinch).toHaveBeenCalledOnce();
      if (reason === 'third finger') pointer(canvas, 'pointerdown', 100, 50, 3);
      else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else pointer(canvas, reason, 90, 20, 2);
      pointer(canvas, 'pointermove', 5, 20);
      pointer(canvas, 'pointermove', 110, 20, 2);
      pointer(canvas, 'pointerup', 5, 20);
      pointer(canvas, 'pointerup', 110, 20, 2);
      if (reason === 'third finger') pointer(canvas, 'pointerup', 100, 50, 3);
      clickCanvas(canvas);
      expect(pinch).toHaveBeenCalledOnce();
      expect(pan).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    }
  );

  it('rebases nearly coincident fingers instead of dividing by zero', () => {
    const { canvas, pinch } = setup(true);
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointerdown', 20, 20, 2);
    pointer(canvas, 'pointermove', 40, 20, 2);
    expect(pinch).not.toHaveBeenCalled();
    pointer(canvas, 'pointermove', 60, 20, 2);
    expect(pinch).toHaveBeenCalledWith({
      scale: 2,
      from: { x: 30, y: 20 },
      to: { x: 40, y: 20 },
    });
  });
});

describe('one-finger touch pan', () => {
  it('leaves taps and small jitter to the existing map click handler', () => {
    const { canvas, pan, click } = setup();
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointermove', 23, 24);
    pointer(canvas, 'pointerup', 23, 24);
    expect(clickCanvas(canvas).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
    expect(pan).not.toHaveBeenCalled();
  });

  it('pans after the threshold, blocks release-click, then permits a fresh tap', () => {
    const { canvas, pan, click } = setup();
    pointer(canvas, 'pointerdown');
    pointer(window, 'pointermove', 40, 30);
    expect(pan).toHaveBeenCalledWith({ dx: 20, dy: 10 });
    pointer(window, 'pointerup', 40, 30);
    expect(clickCanvas(canvas).defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointerup');
    clickCanvas(canvas);
    expect(click).toHaveBeenCalledOnce();
  });

  it('keeps an out-and-back drag classified as a drag', () => {
    const { canvas, pan, click } = setup();
    pointer(canvas, 'pointerdown');
    pointer(canvas, 'pointermove', 50, 20);
    pointer(canvas, 'pointermove', 20, 20);
    pointer(canvas, 'pointerup');
    clickCanvas(canvas);
    expect(pan.mock.calls).toEqual([[{ dx: 30, dy: 0 }], [{ dx: -30, dy: 0 }]]);
    expect(click).not.toHaveBeenCalled();
  });

  it('does not select after a distant release even when a move event was missed', () => {
    const { canvas, click } = setup();
    pointer(canvas, 'pointerdown');
    pointer(window, 'pointerup', -40, 20);
    clickCanvas(canvas);
    expect(click).not.toHaveBeenCalled();
  });

  it('abandons a gesture when a second finger arrives, including outside the canvas', () => {
    const { canvas, pan, click } = setup();
    pointer(canvas, 'pointerdown');
    pointer(document.body, 'pointerdown', 80, 80, 2);
    pointer(canvas, 'pointermove', 50, 20);
    pointer(document.body, 'pointerup', 80, 80, 2);
    pointer(canvas, 'pointermove', 60, 20);
    pointer(canvas, 'pointerup', 60, 20);
    clickCanvas(canvas);
    expect(pan).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur'])(
    'does not resume or select after %s',
    (event) => {
      const { canvas, pan, click } = setup();
      pointer(canvas, 'pointerdown');
      pointer(canvas, 'pointermove', 40, 20);
      if (event === 'blur') window.dispatchEvent(new Event('blur'));
      else pointer(canvas, event, 40, 20);
      pointer(canvas, 'pointermove', 60, 20);
      pointer(canvas, 'pointerup', 60, 20);
      clickCanvas(canvas);
      expect(pan).toHaveBeenCalledOnce();
      expect(click).not.toHaveBeenCalled();
    }
  );

  it('leaves HUD touches and mouse input alone', () => {
    const { canvas, pan, click } = setup();
    const button = document.createElement('button');
    document.body.append(button);
    cleanups.push(() => button.remove());
    const choose = vi.fn();
    button.addEventListener('click', choose);
    pointer(button, 'pointerdown');
    pointer(button, 'pointermove', 40, 20);
    pointer(button, 'pointerup', 40, 20);
    button.click();
    pointer(canvas, 'pointerdown', 20, 20, 4, 'mouse');
    pointer(canvas, 'pointermove', 60, 20, 4, 'mouse');
    pointer(canvas, 'pointerup', 60, 20, 4, 'mouse');
    clickCanvas(canvas);
    expect(choose).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(pan).not.toHaveBeenCalled();
  });

  it('cleans up active tracking and restores the canvas touch policy', () => {
    const { canvas, pan, click, dispose } = setup();
    expect(canvas.style.touchAction).toBe('none');
    pointer(canvas, 'pointerdown');
    dispose();
    pointer(window, 'pointermove', 60, 20);
    pointer(window, 'pointerup', 60, 20);
    clickCanvas(canvas);
    expect(pan).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(canvas.style.touchAction).toBe('pan-y');
  });
});
