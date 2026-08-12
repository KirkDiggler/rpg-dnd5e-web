import type { Material } from 'three';
import type { AttackDieMaterialMode } from './attackDieContract';
import { normalizeSelectorName } from './attackDieContract';
type CompiledShader = Parameters<NonNullable<Material['onBeforeCompile']>>[0];
export interface AttackDieMaterialSelectors {
  bodyMaterial: string;
  numeralMaterial: string;
}
export function resolveAttackDieMaterials(
  materials: Material[],
  bodyName: string,
  numeralName: string
) {
  const body = materials.filter(
    (m) => normalizeSelectorName(m.name) === bodyName
  );
  const numeral = materials.filter(
    (m) => normalizeSelectorName(m.name) === numeralName
  );
  if (body.length !== 1 || numeral.length !== 1 || body[0] === numeral[0])
    throw Error('ambiguous attack die material selectors');
  return { body: body[0], numeral: numeral[0] };
}
export function patchAttackDieMaterials(
  materials: Material[],
  mode: AttackDieMaterialMode,
  reducedMotion: boolean,
  selectors: AttackDieMaterialSelectors = {
    bodyMaterial: 'D20_Lightning_Material',
    numeralMaterial: 'Paint_Material',
  }
) {
  const { body, numeral } = resolveAttackDieMaterials(
    materials,
    selectors.bodyMaterial,
    selectors.numeralMaterial
  );
  if (mode === 'raw')
    return { body, numeral, originalBody: body, shaderTime: 0, owned: false };
  const patched = body.clone();
  patched.onBeforeCompile = (shader: CompiledShader) => {
    shader.uniforms.attackDieTime = {
      value: reducedMotion ? 0 : performance.now() / 1000,
    };
    shader.fragmentShader =
      `uniform float attackDieTime;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.05, 0.12, 0.25) * (0.65 + 0.35 * sin(attackDieTime));'
      );
  };
  patched.customProgramCacheKey = () =>
    `attack-die-magical-v1-${reducedMotion ? 'static' : 'animated'}`;
  return {
    body: patched,
    numeral,
    originalBody: body,
    shaderTime: reducedMotion ? 0 : performance.now() / 1000,
    owned: true,
  };
}
