import * as THREE from 'three';
import type { SpatialBackgroundField } from './spatialBackgroundField';
import type { RenderablePointLight } from './visualPointLightSelection';

export type RegionLightingDiagnostic = {
  readonly reason:
    | 'field-build'
    | 'gpu-capacity'
    | 'unsupported-material'
    | 'unsupported-hook'
    | 'unsupported-transform'
    | 'shader-contract'
    | 'shader-compile';
  readonly message: string;
  readonly assetRef?: string;
  readonly materialType?: string;
};
export type RegionLightingUniforms = {
  rlTriangles: { value: THREE.DataTexture };
  rlHeads: { value: THREE.DataTexture };
  rlCandidates: { value: THREE.DataTexture };
  rlBounds: { value: THREE.Vector4 };
  rlGridSize: { value: number };
  rlPointPositions: { value: THREE.Vector4[] };
  rlPointColors: { value: THREE.Vector3[] };
  rlPointCount: { value: number };
};
export type RegionLightingMaterialBinding = {
  readonly uniforms: RegionLightingUniforms;
  reportDiagnostic(diagnostic: RegionLightingDiagnostic): void;
};
export const REGION_LIGHTING_SHADER_MARKER = 'STUDIO_REGION_LIGHTING_V1';

const fieldGLSL = /* glsl */ `
// STUDIO_REGION_LIGHTING_V1
varying vec3 rlWorldPosition;
uniform sampler2D rlTriangles;
uniform sampler2D rlHeads;
uniform sampler2D rlCandidates;
uniform vec4 rlBounds;
uniform float rlGridSize;
vec4 rlFetch(sampler2D data, int index) {
  int width = textureSize(data, 0).x;
  return texelFetch(data, ivec2(index % width, index / width), 0);
}
float rlCross(vec2 a, vec2 b) { return a.x*b.y - a.y*b.x; }
// x: background; y: explicitly configured (including authored 1).
vec2 rlSample(vec2 p) {
  if (p.x < rlBounds.x || p.x > rlBounds.y || p.y < rlBounds.z || p.y > rlBounds.w) return vec2(1.0,0.0);
  vec2 cell = clamp(floor((p-rlBounds.xz)/(rlBounds.yw-rlBounds.xz)*rlGridSize),vec2(0.0),vec2(rlGridSize-1.0));
  vec2 head = rlFetch(rlHeads,int(cell.y*rlGridSize+cell.x)).xy;
  vec2 result = vec2(1.0,0.0);
  for (int k=0; k<int(head.y); k++) {
    int ordinal = int(rlFetch(rlCandidates,int(head.x)+k).x);
    vec4 ab = rlFetch(rlTriangles,ordinal*2);
    vec4 cl = rlFetch(rlTriangles,ordinal*2+1);
    if (rlCross(ab.zw-ab.xy,p-ab.xy)>=0.0 && rlCross(cl.xy-ab.zw,p-ab.zw)>=0.0 && rlCross(ab.xy-cl.xy,p-cl.xy)>=0.0) {
      result.x = min(result.x,cl.z); result.y = 1.0;
    }
  }
  return result;
}
`;
const worldGLSL = /* glsl */ `
vec4 rlPosition = vec4(transformed,1.0);
#ifdef USE_BATCHING
  rlPosition = batchingMatrix * rlPosition;
#endif
#ifdef USE_INSTANCING
  rlPosition = instanceMatrix * rlPosition;
#endif
rlWorldPosition = (modelMatrix * rlPosition).xyz;
`;
const pointGLSL = /* glsl */ `
uniform vec4 rlPointPositions[12];
uniform vec3 rlPointColors[12];
uniform int rlPointCount;
vec3 rlFloorPoints() {
  vec3 result = vec3(0.0);
  for (int i=0;i<12;i++) {
    if(i>=rlPointCount) break;
    vec3 delta = rlPointPositions[i].xyz - rlWorldPosition;
    float d = length(delta);
    float attenuation = 1.0 / max(d*d,0.01);
    float range = rlPointPositions[i].w;
    if(range>0.0) attenuation *= pow(clamp(1.0-pow(d/range,4.0),0.0,1.0),2.0);
    result += rlPointColors[i] * attenuation * max(delta.y/max(d,0.000001),0.0) * (1.0/3.141592653589793);
  }
  return result;
}
`;
function replaceOnce(
  source: string,
  token: string,
  replacement: string
): string {
  if (source.split(token).length !== 2)
    throw new Error(`Region shader expected one ${token}`);
  return source.replace(token, replacement);
}

/** Checked against installed Three chunks, never patches point or emissive code. */
export function patchRegionLightingShader(
  vertexShader: string,
  fragmentShader: string,
  receiver: 'lit' | 'workspace-basic'
): { vertexShader: string; fragmentShader: string } {
  vertexShader =
    `// ${REGION_LIGHTING_SHADER_MARKER}\nvarying vec3 rlWorldPosition;\n` +
    replaceOnce(
      vertexShader,
      '#include <project_vertex>',
      worldGLSL + '\n#include <project_vertex>'
    );
  fragmentShader =
    fieldGLSL +
    (receiver === 'workspace-basic' ? pointGLSL : '') +
    fragmentShader;
  if (receiver === 'lit') {
    const directional =
      'getDirectionalLightInfo( directionalLight, directLight );';
    const begin = replaceOnce(
      THREE.ShaderChunk.lights_fragment_begin,
      directional,
      directional + '\n directLight.color *= rlSample(rlWorldPosition.xz).x;'
    );
    fragmentShader = replaceOnce(
      fragmentShader,
      '#include <lights_fragment_begin>',
      begin
    );
    fragmentShader = replaceOnce(
      fragmentShader,
      '#include <lights_fragment_end>',
      `
float rlBackground = rlSample(rlWorldPosition.xz).x;
#if defined(RE_IndirectDiffuse)
  irradiance *= rlBackground;
#endif
#if defined(RE_IndirectSpecular)
  iblIrradiance *= rlBackground;
  radiance *= rlBackground;
  clearcoatRadiance *= rlBackground;
#endif
#include <lights_fragment_end>`
    );
  } else {
    fragmentShader = replaceOnce(
      fragmentShader,
      '#include <opaque_fragment>',
      `
vec2 rlRegion = rlSample(rlWorldPosition.xz);
if(rlRegion.y>0.0) outgoingLight = outgoingLight * rlRegion.x + diffuseColor.rgb * rlFloorPoints();
#include <opaque_fragment>`
    );
  }
  return { vertexShader, fragmentShader };
}

export function cloneRegionLightingMaterial(
  source: THREE.Material,
  binding: RegionLightingMaterialBinding,
  receiver: 'lit' | 'workspace-basic',
  assetRef?: string
):
  | { status: 'ready'; material: THREE.Material }
  | { status: 'unsupported'; diagnostic: RegionLightingDiagnostic } {
  const refuse = (
    reason: RegionLightingDiagnostic['reason'],
    message: string
  ): { status: 'unsupported'; diagnostic: RegionLightingDiagnostic } => ({
    status: 'unsupported',
    diagnostic: { reason, message, assetRef, materialType: source.type },
  });
  if (
    source.onBeforeCompile.toString() !==
      THREE.Material.prototype.onBeforeCompile.toString() ||
    source.customProgramCacheKey.toString() !==
      THREE.Material.prototype.customProgramCacheKey.toString()
  )
    return refuse(
      'unsupported-hook',
      'Region lighting cannot compose an unknown material shader hook.'
    );
  const lit =
    (source as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  if (
    (receiver === 'lit' && !lit) ||
    (receiver === 'workspace-basic' &&
      !(source as THREE.MeshBasicMaterial).isMeshBasicMaterial)
  )
    return refuse(
      'unsupported-material',
      `Region lighting does not support ${source.type} as ${receiver}.`
    );
  try {
    const lib =
      receiver === 'lit' ? THREE.ShaderLib.physical : THREE.ShaderLib.basic;
    patchRegionLightingShader(lib.vertexShader, lib.fragmentShader, receiver);
  } catch (error) {
    return refuse('shader-contract', String(error));
  }
  const material = source.clone();
  const family = source.type;
  material.customProgramCacheKey = () =>
    `${REGION_LIGHTING_SHADER_MARKER}:${family}:${receiver}:${source.customProgramCacheKey()}`;
  material.onBeforeCompile = (shader) => {
    try {
      const patched = patchRegionLightingShader(
        shader.vertexShader,
        shader.fragmentShader,
        receiver
      );
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      Object.assign(shader.uniforms, binding.uniforms);
    } catch (error) {
      binding.reportDiagnostic({
        reason: 'shader-contract',
        message: String(error),
        assetRef,
        materialType: source.type,
      });
    }
  };
  return { status: 'ready', material };
}

export type RegionLightingFieldTextures = {
  triangles: THREE.DataTexture;
  heads: THREE.DataTexture;
  candidates: THREE.DataTexture;
  dispose(): void;
};
/** Checks capacity before allocating any upload; never truncates an index. */
export function createRegionLightingFieldTextures(
  field: SpatialBackgroundField,
  maxTextureSize: number
): RegionLightingFieldTextures {
  const packed = (data: Float32Array): THREE.DataTexture => {
    const count = Math.max(1, data.length / 4);
    const width = Math.min(maxTextureSize, Math.ceil(Math.sqrt(count))),
      height = Math.ceil(count / width);
    if (!(maxTextureSize >= 1) || height > maxTextureSize)
      throw new Error(
        `Region lighting texture capacity exceeded (${count} texels, max ${maxTextureSize}).`
      );
    const padded = new Float32Array(width * height * 4);
    padded.set(data);
    const texture = new THREE.DataTexture(
      padded,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
  const heads = new Float32Array(field.binHeads.length * 2);
  for (let i = 0; i < field.binHeads.length; i += 2) {
    heads[i * 2] = field.binHeads[i]!;
    heads[i * 2 + 1] = field.binHeads[i + 1]!;
  }
  const candidates = new Float32Array(field.candidates.length * 4);
  field.candidates.forEach((v, i) => {
    candidates[i * 4] = v;
  });
  for (const data of [field.triangles, heads, candidates]) {
    if (Math.max(1, data.length / 4) > maxTextureSize * maxTextureSize)
      throw new Error('Region lighting GPU texture capacity exceeded.');
  }
  const textures = {
    triangles: packed(field.triangles),
    heads: packed(heads),
    candidates: packed(candidates),
  };
  let disposed = false;
  return {
    ...textures,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      Object.values(textures).forEach((t) => t.dispose());
    },
  };
}

export function updateRegionLightingPoints(
  uniforms: RegionLightingUniforms,
  lights: readonly RenderablePointLight[]
): void {
  if (lights.length > 12)
    throw new Error(
      'Selected region point list exceeds the existing 12-light budget.'
    );
  uniforms.rlPointCount.value = lights.length;
  for (let i = 0; i < 12; i++) {
    const light = lights[i];
    if (light) {
      uniforms.rlPointPositions.value[i]!.set(
        ...light.position,
        light.distance
      );
      const color = new THREE.Color(light.color).multiplyScalar(
        light.intensity
      );
      uniforms.rlPointColors.value[i]!.set(color.r, color.g, color.b);
    } else {
      uniforms.rlPointPositions.value[i]!.set(0, 0, 0, 0);
      uniforms.rlPointColors.value[i]!.set(0, 0, 0);
    }
  }
}

/** CPU witness for the configured-only Basic receiver's linear local term. */
export function sampleRegionFloorPoints(
  uniforms: RegionLightingUniforms,
  position: THREE.Vector3
): THREE.Vector3 {
  const result = new THREE.Vector3();
  for (let i = 0; i < uniforms.rlPointCount.value; i++) {
    const p = uniforms.rlPointPositions.value[i]!,
      delta = new THREE.Vector3(p.x, p.y, p.z).sub(position),
      d = delta.length();
    const cutoff = p.w > 0 ? Math.max(1 - (d / p.w) ** 4, 0) ** 2 : 1;
    result.addScaledVector(
      uniforms.rlPointColors.value[i]!,
      ((cutoff / Math.max(d * d, 0.01)) *
        Math.max(delta.y / Math.max(d, 0.000001), 0)) /
        Math.PI
    );
  }
  return result;
}
