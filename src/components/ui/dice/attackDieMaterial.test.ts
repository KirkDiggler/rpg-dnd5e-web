import { describe, expect, it, vi } from 'vitest';
import {
  patchAttackDieMaterials,
  resolveAttackDieMaterials,
} from './attackDieMaterial';
describe('attack die material', () => {
  it('requires unique normalized body and numeral selectors', () => {
    expect(() =>
      resolveAttackDieMaterials(
        [
          { name: 'D20_Lightning_Material.010' },
          { name: 'D20_Lightning_Material.011' },
          { name: 'Paint_Material.010' },
        ] as never,
        'D20_Lightning_Material',
        'Paint_Material'
      )
    ).toThrow();
  });
  it('patches only body and fixes magical time at zero for reduced motion', () => {
    const body = {
      name: 'D20_Lightning_Material.010',
      clone: vi.fn(() => ({ name: 'body-clone' })),
    };
    const numeral = { name: 'Paint_Material.010', clone: vi.fn() };
    const patched = patchAttackDieMaterials(
      [body, numeral] as never,
      'magical',
      true
    );
    expect(patched.body).not.toBe(body);
    expect(numeral.clone).not.toHaveBeenCalled();
    expect(patched.shaderTime).toBe(0);
  });
});
