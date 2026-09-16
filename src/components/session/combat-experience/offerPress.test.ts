import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { bindOfferPress, type OfferPressBinding } from './offerPress';
let root: HTMLDivElement,
  offer: HTMLDivElement,
  button: HTMLButtonElement,
  binding: OfferPressBinding;
let inspect: Mock<(id: string) => void>, choose: Mock<() => void>;
function pointer(
  type: string,
  values: Record<string, unknown> = {},
  target: EventTarget = button
) {
  target.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true }), {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
      ...values,
    })
  );
}
function click(target: HTMLElement = button) {
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  offer = document.createElement('div');
  button = document.createElement('button');
  offer.dataset.offerId = 'signed-current-id';
  offer.append(button);
  root.append(offer);
  document.body.append(root);
  inspect = vi.fn();
  choose = vi.fn();
  button.addEventListener('click', choose);
  binding = bindOfferPress(root, inspect);
});
afterEach(() => {
  binding.dispose();
  root.remove();
  vi.useRealTimers();
});
describe('touch offer inspection', () => {
  it('suppresses the native context menu only for a touch offer', () => {
    const contextMenu = () =>
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    pointer('pointerdown');
    expect(button.dispatchEvent(contextMenu())).toBe(false);
    expect(root.dispatchEvent(contextMenu())).toBe(true);
    pointer('pointerdown', { pointerType: 'mouse' });
    expect(button.dispatchEvent(contextMenu())).toBe(true);
    expect(inspect).not.toHaveBeenCalled();
  });
  it('allows a keyboard click without consuming the pending touch release guard', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(450);
    pointer('pointerup');
    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })
    );
    expect(choose).toHaveBeenCalledOnce();
    click();
    expect(choose).toHaveBeenCalledOnce();
  });
  it('leaves a short tap as an action', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(449);
    pointer('pointerup');
    click();
    expect(inspect).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledOnce();
  });
  it('holds for details without allowing the release click to choose', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(450);
    expect(inspect).toHaveBeenCalledWith('signed-current-id');
    pointer('pointerup');
    click();
    expect(choose).not.toHaveBeenCalled();
    pointer('pointerdown');
    pointer('pointerup');
    click();
    expect(choose).toHaveBeenCalledOnce();
  });
  it('suppresses release even when opening details removes the originating menu offer', () => {
    inspect.mockImplementation(() => offer.remove());
    const underlying = document.createElement('button');
    root.append(underlying);
    underlying.addEventListener('click', choose);
    pointer('pointerdown');
    vi.advanceTimersByTime(450);
    pointer('pointerup', {}, root);
    click(underlying);
    expect(choose).not.toHaveBeenCalled();
  });
  it.each(['move', 'cancel', 'blur', 'second finger', 'capture loss'])(
    'abandons a hold on %s',
    (kind) => {
      pointer('pointerdown');
      if (kind === 'move') pointer('pointermove', { clientX: 19 });
      if (kind === 'cancel') pointer('pointercancel');
      if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      if (kind === 'second finger')
        pointer('pointerdown', { pointerId: 2, isPrimary: false }, window);
      if (kind === 'capture loss') pointer('lostpointercapture');
      vi.advanceTimersByTime(500);
      pointer('pointerup');
      click();
      expect(inspect).not.toHaveBeenCalled();
      expect(choose).not.toHaveBeenCalled();
    }
  );
  it('does not inspect a withdrawn declaration or a disposed surface', () => {
    pointer('pointerdown');
    offer.remove();
    vi.advanceTimersByTime(500);
    expect(inspect).not.toHaveBeenCalled();
    root.append(offer);
    pointer('pointerdown');
    binding.dispose();
    vi.advanceTimersByTime(500);
    expect(inspect).not.toHaveBeenCalled();
  });
  it('does not schedule a mouse hold', () => {
    pointer('pointerdown', { pointerType: 'mouse' });
    vi.advanceTimersByTime(500);
    click();
    expect(inspect).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledOnce();
  });
});
