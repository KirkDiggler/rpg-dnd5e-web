import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatPacingConcept } from './CombatPacingConcept';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CombatPacingConcept', () => {
  it('renders both placements side by side for the same scenario', () => {
    render(<CombatPacingConcept />);
    const stages = screen.getAllByTestId('beat-stage');
    expect(stages).toHaveLength(2);
    const placements = stages.map((s) => s.getAttribute('data-placement'));
    expect(placements).toContain('token-anchored');
    expect(placements).toContain('center-stage');
  });

  it('shows a throw-die button only while armed, for a self-role scenario', () => {
    render(<CombatPacingConcept />);
    // default scenario is player-hit (role: self) — cue is 150ms.
    expect(screen.queryByTestId('throw-die-button')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('throw-die-button')).toBeTruthy();
    fireEvent.click(screen.getByTestId('throw-die-button'));
    expect(screen.queryByTestId('throw-die-button')).toBeNull();
  });

  it('switching scenarios resets the sequencer to cue', () => {
    render(<CombatPacingConcept />);
    act(() => {
      vi.advanceTimersByTime(150); // player-hit reaches 'armed'
    });
    fireEvent.click(screen.getByTestId('scenario-button-npc-boss-swing'));
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('cue');
  });

  it('the instant pace override drives the sequencer straight to done', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('pace-override-instant'));
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('done');
  });

  it('a cinematic pace override progresses beyond cue (object-identity regression guard)', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('scenario-button-npc-grunt-swing')); // spectator, no armed wait
    fireEvent.click(screen.getByTestId('pace-override-cinematic'));
    act(() => {
      vi.advanceTimersByTime(150); // Cinematic cue, not stuck resetting at cue
    });
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('throw');
  });

  it('a brisk pace override progresses beyond cue too (object-identity regression guard)', () => {
    render(<CombatPacingConcept />); // default scenario player-hit, role: self
    fireEvent.click(screen.getByTestId('pace-override-brisk'));
    act(() => {
      vi.advanceTimersByTime(75); // Brisk cue
    });
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('armed'); // NOT stuck at 'cue'
  });

  it('toggling reduced motion while a cinematic override is active still progresses (compound regression guard)', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('pace-override-cinematic'));
    fireEvent.click(screen.getByTestId('reduced-motion-toggle'));
    act(() => {
      vi.advanceTimersByTime(150); // cue -> armed
    });
    fireEvent.click(screen.getByTestId('throw-die-button'));
    act(() => {
      vi.advanceTimersByTime(80); // REDUCED_MOTION_THROW_MS, not 600
    });
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('verdict');
  });

  it('the skip button advances the beat immediately', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('skip-button'));
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('verdict');
  });

  it('the event/intent inspector lists every fixture event with its sequence and correlationId', () => {
    render(<CombatPacingConcept />);
    const inspector = screen.getByTestId('event-inspector');
    // player-hit has 3 events: actionResolved, attackResolved, entityDamaged.
    expect(inspector.textContent).toContain('seq 1');
    expect(inspector.textContent).toContain('seq 2');
    expect(inspector.textContent).toContain('seq 3');
    expect(inspector.textContent).toContain('corr-hit');
  });

  it('the reduced-motion toggle is wired to both beat stages (no override active)', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('reduced-motion-toggle'));
    act(() => {
      vi.advanceTimersByTime(150); // cue -> armed
    });
    fireEvent.click(screen.getByTestId('throw-die-button'));
    act(() => {
      vi.advanceTimersByTime(80); // REDUCED_MOTION_THROW_MS, not 600
    });
    const stage = screen.getAllByTestId('beat-stage')[0];
    expect(stage.getAttribute('data-beat')).toBe('verdict');
  });

  it('every viewport-frame button is present, including the narrow fallback (design.md §8)', () => {
    render(<CombatPacingConcept />);
    expect(screen.getByTestId('frame-button-narrow')).toBeTruthy();
    expect(screen.getByTestId('frame-button-floor')).toBeTruthy();
    expect(screen.getByTestId('frame-button-typical')).toBeTruthy();
    expect(screen.getByTestId('frame-button-full')).toBeTruthy();
  });

  it('exactly one of the two side-by-side beat stages announces the verdict to assistive tech (no duplicate screen-reader announcement)', () => {
    render(<CombatPacingConcept />);
    // Skip jumps 'cue' straight to 'verdict' synchronously (see the
    // dedicated skip-button test above), so both stages render a
    // beat-verdict element without needing to advance fake timers.
    fireEvent.click(screen.getByTestId('skip-button'));
    const verdicts = screen.getAllByTestId('beat-verdict');
    expect(verdicts).toHaveLength(2);
    const announced = verdicts.filter(
      (v) => v.getAttribute('role') === 'status'
    );
    expect(announced).toHaveLength(1);
    // The one that announces must carry the full live-region contract,
    // not just `role` in isolation.
    expect(announced[0].getAttribute('aria-live')).toBe('polite');
    expect(announced[0].getAttribute('aria-atomic')).toBe('true');
  });
});
