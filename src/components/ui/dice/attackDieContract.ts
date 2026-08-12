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
    mesh: string;
    bodyMaterial: string;
    numeralMaterial: string;
    materialSlots: 2;
  };
  faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
  tuple: AttackDieEvidenceTuple;
  evidence: {
    machineRunSha256: string;
    humanReviewSha256: string;
    performanceSha256: string;
  } | null;
}
const hex = (x: unknown) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const plain = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).length === keys.length && keys.every((k) => k in x);
const stable = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(stable)
    : plain(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, stable(x[k])])
        )
      : x;
export function canonicalCoreJson(sidecar: Record<string, unknown>): string {
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
      !['candidate', 'verified'].includes(String(value.state))
    )
      throw Error('identity');
    if (!Array.isArray(value.faces) || value.faces.length !== 20)
      throw Error('faces');
    const seen = new Set<number>();
    for (const f of value.faces) {
      if (
        !plain(f) ||
        !exact(f, ['result', 'quaternion']) ||
        !Number.isInteger(f.result) ||
        Number(f.result) < 1 ||
        Number(f.result) > 20 ||
        seen.has(Number(f.result)) ||
        !Array.isArray(f.quaternion) ||
        f.quaternion.length !== 4 ||
        !f.quaternion.every(Number.isFinite)
      )
        throw Error('face');
      seen.add(Number(f.result));
      const n = Math.hypot(...(f.quaternion as number[]));
      if (!n || Math.abs(n - 1) > 1e-6) throw Error('quaternion');
    }
    if (
      value.state === 'verified' &&
      (!plain(value.evidence) ||
        !exact(value.evidence, [
          'machineRunSha256',
          'humanReviewSha256',
          'performanceSha256',
        ]) ||
        !Object.values(value.evidence).every(hex))
    )
      throw Error('evidence');
    if (
      options.verifyDigest !== false &&
      (await sha256Hex(canonicalCoreJson(value))) !== value.contractCoreSha256
    )
      throw Error('digest');
    return { ok: true, sidecar: value as unknown as AttackDieRuntimeSidecar };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'invalid' };
  }
}
