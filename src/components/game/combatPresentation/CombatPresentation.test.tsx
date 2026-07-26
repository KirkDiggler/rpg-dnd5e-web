import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CombatPresentation,
  type CombatPresentationAttack,
} from './CombatPresentation';
import { AUTO_THROW_TIMEOUT_MS, CINEMATIC } from './useBeatSequencer';

vi.mock('framer-motion', () => ({ useReducedMotion: vi.fn() }));

const item = (
  overrides: Partial<CombatPresentationAttack['attack']> = {}
): CombatPresentationAttack => ({
  id: 7,
  isViewerAttack: true,
  attack: {
    attackerEntityId: 'char-alice',
    targetEntityId: 'goblin-1',
    attackRoll: 14,
    attackBonus: 5,
    targetAc: 16,
    hit: true,
    critical: false,
    ...overrides,
  } as CombatPresentationAttack['attack'],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => vi.useRealTimers());

describe('CombatPresentation', () => {
  it('arms a viewer attack, throws on tap, and completes its stable item id', () => {
    const complete = vi.fn();
    render(<CombatPresentation item={item()} onComplete={complete} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() =>
      vi.advanceTimersByTime(
        CINEMATIC.throw +
          CINEMATIC.verdict +
          CINEMATIC.impact +
          CINEMATIC.release
      )
    );
    expect(complete).toHaveBeenCalledWith(7);
  });

  it('auto-throws after the existing timeout', () => {
    render(<CombatPresentation item={item()} onComplete={() => {}} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue + AUTO_THROW_TIMEOUT_MS));
    expect(
      screen.getByTestId('combat-presentation').getAttribute('data-beat')
    ).toBe('throw');
  });

  it('autoplays and completes a non-viewer miss with no throw control and one MISS status', () => {
    const complete = vi.fn();
    render(
      <CombatPresentation
        item={{
          ...item({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 }),
          isViewerAttack: false,
        }}
        onComplete={complete}
      />
    );
    act(() => vi.advanceTimersByTime(CINEMATIC.cue + CINEMATIC.throw));
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('MISS');
    act(() => vi.advanceTimersByTime(CINEMATIC.verdict + CINEMATIC.release));
    expect(complete).toHaveBeenCalledWith(7);
  });

  it.each([
    [{ critical: true, attackRoll: 20 }, 'CRIT'],
    [{ hit: false, critical: false, attackRoll: 1 }, 'NAT-1'],
  ])(
    'renders the existing resolved %s outcome without new metadata',
    (overrides, label) => {
      render(
        <CombatPresentation item={item(overrides)} onComplete={() => {}} />
      );
      act(() => vi.advanceTimersByTime(CINEMATIC.cue));
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      act(() => vi.advanceTimersByTime(CINEMATIC.throw));
      expect(screen.getByRole('status').textContent).toContain(label);
    }
  );

  it('uses the system reduced-motion preference for the live tray and throw', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(<CombatPresentation item={item()} onComplete={() => {}} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    expect(screen.getByTestId('dice-tray').className).toContain(
      'dice-tray--reduced-motion'
    );
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByRole('status').textContent).toContain('HIT');
  });
});
