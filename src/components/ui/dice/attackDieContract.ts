export type AttackDieMaterialMode = 'raw' | 'magical';
export type QuaternionTuple = readonly [number, number, number, number];
export type Vector3Tuple = readonly [number, number, number];
export interface CameraContract {
  type: 'perspective';
  fov: number;
  near: number;
  far: number;
  position: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
}
export interface AttackDieEvidenceTuple {
  webCommit: string;
  webBuildSha256: string;
  glbSha256: string;
  contractCoreSha256: string;
  selectorRootRevision: string;
  topCamera: CameraContract;
  threeQuarterCamera: CameraContract;
  materialMode: AttackDieMaterialMode;
  shaderRevision: string;
  lightingRevision: string;
  environmentRevision: string;
  exposure: number;
  toneMapping: 'ACESFilmic';
  outputColorSpace: 'sRGB';
  dieScale: number;
  viewportCss: readonly [number, number];
  outputPixels: readonly [number, number];
  devicePixelRatio: number;
  toleranceDegrees: 0.25;
}
export interface AttackDieRuntimeSidecar {
  schemaVersion: 1;
  kind: 'attack-die-runtime-contract';
  state: 'candidate' | 'verified';
  contractCoreSha256: string;
  asset: {
    url: '/models/synty/props/SM_Prop_D20_Lightning_01.glb';
    sha256: string;
  };
  coordinates: {
    quaternionOrder: 'xyzw';
    handedness: 'right';
    upAxis: '+Y';
    rootCorrection: QuaternionTuple;
    normalizationEpsilon: 0.000001;
  };
  selectors: {
    blenderSuffixPattern: '\\.\\d{3}$';
    node: string;
    sourceMesh: string;
    bodyPrimitive: { mesh: string; material: string };
    numeralPrimitive: { mesh: string; material: string };
  };
  faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
  tuple: AttackDieEvidenceTuple;
  evidence: {
    machineRunSha256: string;
    humanReviewSha256: string;
    performanceSha256: string;
  } | null;
}
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && keys.every((k) => k in v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown) => finite(v) && v > 0;
const text = (v: unknown) => typeof v === 'string' && v.length > 0;
const hash = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const commit = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
const vector = (
  v: unknown,
  length: number,
  positiveOnly = false
): v is number[] =>
  Array.isArray(v) &&
  v.length === length &&
  v.every(positiveOnly ? positive : finite);
const quaternion = (v: unknown) =>
  vector(v, 4) && Math.abs(Math.hypot(...v) - 1) <= 1e-6;
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : plain(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])])
        )
      : v;
export function canonicalCoreJson(sidecar: Record<string, unknown>) {
  const tuple = { ...(sidecar.tuple as Record<string, unknown>) };
  delete tuple.contractCoreSha256;
  return JSON.stringify(
    stable({
      schemaVersion: sidecar.schemaVersion,
      kind: sidecar.kind,
      asset: sidecar.asset,
      coordinates: sidecar.coordinates,
      selectors: sidecar.selectors,
      faces: sidecar.faces,
      tuple,
    })
  );
}
export function normalizeSelectorName(name: string) {
  return name.replace(/\.\d{3}$/, '');
}
export async function sha256Hex(bytes: BufferSource | string) {
  const data =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function validCamera(v: unknown): v is CameraContract {
  return (
    plain(v) &&
    exact(v, ['type', 'fov', 'near', 'far', 'position', 'target', 'up']) &&
    v.type === 'perspective' &&
    positive(v.fov) &&
    Number(v.fov) < 180 &&
    positive(v.near) &&
    positive(v.far) &&
    Number(v.far) > Number(v.near) &&
    vector(v.position, 3) &&
    vector(v.target, 3) &&
    vector(v.up, 3) &&
    Math.hypot(...v.up) > 0
  );
}
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const child of Object.values(v)) deepFreeze(child);
    Object.freeze(v);
  }
  return v;
}
function validateNested(v: Record<string, unknown>) {
  if (
    !plain(v.asset) ||
    !exact(v.asset, ['url', 'sha256']) ||
    v.asset.url !== '/models/synty/props/SM_Prop_D20_Lightning_01.glb' ||
    !hash(v.asset.sha256)
  )
    throw Error('asset');
  if (
    !plain(v.coordinates) ||
    !exact(v.coordinates, [
      'quaternionOrder',
      'handedness',
      'upAxis',
      'rootCorrection',
      'normalizationEpsilon',
    ]) ||
    v.coordinates.quaternionOrder !== 'xyzw' ||
    v.coordinates.handedness !== 'right' ||
    v.coordinates.upAxis !== '+Y' ||
    v.coordinates.normalizationEpsilon !== 0.000001 ||
    !quaternion(v.coordinates.rootCorrection)
  )
    throw Error('coordinates');
  if (
    !plain(v.selectors) ||
    !exact(v.selectors, [
      'blenderSuffixPattern',
      'node',
      'sourceMesh',
      'bodyPrimitive',
      'numeralPrimitive',
    ]) ||
    v.selectors.blenderSuffixPattern !== '\\.\\d{3}$' ||
    !text(v.selectors.node) ||
    !text(v.selectors.sourceMesh) ||
    !plain(v.selectors.bodyPrimitive) ||
    !exact(v.selectors.bodyPrimitive, ['mesh', 'material']) ||
    !text(v.selectors.bodyPrimitive.mesh) ||
    !text(v.selectors.bodyPrimitive.material) ||
    !plain(v.selectors.numeralPrimitive) ||
    !exact(v.selectors.numeralPrimitive, ['mesh', 'material']) ||
    !text(v.selectors.numeralPrimitive.mesh) ||
    !text(v.selectors.numeralPrimitive.material) ||
    v.selectors.bodyPrimitive.mesh === v.selectors.numeralPrimitive.mesh ||
    v.selectors.bodyPrimitive.material === v.selectors.numeralPrimitive.material
  )
    throw Error('selectors');
  const t = v.tuple;
  if (
    !plain(t) ||
    !exact(t, [
      'webCommit',
      'webBuildSha256',
      'glbSha256',
      'contractCoreSha256',
      'selectorRootRevision',
      'topCamera',
      'threeQuarterCamera',
      'materialMode',
      'shaderRevision',
      'lightingRevision',
      'environmentRevision',
      'exposure',
      'toneMapping',
      'outputColorSpace',
      'dieScale',
      'viewportCss',
      'outputPixels',
      'devicePixelRatio',
      'toleranceDegrees',
    ]) ||
    !commit(t.webCommit) ||
    !hash(t.webBuildSha256) ||
    !hash(t.glbSha256) ||
    !hash(t.contractCoreSha256) ||
    t.glbSha256 !== v.asset.sha256 ||
    !text(t.selectorRootRevision) ||
    !validCamera(t.topCamera) ||
    !validCamera(t.threeQuarterCamera) ||
    !['raw', 'magical'].includes(String(t.materialMode)) ||
    !['shaderRevision', 'lightingRevision', 'environmentRevision'].every((k) =>
      text(t[k])
    ) ||
    !positive(t.exposure) ||
    t.toneMapping !== 'ACESFilmic' ||
    t.outputColorSpace !== 'sRGB' ||
    !positive(t.dieScale) ||
    !vector(t.viewportCss, 2, true) ||
    !vector(t.outputPixels, 2, true) ||
    !positive(t.devicePixelRatio) ||
    t.toleranceDegrees !== 0.25
  )
    throw Error('tuple');
}
export async function validateAttackDieSidecar(
  value: unknown,
  options: { verifyDigest?: boolean } = {}
): Promise<
  { ok: true; sidecar: AttackDieRuntimeSidecar } | { ok: false; reason: string }
> {
  try {
    if (
      !plain(value) ||
      !exact(value, [
        'schemaVersion',
        'kind',
        'state',
        'contractCoreSha256',
        'asset',
        'coordinates',
        'selectors',
        'faces',
        'tuple',
        'evidence',
      ])
    )
      throw Error('schema');
    if (
      value.schemaVersion !== 1 ||
      value.kind !== 'attack-die-runtime-contract' ||
      !['candidate', 'verified'].includes(String(value.state)) ||
      !hash(value.contractCoreSha256)
    )
      throw Error('identity');
    validateNested(value);
    if (!Array.isArray(value.faces) || value.faces.length !== 20)
      throw Error('faces');
    const seen = new Set<number>();
    for (const face of value.faces) {
      if (
        !plain(face) ||
        !exact(face, ['result', 'quaternion']) ||
        !Number.isInteger(face.result) ||
        Number(face.result) < 1 ||
        Number(face.result) > 20 ||
        seen.has(Number(face.result)) ||
        !quaternion(face.quaternion)
      )
        throw Error('face');
      seen.add(Number(face.result));
    }
    if (value.state === 'candidate' && value.evidence !== null)
      throw Error('evidence');
    if (
      value.state === 'verified' &&
      (!plain(value.evidence) ||
        !exact(value.evidence, [
          'machineRunSha256',
          'humanReviewSha256',
          'performanceSha256',
        ]) ||
        !Object.values(value.evidence).every(hash))
    )
      throw Error('evidence');
    if (
      (value.tuple as Record<string, unknown>).contractCoreSha256 !==
      value.contractCoreSha256
    )
      throw Error('tuple digest');
    if (
      options.verifyDigest !== false &&
      (await sha256Hex(canonicalCoreJson(value))) !== value.contractCoreSha256
    )
      throw Error('digest');
    return {
      ok: true,
      sidecar: deepFreeze(value as unknown as AttackDieRuntimeSidecar),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'invalid' };
  }
}
