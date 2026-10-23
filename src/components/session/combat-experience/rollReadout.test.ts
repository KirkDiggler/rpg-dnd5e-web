import { create } from '@bufbuild/protobuf';
import { RollSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { rollReadout } from './rollReadout';
describe('rollReadout', () => {
  it('shows a supplied face inline and compares supplied totals', () => {
    expect(
      rollReadout(
        create(RollSchema, {
          expression: '1d20 + 4',
          total: 13,
          against: 16,
          terms: [{ count: 1, dieSize: 20, faces: [9] }],
        })
      )
    ).toBe('1d20 (9) + 4 = 13 < 16');
  });
  it.each([
    [17, 16, '>'],
    [16, 16, '='],
    [0, 1, '<'],
  ])('compares %i to %i without judging success', (total, against, symbol) => {
    expect(
      rollReadout(
        create(RollSchema, {
          expression: '1d20',
          total,
          against,
          beaten: false,
        })
      )
    ).toBe(`1d20 = ${total} ${symbol} ${against}`);
  });
  it('does not reconstruct a missing face', () => {
    expect(
      rollReadout(
        create(RollSchema, { expression: '1d20 + 4', total: 13, against: 16 })
      )
    ).toBe('1d20 + 4 = 13 < 16');
  });
  it('supports a single legacy die face', () => {
    expect(
      rollReadout(
        create(RollSchema, { expression: '1d20 + 4', total: 13, dice: [9] })
      )
    ).toBe('1d20 (9) + 4 = 13');
  });
  it('keeps separate terms and supplied kept faces', () => {
    expect(
      rollReadout(
        create(RollSchema, {
          expression: '1d20 + 1d4 + 2',
          total: 15,
          terms: [
            { count: 1, dieSize: 20, faces: [10] },
            { count: 1, dieSize: 4, faces: [3] },
          ],
        })
      )
    ).toBe('1d20 (10) + 1d4 (3) + 2 = 15');
  });
  it('does not attach faces to an unmatched expression term', () => {
    expect(
      rollReadout(
        create(RollSchema, {
          expression: '1d20 + 4',
          total: 13,
          terms: [{ count: 1, dieSize: 4, faces: [2] }],
        })
      )
    ).toContain('1d4 [2]');
  });
});
