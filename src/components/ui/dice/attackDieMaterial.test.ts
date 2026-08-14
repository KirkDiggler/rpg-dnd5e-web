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
    const shader = {
      uniforms: {},
      vertexShader: '',
      fragmentShader: '#include <emissivemap_fragment>',
    };
    patched.body.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain('uniform float attackDieTime;');
    expect(shader.fragmentShader).toContain('sin(attackDieTime)');
  });
  it('uses supplied sidecar selectors and reports owned material readiness', () => {
    const body = {
      name: 'Body.010',
      clone: vi.fn(() => ({ name: 'clone', dispose: vi.fn() })),
    };
    const numeral = { name: 'Numbers.010' };
    const patched = patchAttackDieMaterials(
      [body, numeral] as never,
      'magical',
      false,
      { bodyMaterial: 'Body', numeralMaterial: 'Numbers' }
    );
    expect(patched.originalBody).toBe(body);
    expect(patched.numeral).toBe(numeral);
    expect(patched.owned).toBe(true);
  });
});

describe('magical animation time', () => {
  it('updates compiled shader only through explicit frame time and stays zero reduced', () => {
    const body = { name: 'Body.010', clone: vi.fn(() => ({ name: 'clone' })) };
    const numeral = { name: 'Numbers.010' };
    const animated = patchAttackDieMaterials(
      [body, numeral] as never,
      'magical',
      false,
      { bodyMaterial: 'Body', numeralMaterial: 'Numbers' }
    );
    const shader = {
      uniforms: {},
      vertexShader: '',
      fragmentShader: '#include <emissivemap_fragment>',
    };
    animated.body.onBeforeCompile(shader as never, {} as never);
    animated.setTime(3);
    expect(
      (shader.uniforms as { attackDieTime: { value: number } }).attackDieTime
        .value
    ).toBe(3);
    const reduced = patchAttackDieMaterials(
      [body, numeral] as never,
      'magical',
      true,
      { bodyMaterial: 'Body', numeralMaterial: 'Numbers' }
    );
    const reducedShader = {
      uniforms: {},
      vertexShader: '',
      fragmentShader: '#include <emissivemap_fragment>',
    };
    reduced.body.onBeforeCompile(reducedShader as never, {} as never);
    reduced.setTime(3);
    expect(
      (reducedShader.uniforms as { attackDieTime: { value: number } })
        .attackDieTime.value
    ).toBe(0);
  });
});
