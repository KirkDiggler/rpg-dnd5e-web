import { act, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceTray, type DiceTrayProps } from './DiceTray';

type DiceTrayHasNoPresentationRandom =
  'presentationRandom' extends keyof DiceTrayProps ? false : true;
const diceTrayHasNoPresentationRandom: DiceTrayHasNoPresentationRandom = true;
void diceTrayHasNoPresentationRandom;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DiceTray', () => {
  it.each(['entering', 'ready', 'rolling', 'exiting'] as const)(
    'does not expose the final face in its initial %s render before effects',
    (phase) => {
      const markup = renderToStaticMarkup(
        <DiceTray phase={phase} finalFace={14} outcome="HIT" />
      );

      expect(markup).not.toContain('>14<');
      expect(markup).toContain('>?<');
    }
  );

  it('renders a recognizable faceted d20 with responsive SVG sizing', () => {
    render(<DiceTray phase="ready" finalFace={14} outcome="HIT" />);
    const die = screen.getByTestId('d20-die');
    expect(screen.getByTestId('d20-silhouette').getAttribute('stroke')).toBe(
      'currentColor'
    );
    expect(screen.getAllByTestId('d20-facet').length).toBeGreaterThanOrEqual(4);
    expect(die.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(die.hasAttribute('width')).toBe(false);
    expect(die.hasAttribute('height')).toBe(false);
    expect(die.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the final face secret before settled and reveals the supplied face only at settlement', () => {
    const { rerender } = render(
      <DiceTray phase="ready" finalFace={14} outcome="HIT" />
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    rerender(<DiceTray phase="rolling" finalFace={14} outcome="HIT" />);
    act(() => vi.runAllTimers());
    expect(screen.getByTestId('dice-face').textContent).not.toBe('14');
    rerender(<DiceTray phase="settled" finalFace={14} outcome="HIT" />);
    expect(screen.getByTestId('dice-face').textContent).toBe('14');
  });

  it('retains its settled face while exiting', () => {
    const { rerender } = render(
      <DiceTray phase="settled" finalFace={14} outcome="HIT" />
    );

    expect(screen.getByTestId('dice-face').textContent).toBe('14');
    rerender(<DiceTray phase="exiting" finalFace={14} outcome="HIT" />);

    expect(screen.getByTestId('dice-face').textContent).toBe('14');
  });

  it('varies the near-settle decoy without revealing the final face', () => {
    const motion = {
      faceCount: 2,
      initialCadenceMs: 20,
      decelerationMs: 10,
      nearSettleHoldMs: 30,
      rolloverMs: 40,
    };
    const firstGetRandomValues = vi.fn((values: Uint32Array) => {
      values[0] = 0;
      return values;
    });
    const secondGetRandomValues = vi.fn((values: Uint32Array) => {
      values[0] = 0xffffffff;
      return values;
    });
    const firstRollFaces: string[] = [];
    const secondRollFaces: string[] = [];

    vi.stubGlobal('crypto', { getRandomValues: firstGetRandomValues });
    const firstRoll = render(
      <DiceTray phase="rolling" finalFace={14} outcome="HIT" motion={motion} />
    );
    firstRollFaces.push(screen.getByTestId('dice-face').textContent ?? '');
    act(() => vi.advanceTimersByTime(30));
    firstRollFaces.push(screen.getByTestId('dice-face').textContent ?? '');
    act(() => vi.advanceTimersByTime(40));
    const firstDecoy = screen.getByTestId('dice-face').textContent;
    firstRollFaces.push(firstDecoy ?? '');
    firstRoll.unmount();

    vi.stubGlobal('crypto', { getRandomValues: secondGetRandomValues });
    render(
      <DiceTray phase="rolling" finalFace={14} outcome="HIT" motion={motion} />
    );
    secondRollFaces.push(screen.getByTestId('dice-face').textContent ?? '');
    act(() => vi.advanceTimersByTime(30));
    secondRollFaces.push(screen.getByTestId('dice-face').textContent ?? '');
    act(() => vi.advanceTimersByTime(40));
    const secondDecoy = screen.getByTestId('dice-face').textContent;
    secondRollFaces.push(secondDecoy ?? '');
    const firstDecoyValue = Number.parseInt(firstDecoy ?? '', 10);
    const secondDecoyValue = Number.parseInt(secondDecoy ?? '', 10);

    expect(firstDecoy).not.toBe(secondDecoy);
    expect(firstDecoyValue).toBeGreaterThanOrEqual(1);
    expect(firstDecoyValue).toBeLessThanOrEqual(20);
    expect(secondDecoyValue).toBeGreaterThanOrEqual(1);
    expect(secondDecoyValue).toBeLessThanOrEqual(20);
    expect(firstDecoyValue).not.toBe(14);
    expect(secondDecoyValue).not.toBe(14);
    expect(firstRollFaces).not.toContain('14');
    expect(secondRollFaces).not.toContain('14');
    expect(firstGetRandomValues).toHaveBeenCalled();
    expect(secondGetRandomValues).toHaveBeenCalled();
  });

  it('uses crypto presentation randomness without consuming Math.random', () => {
    const getRandomValues = vi.fn((values: Uint32Array) => {
      values[0] = 0;
      return values;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const resultRandom = vi.spyOn(Math, 'random').mockReturnValue(0.7);

    render(<DiceTray phase="rolling" finalFace={14} outcome="HIT" />);

    expect(getRandomValues).toHaveBeenCalled();
    expect(resultRandom).not.toHaveBeenCalled();
  });

  it('does not consume Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const resultRandom = vi.spyOn(Math, 'random').mockReturnValue(0.7);

    render(<DiceTray phase="rolling" finalFace={14} outcome="HIT" />);

    expect(resultRandom).not.toHaveBeenCalled();
  });

  it('bounds a huge presentation face count to a finite timer schedule', () => {
    const schedule = vi.spyOn(globalThis, 'setTimeout');

    render(
      <DiceTray
        phase="rolling"
        finalFace={14}
        outcome="HIT"
        motion={{ faceCount: 10_000 }}
      />
    );

    expect(schedule).toHaveBeenCalledTimes(21);
  });

  it('animates only the d20 shell while keeping the face readable', () => {
    const { rerender } = render(
      <DiceTray phase="rolling" finalFace={9} outcome="HIT" />
    );
    const die = screen.getByTestId('d20-die');
    const shell = screen.getByTestId('d20-shell');
    const face = screen.getByTestId('dice-face');

    expect(die.getAttribute('class')).not.toContain('dice-tray__die--rolling');
    expect(die.getAttribute('class')).not.toContain('d20-die--tumbling');
    expect(shell.getAttribute('class')).toContain('dice-tray__die--rolling');
    expect(shell.getAttribute('class')).toContain('d20-die--tumbling');
    expect(shell.contains(face)).toBe(false);

    rerender(
      <DiceTray phase="rolling" finalFace={9} outcome="HIT" reducedMotion />
    );
    expect(screen.getByTestId('d20-shell').getAttribute('class')).not.toContain(
      'dice-tray__die--rolling'
    );
    expect(screen.getByTestId('d20-shell').getAttribute('class')).not.toContain(
      'd20-die--tumbling'
    );
  });

  it('uses upper-center for routine outcomes and center-stage for frame breaks', () => {
    const { rerender } = render(
      <DiceTray phase="ready" finalFace={14} outcome="HIT" />
    );
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--upper-center'
    );
    rerender(<DiceTray phase="settled" finalFace={1} outcome="NAT-1" />);
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--center-stage'
    );
  });

  it('consumes every timing motion dial before completing the rolling presentation', () => {
    const complete = vi.fn();
    render(
      <DiceTray
        phase="rolling"
        finalFace={14}
        outcome="HIT"
        onPresentationComplete={complete}
        motion={{
          faceCount: 2,
          initialCadenceMs: 20,
          decelerationMs: 10,
          nearSettleHoldMs: 30,
          rolloverMs: 40,
        }}
      />
    );

    act(() => vi.advanceTimersByTime(139));
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(complete).toHaveBeenCalledOnce();
  });

  it('uses the exit phase while retaining a static reduced-motion tray', () => {
    const { rerender } = render(
      <DiceTray phase="exiting" finalFace={14} outcome="HIT" />
    );
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--exiting'
    );
    rerender(
      <DiceTray phase="exiting" finalFace={14} outcome="HIT" reducedMotion />
    );
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--reduced-motion'
    );
  });
});
