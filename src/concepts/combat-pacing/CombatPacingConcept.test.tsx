import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatPacingConcept } from './CombatPacingConcept';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('CombatPacingConcept', () => {
  it('does not expose an attack roll during the initial idle render', () => {
    const markup = renderToStaticMarkup(<CombatPacingConcept />);

    expect(markup).not.toContain('>14<');
  });

  it('uses one shared tray and one BeatStage rather than side-by-side die presentations', () => {
    render(<CombatPacingConcept />);
    expect(screen.getAllByTestId('dice-tray')).toHaveLength(1);
    expect(screen.getAllByTestId('beat-stage')).toHaveLength(1);
  });

  it('shows a Roll d20 button only while armed for the player scenario', () => {
    render(<CombatPacingConcept />);
    expect(screen.queryByTestId('throw-die-button')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('throw-die-button').textContent).toContain(
      'Roll d20'
    );
    fireEvent.click(screen.getByTestId('throw-die-button'));
    expect(screen.queryByTestId('throw-die-button')).toBeNull();
  });

  it('settles the player hit face at verdict and keeps it through impact and release', () => {
    render(<CombatPacingConcept />);

    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByTestId('throw-die-button'));
    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'verdict'
    );
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--settled'
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('14');

    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'impact'
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('14');

    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'release'
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('14');
  });

  it.each([
    ['player-crit', '20', 'CRIT'],
    ['player-nat1', '1', 'NAT-1'],
  ])(
    'keeps %s routine until its verdict reveals the authoritative %s result',
    (scenarioId, finalFace, label) => {
      render(<CombatPacingConcept />);
      fireEvent.click(screen.getByTestId(`scenario-button-${scenarioId}`));

      const expectRoutinePresentation = (rolling = false) => {
        expect(screen.getByTestId('dice-tray').className).toContain(
          'dice-tray--upper-center'
        );
        expect(screen.getByTestId('dice-tray').className).not.toContain(
          'dice-tray--center-stage'
        );
        expect(screen.getByTestId('beat-stage').dataset.placement).toBe(
          'token-anchored'
        );
        expect(screen.queryByTestId('beat-verdict')).toBeNull();
        if (rolling) {
          expect(screen.getByTestId('dice-face').textContent).not.toBe(
            finalFace
          );
        } else {
          expect(screen.getByTestId('dice-face').textContent).toBe('?');
        }
      };

      expectRoutinePresentation();
      act(() => vi.advanceTimersByTime(300));
      expectRoutinePresentation();

      fireEvent.click(screen.getByTestId('throw-die-button'));
      expectRoutinePresentation(true);

      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByTestId('beat-stage').dataset.placement).toBe(
        'center-stage'
      );
      expect(screen.getByTestId('dice-tray').className).toContain(
        'dice-tray--center-stage'
      );
      expect(screen.getByTestId('dice-face').textContent).toBe(finalFace);
      expect(screen.getByTestId('beat-verdict').textContent).toContain(label);
    }
  );

  it('switching scenarios resets the sequencer to cue', () => {
    render(<CombatPacingConcept />);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByTestId('scenario-button-npc-boss-swing'));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'cue'
    );
  });

  it('the instant pace override persists the new scenario outcome with one announcement', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('pace-override-instant'));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'done'
    );
    expect(screen.getByTestId('beat-verdict').textContent).toContain('HIT');
    expect(screen.getByTestId('beat-impact').textContent).toBe('SOLID');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('scenario-button-player-crit'));
    expect(screen.getByTestId('beat-verdict').textContent).toContain('CRIT');
    expect(screen.getByTestId('beat-impact').textContent).toBe('DEVASTATING');
    expect(screen.getByTestId('dice-face').textContent).toBe('20');
    expect(screen.queryByText('-14')).toBeNull();
  });

  it('a cinematic and brisk pace override progress beyond cue', () => {
    const { unmount } = render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('scenario-button-npc-grunt-swing'));
    fireEvent.click(screen.getByTestId('pace-override-cinematic'));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'throw'
    );
    unmount();
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('pace-override-brisk'));
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'armed'
    );
  });

  it('reduced motion still advances after a player throw', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('reduced-motion-toggle'));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByTestId('throw-die-button'));
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'verdict'
    );
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--reduced-motion'
    );
  });

  it('skip advances immediately to the one announced verdict', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('skip-button'));
    expect(screen.getByTestId('beat-stage').getAttribute('data-beat')).toBe(
      'verdict'
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('keeps one tray across repeated groups and releases the delayed concept log', () => {
    render(<CombatPacingConcept />);
    fireEvent.click(screen.getByTestId('scenario-button-repeated-attacks'));
    const tray = screen.getByTestId('dice-tray');
    expect(screen.queryByTestId('concept-log-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('skip-button'));
    fireEvent.click(screen.getByTestId('skip-button'));
    expect(screen.getByTestId('dice-tray')).toBe(tray);
    expect(screen.getByTestId('concept-log-preview').textContent).toContain(
      'corr-rep-1'
    );
  });

  it('retains every viewport frame control including narrow fallback', () => {
    render(<CombatPacingConcept />);
    expect(screen.getByTestId('frame-button-narrow')).toBeTruthy();
    expect(screen.getByTestId('frame-button-floor')).toBeTruthy();
    expect(screen.getByTestId('frame-button-typical')).toBeTruthy();
    expect(screen.getByTestId('frame-button-full')).toBeTruthy();
  });

  it('exposes constrained tuning dials with visible values and passes visual dials as CSS variables', () => {
    const { container } = render(<CombatPacingConcept />);
    const concept = container.querySelector(
      '.combat-pacing-concept'
    ) as HTMLElement;

    for (const [dial, label] of [
      ['face-count', 'Face count'],
      ['initial-cadence', 'Initial cadence'],
      ['deceleration', 'Deceleration'],
      ['near-settle-hold', 'Near-settle hold'],
      ['rollover', 'Rollover'],
      ['impact-scale', 'Impact scale'],
      ['shake-strength', 'Shake strength'],
      ['shake-duration', 'Shake duration'],
      ['color-strength', 'Color strength'],
      ['crit-shake-multiplier', 'Crit shake multiplier'],
    ]) {
      expect(screen.getByTestId(`dial-value-${dial}`).textContent).not.toBe('');
      expect(screen.getByLabelText(label).getAttribute('type')).toBe('range');
    }

    fireEvent.change(screen.getByLabelText(/impact scale/i), {
      target: { value: '1.5' },
    });
    fireEvent.change(screen.getByLabelText(/shake strength/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/shake duration/i), {
      target: { value: '450' },
    });
    fireEvent.change(screen.getByLabelText(/color strength/i), {
      target: { value: '1.4' },
    });
    fireEvent.change(screen.getByLabelText(/crit shake multiplier/i), {
      target: { value: '2.5' },
    });

    expect(concept.style.getPropertyValue('--concept-impact-scale')).toBe(
      '1.5'
    );
    expect(concept.style.getPropertyValue('--concept-shake-strength')).toBe(
      '2'
    );
    expect(concept.style.getPropertyValue('--concept-shake-duration')).toBe(
      '450ms'
    );
    expect(concept.style.getPropertyValue('--concept-color-strength')).toBe(
      '1.4'
    );
    expect(
      concept.style.getPropertyValue('--concept-crit-shake-multiplier')
    ).toBe('2.5');
  });

  it('shows Kirk-reviewed combat pacing defaults and restores them after tuning', () => {
    render(<CombatPacingConcept />);

    const acceptedDefaults = {
      'face-count': '8',
      'initial-cadence': '60ms',
      deceleration: '100ms',
      'near-settle-hold': '520ms',
      rollover: '260ms',
      'impact-scale': '1x',
      'shake-strength': '1x',
      'shake-duration': '300ms',
      'color-strength': '1x',
      'crit-shake-multiplier': '1.5x',
    };

    for (const [dial, value] of Object.entries(acceptedDefaults)) {
      expect(screen.getByTestId(`dial-value-${dial}`).textContent).toBe(value);
    }

    for (const [label, value] of [
      ['Face count', '4'],
      ['Initial cadence', '120'],
      ['Deceleration', '80'],
      ['Near-settle hold', '240'],
      ['Rollover', '120'],
      ['Impact scale', '1.5'],
      ['Shake strength', '2'],
      ['Shake duration', '450'],
      ['Color strength', '1.4'],
      ['Crit shake multiplier', '2.5'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    fireEvent.click(screen.getByText('Reset defaults'));

    for (const [dial, value] of Object.entries(acceptedDefaults)) {
      expect(screen.getByTestId(`dial-value-${dial}`).textContent).toBe(value);
    }
  });

  it('changes the constrained review surface when a viewport frame is selected', () => {
    render(<CombatPacingConcept />);
    const surface = screen.getByTestId('concept-review-surface');
    expect(surface.style.width).toBe('1024px');
    fireEvent.click(screen.getByTestId('frame-button-narrow'));
    expect(surface.style.width).toBe('480px');
    expect(surface.style.minHeight).toBe('320px');
  });

  it('keeps the fixture event inspector visible', () => {
    render(<CombatPacingConcept />);
    const inspector = screen.getByTestId('event-inspector');
    expect(inspector.textContent).toContain('seq 1');
    expect(inspector.textContent).toContain('seq 2');
    expect(inspector.textContent).toContain('seq 3');
    expect(inspector.textContent).toContain('corr-hit');
  });

  it('provides styling hooks for compact dials and distinct timing panels', () => {
    const { container } = render(<CombatPacingConcept />);

    expect(container.querySelector('.concept-dials__control')).toBeTruthy();
    expect(screen.getByTestId('event-inspector').className).toContain(
      'concept-event-inspector'
    );
    fireEvent.click(screen.getByTestId('scenario-button-repeated-attacks'));
    fireEvent.click(screen.getByTestId('skip-button'));
    fireEvent.click(screen.getByTestId('skip-button'));
    expect(screen.getByTestId('concept-log-preview').className).toContain(
      'concept-narrative-preview'
    );
  });
});
