import { MeshStandardMaterial, type Material } from 'three';
import type { AttackDieMaterialMode } from './attackDieContract';
import { normalizeSelectorName } from './attackDieContract';
type CompiledShader = Parameters<NonNullable<Material['onBeforeCompile']>>[0];
export interface AttackDieMaterialSelectors {
  bodyMaterial: string;
  numeralMaterial: string;
}

export interface DiceMaterialTreatment {
  readonly bodyColor: string;
  readonly numeralColor: string;
  readonly roughness: number;
  readonly metalness: number;
}

function validMaterialTreatment(treatment: DiceMaterialTreatment) {
  return (
    typeof treatment.bodyColor === 'string' &&
    treatment.bodyColor.trim().length > 0 &&
    typeof treatment.numeralColor === 'string' &&
    treatment.numeralColor.trim().length > 0 &&
    Number.isFinite(treatment.roughness) &&
    treatment.roughness >= 0 &&
    treatment.roughness <= 1 &&
    Number.isFinite(treatment.metalness) &&
    treatment.metalness >= 0 &&
    treatment.metalness <= 1
  );
}

export function createMaterialFreeDiceMaterials(
  treatment: DiceMaterialTreatment,
  sourceMaterial?: Material
) {
  if (!validMaterialTreatment(treatment))
    throw Error('invalid material-free dice treatment');

  const treatedClone = (color: string, name: string) => {
    const material =
      sourceMaterial instanceof MeshStandardMaterial
        ? sourceMaterial.clone()
        : new MeshStandardMaterial();
    material.color.set(color);
    material.roughness = treatment.roughness;
    material.metalness = treatment.metalness;
    material.name = name;
    material.needsUpdate = true;
    return material;
  };
  return {
    body: treatedClone(treatment.bodyColor, 'attack-die-runtime-body'),
    numeral: treatedClone(treatment.numeralColor, 'attack-die-runtime-numeral'),
  };
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
    return {
      body,
      numeral,
      originalBody: body,
      shaderTime: 0,
      owned: false,
      setTime: () => undefined,
    };
  const patched = body.clone();
  let compiled: CompiledShader | undefined;
  patched.onBeforeCompile = (shader: CompiledShader) => {
    compiled = shader;
    shader.uniforms.attackDieTime = {
      value: 0,
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
    shaderTime: 0,
    owned: true,
    setTime(time: number) {
      if (compiled)
        compiled.uniforms.attackDieTime.value = reducedMotion ? 0 : time;
    },
  };
}
