import type { EntityDamaged } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';
import { renderToStaticMarkup } from 'react-dom/server';
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
  correlationId: 'corr-attack-7',
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

const damage = (amount = 7): EntityDamaged =>
  ({
    entityId: 'goblin-1',
    sourceEntityId: 'char-alice',
    amount,
    damageType: { module: 'dnd5e', type: 'damage', id: 'slashing' },
    damageBreakdown: [],
    hpAfter: { current: 13, max: 20, temp: 0 },
  }) as unknown as EntityDamaged;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => vi.useRealTimers());

describe('CombatPresentation', () => {
  it('keeps the authoritative roll out of initial static markup', () => {
    const markup = renderToStaticMarkup(
      <CombatPresentation item={item()} onComplete={() => {}} />
    );

    expect(markup).toContain('data-beat="idle"');
    expect(markup).not.toContain('>14<');
  });

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

  it('renders the server-sent damage result alongside the attack theater', () => {
    render(
      <CombatPresentation
        item={item()}
        damage={damage()}
        onComplete={() => {}}
      />
    );
    act(() => vi.advanceTimersByTime(CINEMATIC.cue));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(CINEMATIC.throw + CINEMATIC.verdict));
    expect(
      screen.getByTestId('combat-presentation-damage').textContent
    ).toContain('7 damage');
  });

  it('does not complete a newly swapped item until its own sequence finishes', () => {
    const complete = vi.fn();
    const firstItem = item();
    const secondItem = { ...item(), id: 8 };
    const { rerender } = render(
      <CombatPresentation item={firstItem} onComplete={complete} />
    );
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
    expect(complete).toHaveBeenCalledExactlyOnceWith(7);

    rerender(<CombatPresentation item={secondItem} onComplete={complete} />);

    expect(complete).toHaveBeenCalledExactlyOnceWith(7);
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
    expect(complete).toHaveBeenLastCalledWith(8);
  });

  it('completes an item only once when onComplete changes after done', () => {
    const initialComplete = vi.fn();
    const replacementComplete = vi.fn();
    const attack = item();
    const { rerender } = render(
      <CombatPresentation item={attack} onComplete={initialComplete} />
    );
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
    expect(initialComplete).toHaveBeenCalledExactlyOnceWith(7);

    rerender(
      <CombatPresentation item={attack} onComplete={replacementComplete} />
    );

    expect(replacementComplete).not.toHaveBeenCalled();
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
