// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateClassOutfitColorReceipt } from './captureClassOutfitColorEvidence.mjs';

describe('class outfit color evidence receipt contract', () => {
  it('accepts an explicitly non-claiming pending receipt before the real game run', () => {
    expect(
      validateClassOutfitColorReceipt({
        issue: 912,
        status: 'pending-real-game-evidence',
      })
    ).toEqual({ status: 'pending' });
  });

  it('rejects a completed receipt that lacks normal-route screenshots and observations', () => {
    expect(() =>
      validateClassOutfitColorReceipt({
        status: 'captured',
        screenshots: [],
        observations: [],
        failures: 0,
      })
    ).toThrow(
      'Captured evidence requires real creation and session screenshots.'
    );
  });

  it('rejects fabricated observations hidden in a pending receipt', () => {
    expect(() =>
      validateClassOutfitColorReceipt({
        issue: 912,
        status: 'pending-real-game-evidence',
        observations: [{ kind: 'movement-visible' }],
      })
    ).toThrow('Pending evidence receipts cannot claim runtime observations.');
  });
});
