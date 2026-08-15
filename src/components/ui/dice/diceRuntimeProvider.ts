import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  parseDiceRuntimeManifest,
  type DiceRuntimeManifest,
  type DiceRuntimePreset,
} from './diceRuntimeManifest';

export interface RuntimeMeshBinding {
  readonly objectNode: string;
  readonly meshDefinition: string;
  readonly meshDefinitionIndex: number;
}

export interface DiceRuntimePresetSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'failed';
  readonly preset?: DiceRuntimePreset;
  readonly scene?: Object3D;
  readonly binding?: RuntimeMeshBinding;
  readonly failureReason?: string;
}

const MANIFEST_URL = '/models/custom-dice/dice-tray-presets.json';
const RUNTIME_MODEL_ROOT = '/models/custom-dice';
const ORIGINAL_CARVED_D20_PRESET_ID = 'dice.original.carved.d20';
const ALLOWLIST = new Set([ORIGINAL_CARVED_D20_PRESET_ID]);
const IDLE_SNAPSHOT: DiceRuntimePresetSnapshot = Object.freeze({
  status: 'idle',
});

type ParsedGltf = Awaited<ReturnType<GLTFLoader['parseAsync']>>;

interface PresetCacheEntry {
  snapshot: DiceRuntimePresetSnapshot;
  owner: Promise<void>;
}

let manifestOwner: Promise<DiceRuntimeManifest> | undefined;
let validatedManifest: DiceRuntimeManifest | undefined;
const requestOwners = new Map<string, Promise<void>>();
const requestSnapshots = new Map<string, DiceRuntimePresetSnapshot>();
const presetCacheKeys = new Map<string, string>();
const presetCache = new Map<string, PresetCacheEntry>();

function failureReason(error: unknown) {
  return error instanceof Error ? error.message : 'dice runtime failure';
}

function failedSnapshot(
  reason: string,
  preset?: DiceRuntimePreset
): DiceRuntimePresetSnapshot {
  return Object.freeze({
    status: 'failed',
    ...(preset ? { preset } : {}),
    failureReason: reason,
  });
}

function checkedResponse(
  response: Response,
  label: 'manifest' | 'model'
): Response {
  if (!response.ok) throw Error(`${label} fetch failed`);
  return response;
}

async function fetchManifest(): Promise<DiceRuntimeManifest> {
  let response: Response;
  try {
    response = checkedResponse(await fetch(MANIFEST_URL), 'manifest');
  } catch (error) {
    throw Error(`manifest fetch failed: ${failureReason(error)}`);
  }

  let value: unknown;
  try {
    const bytes = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw Error(`manifest JSON failed: ${failureReason(error)}`);
  }

  const result = parseDiceRuntimeManifest(value);
  if (!result.ok) throw Error(`manifest validation failed: ${result.reason}`);
  validatedManifest = result.manifest;
  return validatedManifest;
}

function getManifest(): Promise<DiceRuntimeManifest> {
  manifestOwner ??= fetchManifest();
  return manifestOwner;
}

function selectOriginalCarvedD20(
  manifest: DiceRuntimeManifest,
  presetId: string
): DiceRuntimePreset {
  const preset = manifest.presets.find(
    (candidate) => candidate.presetId === presetId
  );
  if (!preset) throw Error('allowlisted runtime preset is missing');
  if (
    preset.presetId !== ORIGINAL_CARVED_D20_PRESET_ID ||
    preset.familyId !== 'dice.original.carved' ||
    preset.dieKind !== 'd20' ||
    preset.model.selectors.kind !== 'single-mesh' ||
    preset.model.geometry.kind !== 'single-mesh-triangle-groups'
  )
    throw Error('allowlisted runtime preset is not the carved d20 contract');
  return preset;
}

async function fetchModelBytes(
  preset: DiceRuntimePreset
): Promise<ArrayBuffer> {
  const modelUrl = `${RUNTIME_MODEL_ROOT}/${preset.model.path}`;
  let response: Response;
  try {
    response = checkedResponse(await fetch(modelUrl), 'model');
  } catch (error) {
    throw Error(`model fetch failed: ${failureReason(error)}`);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw Error(`model bytes failed: ${failureReason(error)}`);
  }
  if (bytes.byteLength !== preset.model.sizeBytes)
    throw Error('model byte size mismatch');

  const digestBytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes)
  );
  const digest = [...digestBytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (digest !== preset.model.sha256) throw Error('model hash mismatch');
  return bytes;
}

function parseGltf(bytes: ArrayBuffer): Promise<ParsedGltf> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, '', resolve, reject);
  });
}

function meshBindingFailure(): never {
  throw Error('runtime mesh binding failed');
}

function prepareSingleMeshBinding(
  preset: DiceRuntimePreset,
  gltf: ParsedGltf
): RuntimeMeshBinding {
  if (preset.model.selectors.kind !== 'single-mesh')
    return meshBindingFailure();
  const { objectNode, meshDefinition } = preset.model.selectors;

  try {
    const parser = gltf.parser as unknown as { json?: unknown };
    if (!parser || parser.json === null || typeof parser.json !== 'object')
      return meshBindingFailure();
    const json = parser.json as { nodes?: unknown; meshes?: unknown };
    if (!Array.isArray(json.nodes) || !Array.isArray(json.meshes))
      return meshBindingFailure();

    const matchingNodes = json.nodes.filter(
      (candidate): candidate is { name: string; mesh?: unknown } =>
        candidate !== null &&
        typeof candidate === 'object' &&
        (candidate as { name?: unknown }).name === objectNode
    );
    if (matchingNodes.length !== 1) return meshBindingFailure();
    if (!Number.isSafeInteger(matchingNodes[0].mesh))
      return meshBindingFailure();
    const meshDefinitionIndex = Number(matchingNodes[0].mesh);
    if (meshDefinitionIndex < 0 || meshDefinitionIndex >= json.meshes.length)
      return meshBindingFailure();
    const mesh = json.meshes[meshDefinitionIndex];
    if (
      mesh === null ||
      typeof mesh !== 'object' ||
      (mesh as { name?: unknown }).name !== meshDefinition
    )
      return meshBindingFailure();
    if (!gltf.scene.getObjectByName(objectNode)) return meshBindingFailure();

    return Object.freeze({
      objectNode,
      meshDefinition,
      meshDefinitionIndex,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'runtime mesh binding failed'
    )
      throw error;
    return meshBindingFailure();
  }
}

async function loadPresetEntry(
  entry: PresetCacheEntry,
  preset: DiceRuntimePreset
): Promise<void> {
  try {
    const bytes = await fetchModelBytes(preset);
    const gltf = await parseGltf(bytes);
    const binding = prepareSingleMeshBinding(preset, gltf);
    entry.snapshot = Object.freeze({
      status: 'ready',
      preset,
      scene: gltf.scene,
      binding,
    });
  } catch (error) {
    const reason = failureReason(error);
    entry.snapshot = failedSnapshot(reason, preset);
    throw error instanceof Error ? error : Error(reason);
  }
}

function getOrCreatePresetEntry(preset: DiceRuntimePreset): PresetCacheEntry {
  const cacheKey = `${preset.presetId}+${preset.model.sha256}`;
  presetCacheKeys.set(preset.presetId, cacheKey);
  const existing = presetCache.get(cacheKey);
  if (existing) return existing;

  const entry: PresetCacheEntry = {
    snapshot: Object.freeze({ status: 'loading', preset }),
    owner: Promise.resolve(),
  };
  entry.owner = loadPresetEntry(entry, preset);
  presetCache.set(cacheKey, entry);
  return entry;
}

async function loadRequestedPreset(presetId: string): Promise<void> {
  try {
    const manifest = await getManifest();
    const preset = selectOriginalCarvedD20(manifest, presetId);
    const entry = getOrCreatePresetEntry(preset);
    await entry.owner;
  } catch (error) {
    const reason = failureReason(error);
    if (!presetCacheKeys.has(presetId)) {
      requestSnapshots.set(presetId, failedSnapshot(reason));
    }
    throw error instanceof Error ? error : Error(reason);
  }
}

export function preloadDiceRuntimePreset(presetId: string): Promise<void> {
  const existing = requestOwners.get(presetId);
  if (existing) return existing;

  if (!ALLOWLIST.has(presetId)) {
    const error = Error('runtime preset is not allowlisted');
    requestSnapshots.set(presetId, failedSnapshot(error.message));
    const owner = Promise.reject(error);
    requestOwners.set(presetId, owner);
    return owner;
  }

  requestSnapshots.set(presetId, Object.freeze({ status: 'loading' }));
  const owner = loadRequestedPreset(presetId);
  requestOwners.set(presetId, owner);
  return owner;
}

export function getDiceRuntimePresetSnapshot(
  presetId: string
): DiceRuntimePresetSnapshot {
  const cacheKey = presetCacheKeys.get(presetId);
  if (cacheKey) return presetCache.get(cacheKey)?.snapshot ?? IDLE_SNAPSHOT;
  return requestSnapshots.get(presetId) ?? IDLE_SNAPSHOT;
}

export function __resetDiceRuntimeProviderForTests() {
  manifestOwner = undefined;
  validatedManifest = undefined;
  requestOwners.clear();
  requestSnapshots.clear();
  presetCacheKeys.clear();
  presetCache.clear();
}
