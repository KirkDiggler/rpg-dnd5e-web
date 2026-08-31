import { describe, expect, it } from 'vitest';
import {
  OFF_HAND_FIXTURES,
  resolveOffHandFixture,
} from './offHandAttachmentExperiment';

describe('off-hand attachment experiment', () => {
  it('defines exact production-backed fixture order', () => {
    expect(OFF_HAND_FIXTURES.map((row) => row.id)).toEqual([
      'empty',
      'shield-only',
      'longsword-shield',
      'shortsword-dagger',
    ]);
  });

  it('resolves exact main and off-hand production presentations', () => {
    expect(resolveOffHandFixture('empty')).toMatchObject({
      mainHand: { code: 'unarmed' },
      offHand: { code: 'empty-off-hand' },
    });
    expect(resolveOffHandFixture('longsword-shield')).toMatchObject({
      mainHand: { code: 'mapped', ref: 'dnd5e:item:longsword' },
      offHand: { code: 'mapped', ref: 'dnd5e:item:shield' },
    });
    expect(resolveOffHandFixture('shortsword-dagger')).toMatchObject({
      mainHand: { code: 'mapped', ref: 'dnd5e:item:shortsword' },
      offHand: { code: 'mapped', ref: 'dnd5e:item:dagger' },
    });
  });
});
