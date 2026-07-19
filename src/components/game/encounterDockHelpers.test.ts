import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  classLabel,
  hpTier,
  resolveMovementRemaining,
  resolveName,
} from './encounterDockHelpers';

describe('hpTier', () => {
  it('returns "high" above 50% HP', () => {
    expect(hpTier(11, 20)).toBe('high');
    expect(hpTier(20, 20)).toBe('high');
  });

  it('returns "mid" between 25% (exclusive) and 50% (inclusive) HP', () => {
    expect(hpTier(10, 20)).toBe('mid');
    expect(hpTier(6, 20)).toBe('mid');
  });

  it('returns "low" at or below 25% HP', () => {
    expect(hpTier(5, 20)).toBe('low');
    expect(hpTier(0, 20)).toBe('low');
  });

  it('returns "low" when max is zero or negative rather than dividing by zero', () => {
    expect(hpTier(0, 0)).toBe('low');
    expect(hpTier(5, -1)).toBe('low');
  });
});

describe('classLabel', () => {
  it('capitalizes the first letter of a class_ref id', () => {
    expect(classLabel('rogue')).toBe('Rogue');
    expect(classLabel('fighter')).toBe('Fighter');
  });

  it('returns null for undefined (no class label shown)', () => {
    expect(classLabel(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(classLabel('')).toBeNull();
  });
});

describe('resolveName', () => {
  it('prefers the server-given displayName when present', () => {
    expect(resolveName('Alice', 'char-alice')).toBe('Alice');
  });

  it('falls back to the raw entityId when displayName is undefined (rpg-api#664: real StartEncounter does not set display_name yet)', () => {
    expect(resolveName(undefined, 'char-alice')).toBe('char-alice');
  });

  it('falls back to the raw entityId when displayName is an empty string', () => {
    expect(resolveName('', 'char-alice')).toBe('char-alice');
  });

  it('falls back to an em dash when both displayName and entityId are empty', () => {
    expect(resolveName(undefined, '')).toBe('—');
  });
});

describe('resolveMovementRemaining', () => {
  it('returns the server-authored economy.movementRemaining in TURN_BASED (rpg-dnd5e-web#486)', () => {
    expect(
      resolveMovementRemaining(EncounterMode.TURN_BASED, {
        movementRemaining: 15,
      } as never)
    ).toBe(15);
  });

  it('returns 0 in TURN_BASED when turnState/economy has not arrived yet, never the old fabricated 30ft default', () => {
    expect(resolveMovementRemaining(EncounterMode.TURN_BASED, null)).toBe(0);
    expect(resolveMovementRemaining(EncounterMode.TURN_BASED, undefined)).toBe(
      0
    );
  });

  it('returns undefined in FREE_ROAM regardless of economy (HexGrid ignores the prop outside TURN_BASED per #485)', () => {
    expect(
      resolveMovementRemaining(EncounterMode.FREE_ROAM, {
        movementRemaining: 15,
      } as never)
    ).toBeUndefined();
  });

  it('returns undefined when mode is UNSPECIFIED', () => {
    expect(
      resolveMovementRemaining(EncounterMode.UNSPECIFIED, null)
    ).toBeUndefined();
  });
});
