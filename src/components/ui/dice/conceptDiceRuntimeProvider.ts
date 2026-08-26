import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  parseDiceRuntimeManifest,
  type DiceRuntimeManifest,
  type DiceRuntimePreset,
} from './diceRuntimeManifest';

export type DiceRuntimeAssurance =
  | 'verified-production'
  | 'provisional-concept';

export interface RuntimeMeshBinding {
  readonly objectNode: string;
  readonly meshDefinition: string;
  readonly meshDefinitionIndex: number;
}

export interface ConceptDiceRuntimePresetSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'failed';
  readonly assurance: 'provisional-concept';
  readonly preset?: DiceRuntimePreset;
  readonly scene?: Object3D;
  readonly binding?: RuntimeMeshBinding;
  readonly failureReason?: string;
}

const MANIFEST_URL = '/models/custom-dice/dice-tray-presets.json';
const RUNTIME_MODEL_ROOT = '/models/custom-dice';
const CONCEPT_PRESET_IDS = Object.freeze([
  'dice.original.carved.d4',
  'dice.original.carved.d6',
  'dice.original.carved.d8',
  'dice.original.carved.d10',
  'dice.original.carved.d12',
] as const);
const CONCEPT_PRESET_ID_SET = new Set<string>(CONCEPT_PRESET_IDS);
const CONCEPT_DIE_KINDS = new Set(['d4', 'd6', 'd8', 'd10', 'd12']);
const DISALLOWED_REASON = 'runtime preset is not an allowed concept preset';
const ASSURANCE = 'provisional-concept' as const;
const IDLE_SNAPSHOT: ConceptDiceRuntimePresetSnapshot = Object.freeze({
  status: 'idle',
  assurance: ASSURANCE,
});
const DISALLOWED_SNAPSHOT: ConceptDiceRuntimePresetSnapshot = Object.freeze({
  status: 'failed',
  assurance: ASSURANCE,
  failureReason: DISALLOWED_REASON,
});

type ParsedGltf = Awaited<ReturnType<GLTFLoader['parseAsync']>>;

interface PresetCacheEntry {
  snapshot: ConceptDiceRuntimePresetSnapshot;
  owner: Promise<void>;
}

let manifestOwner: Promise<DiceRuntimeManifest> | undefined;
let validatedManifest: DiceRuntimeManifest | undefined;
let disallowedOwner: Promise<void> | undefined;
const requestOwners = new Map<string, Promise<void>>();
const requestSnapshots = new Map<string, ConceptDiceRuntimePresetSnapshot>();
const presetCacheKeys = new Map<string, string>();
const presetCache = new Map<string, PresetCacheEntry>();

function failureReason(error: unknown): string {
  if (typeof error === 'string' && error.length > 0) return error;
  if (
    (typeof error === 'object' && error !== null) ||
    typeof error === 'function'
  ) {
    try {
      const message = Reflect.get(error, 'message');
      if (typeof message === 'string' && message.length > 0) return message;
    } catch {
      // Untrusted rejection values must not escape failure normalization.
    }
  }
  return 'concept dice runtime failure';
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

function conceptPresetIdKind(presetId: string): string | undefined {
  const prefix = 'dice.original.carved.';
  return presetId.startsWith(prefix)
    ? presetId.slice(prefix.length)
    : undefined;
}

function selectConceptPreset(
  manifest: DiceRuntimeManifest,
  presetId: string
): DiceRuntimePreset {
  const preset = manifest.presets.find(
    (candidate) => candidate.presetId === presetId
  );
  const expectedKind = conceptPresetIdKind(presetId);
  if (
    !preset ||
    expectedKind === undefined ||
    !CONCEPT_DIE_KINDS.has(expectedKind) ||
    preset.presetId !== `dice.original.carved.${preset.dieKind}` ||
    preset.familyId !== 'dice.original.carved' ||
    !CONCEPT_DIE_KINDS.has(preset.dieKind) ||
    preset.model.selectors.kind !== 'single-mesh' ||
    preset.model.geometry.kind !== 'single-mesh-triangle-groups'
  )
    throw Error('concept preset kind or structural contract mismatch');
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

  try {
    const digestBytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    );
    const digest = [...digestBytes]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (digest !== preset.model.sha256) throw Error('model hash mismatch');
  } catch (error) {
    if (failureReason(error) === 'model hash mismatch') throw error;
    throw Error(`model hash failed: ${failureReason(error)}`);
  }
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
  } catch {
    return meshBindingFailure();
  }
}

function failedSnapshot(
  reason: string,
  preset?: DiceRuntimePreset
): ConceptDiceRuntimePresetSnapshot {
  return Object.freeze({
    status: 'failed',
    assurance: ASSURANCE,
    ...(preset ? { preset } : {}),
    failureReason: reason,
  });
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
      assurance: ASSURANCE,
      preset,
      scene: gltf.scene,
      binding,
    });
  } catch (error) {
    const reason = failureReason(error);
    entry.snapshot = failedSnapshot(reason, preset);
    throw Error(reason);
  }
}

function getOrCreatePresetEntry(preset: DiceRuntimePreset): PresetCacheEntry {
  const cacheKey = `${preset.presetId}+${preset.model.sha256}`;
  presetCacheKeys.set(preset.presetId, cacheKey);
  const existing = presetCache.get(cacheKey);
  if (existing) return existing;

  const entry: PresetCacheEntry = {
    snapshot: Object.freeze({
      status: 'loading',
      assurance: ASSURANCE,
      preset,
    }),
    owner: Promise.resolve(),
  };
  entry.owner = loadPresetEntry(entry, preset);
  presetCache.set(cacheKey, entry);
  return entry;
}

async function loadRequestedPreset(presetId: string): Promise<void> {
  try {
    const manifest = await getManifest();
    const preset = selectConceptPreset(manifest, presetId);
    const entry = getOrCreatePresetEntry(preset);
    await entry.owner;
  } catch (error) {
    const reason = failureReason(error);
    if (!presetCacheKeys.has(presetId))
      requestSnapshots.set(presetId, failedSnapshot(reason));
    throw Error(reason);
  }
}

export function preloadConceptDiceRuntimePreset(
  presetId: string
): Promise<void> {
  if (!CONCEPT_PRESET_ID_SET.has(presetId)) {
    disallowedOwner ??= Promise.reject(Error(DISALLOWED_REASON));
    return disallowedOwner;
  }

  const existing = requestOwners.get(presetId);
  if (existing) return existing;

  requestSnapshots.set(
    presetId,
    Object.freeze({ status: 'loading', assurance: ASSURANCE })
  );
  const owner = loadRequestedPreset(presetId);
  requestOwners.set(presetId, owner);
  return owner;
}

export function getConceptDiceRuntimePresetSnapshot(
  presetId: string
): ConceptDiceRuntimePresetSnapshot {
  if (!CONCEPT_PRESET_ID_SET.has(presetId)) return DISALLOWED_SNAPSHOT;
  const cacheKey = presetCacheKeys.get(presetId);
  if (cacheKey) return presetCache.get(cacheKey)?.snapshot ?? IDLE_SNAPSHOT;
  return requestSnapshots.get(presetId) ?? IDLE_SNAPSHOT;
}

export function __resetConceptDiceRuntimeProviderForTests() {
  manifestOwner = undefined;
  validatedManifest = undefined;
  disallowedOwner = undefined;
  requestOwners.clear();
  requestSnapshots.clear();
  presetCacheKeys.clear();
  presetCache.clear();
}
