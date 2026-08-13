import type { AttackDieEvidenceTuple } from '../../components/ui/dice/attackDieContract';
export const ATTACK_DIE_VISUAL_CONFIG = Object.freeze({
  approval: 'unverified-provisional' as const,
  topCamera: {
    type: 'perspective' as const,
    fov: 35,
    near: 0.1,
    far: 100,
    position: [0, 4, 0] as const,
    target: [0, 0, 0] as const,
    up: [0, 0, -1] as const,
  },
  threeQuarterCamera: {
    type: 'perspective' as const,
    fov: 35,
    near: 0.1,
    far: 100,
    position: [3, 2.4, 3] as const,
    target: [0, 0, 0] as const,
    up: [0, 1, 0] as const,
  },
  viewportCss: [320, 320] as const,
  outputPixels: [640, 640] as const,
  devicePixelRatio: 2,
  dieScale: 0.75,
  toneMapping: 'ACESFilmic' as const,
  outputColorSpace: 'sRGB' as const,
  exposure: 1,
  environment: null,
  ambientIntensity: 0.65,
  keyLight: { position: [4, 6, 5] as const, intensity: 3 },
  fillLight: { position: [-4, 2, -3] as const, intensity: 1.2 },
  shaderRevision: 'attack-die-magical-v1',
  lightingRevision: 'attack-die-provisional-lighting-v1',
  environmentRevision: 'none',
  selectorRootRevision: 'source-mesh-primitive-roles-v1',
}) satisfies Readonly<Record<string, unknown>>;
export type AttackDieVisualConfig = typeof ATTACK_DIE_VISUAL_CONFIG;
export function tupleFromVisualConfig(input: {
  webCommit: string;
  glbSha256: string;
  materialMode: AttackDieEvidenceTuple['materialMode'];
}): Omit<AttackDieEvidenceTuple, 'contractCoreSha256' | 'webBuildSha256'> {
  const d = ATTACK_DIE_VISUAL_CONFIG;
  return {
    webCommit: input.webCommit,
    glbSha256: input.glbSha256,
    selectorRootRevision: d.selectorRootRevision,
    topCamera: d.topCamera,
    threeQuarterCamera: d.threeQuarterCamera,
    materialMode: input.materialMode,
    shaderRevision: d.shaderRevision,
    lightingRevision: d.lightingRevision,
    environmentRevision: d.environmentRevision,
    exposure: d.exposure,
    toneMapping: d.toneMapping,
    outputColorSpace: d.outputColorSpace,
    dieScale: d.dieScale,
    viewportCss: d.viewportCss,
    outputPixels: d.outputPixels,
    devicePixelRatio: d.devicePixelRatio,
    toleranceDegrees: 0.25,
  };
}
