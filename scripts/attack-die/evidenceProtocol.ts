import { createHash } from 'node:crypto';
export interface Settlement {
  requestedResult: number;
  renderer: '3d' | 'svg';
  angularErrorDegrees: number;
  exactTargetHeld: boolean;
  token: number;
}
export interface EvidenceApi {
  setResult(result: number): Promise<void> | void;
  settle(result: number): Promise<Settlement>;
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
    await api.setResult(result);
    const settled = await api.settle(result);
    if (settled.requestedResult !== result)
      throw Error('settlement result mismatch');
    if (
      settled.renderer !== '3d' ||
      settled.angularErrorDegrees > 0.25 ||
      !settled.exactTargetHeld
    )
      throw Error('healthy 3D exact settlement required');
    for (const camera of ['top', 'three-quarter'] as const) {
      await api.capture(result, camera, settled);
      rows.push({ result, camera, ...settled });
    }
  }
  return rows;
}
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export async function validateServedBuild(
  manifest: { files: Array<{ path: string; size: number; sha256: string }> },
  get: (path: string) => Promise<Uint8Array>
) {
  const listed = new Set(manifest.files.map((file) => file.path));
  let index = '';
  for (const file of manifest.files) {
    if (file.path.startsWith('/') || file.path.split('/').includes('..'))
      throw Error('unsafe manifest path');
    const bytes = await get(file.path);
    if (!bytes || bytes.byteLength !== file.size || sha(bytes) !== file.sha256)
      throw Error(`served build digest mismatch: ${file.path}`);
    if (file.path === 'index.html') index = new TextDecoder().decode(bytes);
  }
  for (const match of index.matchAll(/(?:src|href)=["']\/?([^"'#?]+)/g))
    if (!listed.has(match[1]))
      throw Error(`unlisted index reference: ${match[1]}`);
}
