import { createHash } from 'node:crypto';
import {
  encodeFrozenBuildRecords,
  type FrozenBuildManifest,
} from './frozenBuildManifest';
export interface Settlement {
  requestedResult: number;
  renderer: '3d' | 'svg';
  angularErrorDegrees: number;
  exactTargetHeld: boolean;
  token: number;
}
const healthy = (
  value: Settlement | undefined,
  result: number,
  token: number
) =>
  !!value &&
  value.requestedResult === result &&
  value.token === token &&
  value.renderer === '3d' &&
  value.angularErrorDegrees <= 0.25 &&
  value.exactTargetHeld;
export async function observeHeldSettlement(
  result: number,
  previousToken: number,
  observe: () => Promise<Settlement | undefined>,
  nextFrame: () => Promise<void>
): Promise<Settlement> {
  const first = await observe();
  if (!first || first.token <= previousToken)
    throw Error('presentation token did not advance');
  if (!healthy(first, result, first.token))
    throw Error('healthy settlement mismatch');
  await nextFrame();
  const second = await observe();
  if (!second) throw Error('repeated held observation required');
  if (!healthy(second, result, first.token)) throw Error('hold regression');
  return second;
}
export interface EvidenceApi {
  currentToken(): Promise<number> | number;
  setResult(result: number): Promise<void> | void;
  settle(result: number, previousToken: number): Promise<Settlement>;
  setCamera(camera: 'top' | 'three-quarter'): Promise<void> | void;
  verifyHeld(settlement: Settlement): Promise<Settlement>;
  capture(
    result: number,
    camera: 'top' | 'three-quarter',
    settlement: Settlement
  ): Promise<void> | void;
}
export async function runEvidenceSequence(
  api: EvidenceApi,
  results = Array.from({ length: 20 }, (_, i) => i + 1)
) {
  const rows = [];
  for (const result of results) {
    const previous = await api.currentToken();
    await api.setResult(result);
    let held = await api.settle(result, previous);
    if (held.token <= previous)
      throw Error('presentation token did not advance');
    if (!healthy(held, result, held.token))
      throw Error('healthy 3D settlement mismatch');
    const settledToken = held.token;
    for (const camera of ['top', 'three-quarter'] as const) {
      await api.setCamera(camera);
      for (let observation = 0; observation < 2; observation++) {
        held = await api.verifyHeld(held);
        if (!healthy(held, result, settledToken))
          throw Error('camera hold token/result mismatch');
      }
      await api.capture(result, camera, held);
      rows.push({ result, camera, ...held });
    }
  }
  return rows;
}
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export function validateManifest(value: unknown): FrozenBuildManifest {
  if (!value || typeof value !== 'object') throw Error('manifest schema');
  const m = value as FrozenBuildManifest;
  if (
    Object.keys(m).sort().join(',') !==
      'files,kind,schemaVersion,webBuildSha256' ||
    m.schemaVersion !== 1 ||
    m.kind !== 'attack-die-web-build-manifest' ||
    !Array.isArray(m.files) ||
    !/^[0-9a-f]{64}$/.test(m.webBuildSha256)
  )
    throw Error('manifest schema');
  const seen = new Set<string>();
  for (const file of m.files) {
    if (
      !file ||
      typeof file !== 'object' ||
      Object.keys(file).sort().join(',') !== 'path,sha256,size' ||
      typeof file.path !== 'string' ||
      !file.path ||
      file.path === '.' ||
      file.path.startsWith('/') ||
      file.path.endsWith('/') ||
      file.path.includes('//') ||
      file.path.includes('\\') ||
      [...file.path].some((character) => {
        const code = character.charCodeAt(0);
        return (
          character === '?' || character === '#' || code < 32 || code === 127
        );
      }) ||
      file.path
        .split('/')
        .some((segment) => segment === '.' || segment === '..') ||
      seen.has(file.path) ||
      !Number.isInteger(file.size) ||
      file.size < 0 ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    )
      throw Error('manifest entry');
    seen.add(file.path);
  }
  const sorted = [...m.files].sort((a, b) =>
    Buffer.from(a.path).compare(Buffer.from(b.path))
  );
  if (JSON.stringify(sorted) !== JSON.stringify(m.files))
    throw Error('manifest path order');
  if (
    sha(new TextEncoder().encode(encodeFrozenBuildRecords(m.files))) !==
    m.webBuildSha256
  )
    throw Error('manifest root digest mismatch');
  return m;
}
export function assertSameManifest(
  local: FrozenBuildManifest,
  served: unknown
) {
  const checked = validateManifest(served);
  if (JSON.stringify(checked) !== JSON.stringify(local))
    throw Error('served manifest mismatch');
}
export async function validateServedBuild(
  manifestValue: unknown,
  get: (path: string) => Promise<Uint8Array>
) {
  const manifest = validateManifest(manifestValue);
  const listed = new Set(manifest.files.map((f) => f.path));
  let index = '';
  for (const file of manifest.files) {
    const bytes = await get(file.path);
    if (!bytes || bytes.byteLength !== file.size || sha(bytes) !== file.sha256)
      throw Error(`served build digest mismatch: ${file.path}`);
    if (file.path === 'index.html') index = new TextDecoder().decode(bytes);
  }
  for (const match of index.matchAll(/(?:src|href)=["']\/?([^"'#?]+)/g))
    if (!listed.has(match[1]))
      throw Error(`unlisted index reference: ${match[1]}`);
  return manifest;
}
export const FORCED_FAILURES = [
  'none',
  'load',
  'webgl',
  'shader',
  'context-loss',
  'hash',
  'invalid-result',
  'unmapped',
] as const;
export function parseForcedFailure(value: string) {
  if (!FORCED_FAILURES.includes(value as never))
    throw Error('unsupported --force value');
  return value as (typeof FORCED_FAILURES)[number];
}
export interface ForcedFallbackObservation extends Settlement {
  state?: string;
  failureReason?: string;
  semanticFallbackCount?: number;
}
const forcedReason = (force: string, reason: string) => {
  if (force === 'context-loss') return /context lost/i.test(reason);
  if (force === 'shader') return /shader/i.test(reason);
  if (force === 'invalid-result') return /invalid|1.+20/i.test(reason);
  if (force === 'unmapped') return /unmapped|mapping/i.test(reason);
  if (force === 'webgl') return /webgl/i.test(reason);
  if (force === 'hash') return /hash|digest/i.test(reason);
  if (force === 'load') return /load|runtime scene unavailable/i.test(reason);
  return false;
};
export function assertForcedFallback(
  force: string,
  observations: ForcedFallbackObservation[],
  expected?: { result: number; token: number }
) {
  if (force === 'none') return;
  if (observations.length < 2)
    throw Error('forced failure fail-closed repeated observations required');
  const reference = expected ?? {
    result: observations[0].requestedResult,
    token: observations[0].token,
  };
  if (
    observations.some(
      (o) =>
        o.renderer !== 'svg' ||
        o.exactTargetHeld ||
        o.requestedResult !== reference.result ||
        o.token !== reference.token ||
        o.state !== 'failed' ||
        o.semanticFallbackCount !== 1 ||
        !o.failureReason ||
        !forcedReason(force, o.failureReason)
    )
  )
    throw Error('forced failure must stay exact fail-closed semantic SVG');
}
