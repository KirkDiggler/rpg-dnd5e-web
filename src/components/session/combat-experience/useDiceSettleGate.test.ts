import type { AttackDieTelemetry } from '@/components/ui/dice/AttackDie3D';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CombatExperienceAttackOutcome } from './types';
import {
  DICE_SETTLE_FALLBACK_MS,
  isDiceChoiceSettlementReady,
  useDiceSettleGate,
} from './useDiceSettleGate';

function outcome(attackId: string): CombatExperienceAttackOutcome {
  return {
    attackId,
    actor: 'Aldric',
    target: 'Skeleton Guard',
    action: 'Longsword',
    d20: 12,
    total: 17,
    against: 13,
    hit: true,
    critical: false,
    damage: 8,
    damageType: 'slashing',
    targetIsViewer: false,
  };
}

function telemetry(state: AttackDieTelemetry['state']): AttackDieTelemetry {
  return {
    presentationToken: 1,
    requestedResult: 12,
    renderer: '3d',
    state,
    exactTargetHeld: state === 'observed',
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Props = {
  result?: CombatExperienceAttackOutcome;
  diePresented: boolean;
};

function gate(initial: Props) {
  return renderHook((props: Props) => useDiceSettleGate(props), {
    initialProps: initial,
  });
}

describe('isDiceChoiceSettlementReady', () => {
  it('opens only for the exact settled presentation when a physical die is expected', () => {
    const input = {
      awaitsDiceSettlement: true,
      presentationId: 'presentation:current',
      activePresentationId: 'presentation:current',
      physicalPresentationAvailable: true,
      semanticFallback: false,
    } as const;

    expect(
      isDiceChoiceSettlementReady({
        ...input,
        settledPresentationId: undefined,
      })
    ).toBe(false);
    expect(
      isDiceChoiceSettlementReady({
        ...input,
        settledPresentationId: 'presentation:stale',
      })
    ).toBe(false);
    expect(
      isDiceChoiceSettlementReady({
        ...input,
        settledPresentationId: 'presentation:current',
      })
    ).toBe(true);
  });

  it('does not let an unrelated active presentation satisfy the gate', () => {
    expect(
      isDiceChoiceSettlementReady({
        awaitsDiceSettlement: true,
        presentationId: 'presentation:window',
        activePresentationId: 'presentation:other',
        settledPresentationId: 'presentation:window',
        physicalPresentationAvailable: true,
        semanticFallback: false,
      })
    ).toBe(false);
  });

  it('passes through catch-up and explicit non-physical fallbacks without a timer', () => {
    expect(
      isDiceChoiceSettlementReady({
        awaitsDiceSettlement: false,
        physicalPresentationAvailable: false,
        semanticFallback: false,
      })
    ).toBe(true);
    expect(
      isDiceChoiceSettlementReady({
        awaitsDiceSettlement: true,
        presentationId: 'presentation:fallback',
        physicalPresentationAvailable: false,
        semanticFallback: true,
      })
    ).toBe(true);
    expect(
      isDiceChoiceSettlementReady({
        awaitsDiceSettlement: true,
        presentationId: 'presentation:disabled',
        activePresentationId: 'presentation:disabled',
        physicalPresentationAvailable: false,
        semanticFallback: false,
      })
    ).toBe(true);
  });

  it('keeps an event-first live window closed until its presentation arrives', () => {
    expect(
      isDiceChoiceSettlementReady({
        awaitsDiceSettlement: true,
        physicalPresentationAvailable: true,
        semanticFallback: false,
      })
    ).toBe(false);
  });
});

describe('useDiceSettleGate', () => {
  it('withholds the outcome while the die is still tumbling', () => {
    const { result } = gate({ result: outcome('a'), diePresented: true });
    expect(result.current.settledResult).toBeUndefined();
  });

  it('releases it on the settlement observation', () => {
    const { result } = gate({ result: outcome('a'), diePresented: true });
    act(() => result.current.onDiceTelemetry(telemetry('observed')));
    expect(result.current.settledResult?.attackId).toBe('a');
  });

  it('ignores every state that is not a resting observation', () => {
    const { result } = gate({ result: outcome('a'), diePresented: true });
    for (const state of [
      'locked',
      'tumbling',
      'held',
      'failed',
      'disposed',
    ] as const) {
      act(() => result.current.onDiceTelemetry(telemetry(state)));
      expect(result.current.settledResult).toBeUndefined();
    }
    // ...and still releases when the real one arrives.
    act(() => result.current.onDiceTelemetry(telemetry('observed')));
    expect(result.current.settledResult?.attackId).toBe('a');
  });

  it('passes straight through when no die is being animated', () => {
    // A monster's swing settles 'auto' with nothing to watch; waiting for a
    // landing that will never happen would hang the outcome forever.
    const { result } = gate({ result: outcome('a'), diePresented: false });
    expect(result.current.settledResult?.attackId).toBe('a');
  });

  it('does not let one attack settlement release the NEXT attack early', () => {
    const { result, rerender } = gate({
      result: outcome('a'),
      diePresented: true,
    });
    act(() => result.current.onDiceTelemetry(telemetry('observed')));
    expect(result.current.settledResult?.attackId).toBe('a');

    // A second swing: its own die has not landed yet.
    rerender({ result: outcome('b'), diePresented: true });
    expect(result.current.settledResult).toBeUndefined();

    act(() => result.current.onDiceTelemetry(telemetry('observed')));
    expect(result.current.settledResult?.attackId).toBe('b');
  });

  it('releases anyway if no observation ever arrives', () => {
    // The SVG fallback renderer never observes a resting die. This is a net
    // for a renderer that cannot report, not the timing mechanism.
    const { result } = gate({ result: outcome('a'), diePresented: true });
    expect(result.current.settledResult).toBeUndefined();

    act(() => void vi.advanceTimersByTime(DICE_SETTLE_FALLBACK_MS + 1));
    expect(result.current.settledResult?.attackId).toBe('a');
  });

  it('gives a healthy 3D die room to win the race against its own net', () => {
    // The choreographed roll is 1900ms; the net must sit well clear of it.
    expect(DICE_SETTLE_FALLBACK_MS).toBeGreaterThan(1900);
  });

  it('has nothing to release when there is no outcome', () => {
    const { result } = gate({ result: undefined, diePresented: true });
    expect(result.current.settledResult).toBeUndefined();
  });
});
