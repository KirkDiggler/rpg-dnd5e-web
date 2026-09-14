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
function setup() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  canvas.style.touchAction = 'pan-y';
  const pan = vi.fn();
  const click = vi.fn();
  canvas.addEventListener('click', click);
  const dispose = bindTouchPan({ canvas, onPan: pan });
  cleanups.push(() => {
    dispose();
    canvas.remove();
  });
  return { canvas, pan, click, dispose };
}
function clickCanvas(canvas: HTMLCanvasElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

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
