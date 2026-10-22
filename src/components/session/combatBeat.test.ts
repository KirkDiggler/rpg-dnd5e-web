// @vitest-environment node
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { damageTypeWord } from './combatBeat';

describe('damageTypeWord', () => {
  it('maps every named DamageType to its lowercase word', () => {
    expect(damageTypeWord(DamageType.SLASHING)).toBe('slashing');
    expect(damageTypeWord(DamageType.BLUDGEONING)).toBe('bludgeoning');
    expect(damageTypeWord(DamageType.NECROTIC)).toBe('necrotic');
  });

  it('empty string for unspecified/undefined — never a placeholder word', () => {
    expect(damageTypeWord(DamageType.UNSPECIFIED)).toBe('');
    expect(damageTypeWord(undefined)).toBe('');
  });
});
