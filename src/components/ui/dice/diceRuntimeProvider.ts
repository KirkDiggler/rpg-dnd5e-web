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
const ORIGINAL_CARVED_D20_BODY_TRIANGLES = 2_684;
const DISALLOWED_REASON = 'runtime preset is not allowlisted';
const ALLOWLIST = new Set([ORIGINAL_CARVED_D20_PRESET_ID]);
const IDLE_SNAPSHOT: DiceRuntimePresetSnapshot = Object.freeze({
  status: 'idle',
});
const DISALLOWED_SNAPSHOT: DiceRuntimePresetSnapshot = Object.freeze({
  status: 'failed',
  failureReason: DISALLOWED_REASON,
});

type ParsedGltf = Awaited<ReturnType<GLTFLoader['parseAsync']>>;

interface PresetCacheEntry {
  snapshot: DiceRuntimePresetSnapshot;
  owner: Promise<void>;
}

let manifestOwner: Promise<DiceRuntimeManifest> | undefined;
let validatedManifest: DiceRuntimeManifest | undefined;
let disallowedOwner: Promise<void> | undefined;
const requestOwners = new Map<string, Promise<void>>();
const requestSnapshots = new Map<string, DiceRuntimePresetSnapshot>();
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
  return 'dice runtime failure';
}

function controlledError(error: unknown, context?: string): Error {
  const reason = failureReason(error);
  return Error(context ? `${context}: ${reason}` : reason);
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
    throw controlledError(error, 'manifest fetch failed');
  }

  let value: unknown;
  try {
    const bytes = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw controlledError(error, 'manifest JSON failed');
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
  const settlementEntries = Object.values(preset.faceSettlementMap.entries);
  const readIndices = new Set(
    settlementEntries.map((entry) => entry.witness.readIndex)
  );
  const witnessedOrdinals = new Set(
    settlementEntries.flatMap((entry) =>
      entry.witness.kind === 'runtime-face-triangles'
        ? entry.witness.triangleIndices
        : []
    )
  );
  if (
    preset.presetId !== ORIGINAL_CARVED_D20_PRESET_ID ||
    preset.familyId !== 'dice.original.carved' ||
    preset.dieKind !== 'd20' ||
    preset.model.selectors.kind !== 'single-mesh' ||
    preset.model.geometry.kind !== 'single-mesh-triangle-groups' ||
    !settlementEntries.every(
      (entry) => entry.witness.kind === 'runtime-face-triangles'
    ) ||
    preset.model.geometry.bodyTriangleIndices.length !==
      ORIGINAL_CARVED_D20_BODY_TRIANGLES ||
    witnessedOrdinals.size !== ORIGINAL_CARVED_D20_BODY_TRIANGLES ||
    readIndices.size !== 20 ||
    !settlementEntries.every(
      (entry) => entry.witness.readIndex >= 0 && entry.witness.readIndex < 20
    )
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
    throw controlledError(error, 'model fetch failed');
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw controlledError(error, 'model bytes failed');
  }
  if (bytes.byteLength !== preset.model.sizeBytes)
    throw Error('model byte size mismatch');

  const digestInput = new Uint8Array(bytes);
  const digestBytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', digestInput)
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
  } catch {
    return meshBindingFailure();
  }
}

type RuntimeVector3 = readonly [number, number, number];

interface RuntimeTriangle {
  readonly index: number;
  readonly vertices: readonly [RuntimeVector3, RuntimeVector3, RuntimeVector3];
}

interface ParsedGlbBytes {
  readonly document: Readonly<Record<string, unknown>>;
  readonly binary: Uint8Array;
}

function witnessGeometryFailure(): never {
  throw Error('runtime witness geometry validation failed');
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return witnessGeometryFailure();
  return value as Readonly<Record<string, unknown>>;
}

function jsonArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return witnessGeometryFailure();
  return value;
}

function jsonInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum)
    return witnessGeometryFailure();
  return Number(value);
}

function optionalJsonInteger(
  value: unknown,
  fallback: number,
  minimum = 0
): number {
  return value === undefined ? fallback : jsonInteger(value, minimum);
}

function parseGlbBytes(bytes: ArrayBuffer): ParsedGlbBytes {
  const view = new DataView(bytes);
  if (
    view.byteLength < 28 ||
    view.byteLength % 4 !== 0 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== view.byteLength
  )
    return witnessGeometryFailure();

  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  if (
    jsonType !== 0x4e4f534a ||
    jsonLength === 0 ||
    jsonLength % 4 !== 0 ||
    !Number.isSafeInteger(jsonEnd) ||
    jsonEnd + 8 > view.byteLength
  )
    return witnessGeometryFailure();
  const binaryLength = view.getUint32(jsonEnd, true);
  const binaryType = view.getUint32(jsonEnd + 4, true);
  const binaryStart = jsonEnd + 8;
  const binaryEnd = binaryStart + binaryLength;
  if (
    binaryType !== 0x004e4942 ||
    binaryLength === 0 ||
    binaryLength % 4 !== 0 ||
    !Number.isSafeInteger(binaryEnd) ||
    binaryEnd !== view.byteLength
  )
    return witnessGeometryFailure();

  const jsonText = new TextDecoder('utf-8', { fatal: true }).decode(
    new Uint8Array(bytes, jsonStart, jsonLength)
  );
  const unpaddedJson = jsonText.replace(/ +$/, '');
  if (
    unpaddedJson.length === 0 ||
    !unpaddedJson.endsWith('}') ||
    !jsonText.startsWith(unpaddedJson)
  )
    return witnessGeometryFailure();
  const document = jsonRecord(JSON.parse(unpaddedJson) as unknown);
  const binary = new Uint8Array(bytes, binaryStart, binaryLength);
  const buffers = jsonArray(document.buffers);
  if (buffers.length !== 1) return witnessGeometryFailure();
  const buffer = jsonRecord(buffers[0]);
  if ('uri' in buffer) return witnessGeometryFailure();
  const declaredLength = jsonInteger(buffer.byteLength);
  const paddingLength = binary.byteLength - declaredLength;
  if (paddingLength < 0 || paddingLength > 3) return witnessGeometryFailure();
  for (let index = declaredLength; index < binary.byteLength; index += 1) {
    if (binary[index] !== 0) return witnessGeometryFailure();
  }
  return { document, binary };
}

interface AccessorComponent {
  readonly bytes: number;
  readonly read: (view: DataView, offset: number) => number;
}

const INDEX_COMPONENTS: Readonly<Record<number, AccessorComponent>> = {
  5121: {
    bytes: 1,
    read: (view, offset) => view.getUint8(offset),
  },
  5123: {
    bytes: 2,
    read: (view, offset) => view.getUint16(offset, true),
  },
  5125: {
    bytes: 4,
    read: (view, offset) => view.getUint32(offset, true),
  },
};

function readAccessor(
  document: Readonly<Record<string, unknown>>,
  binary: Uint8Array,
  accessorIndexValue: unknown,
  semantic: 'POSITION' | 'index'
): readonly (readonly number[])[] {
  const accessors = jsonArray(document.accessors);
  const bufferViews = jsonArray(document.bufferViews);
  const accessorIndex = jsonInteger(accessorIndexValue);
  if (accessorIndex >= accessors.length) return witnessGeometryFailure();
  const accessor = jsonRecord(accessors[accessorIndex]);
  const viewIndex = jsonInteger(accessor.bufferView);
  if (viewIndex >= bufferViews.length) return witnessGeometryFailure();
  const bufferView = jsonRecord(bufferViews[viewIndex]);
  const componentType = jsonInteger(accessor.componentType);
  const accessorType = accessor.type;
  let component: AccessorComponent;
  let componentCount: number;
  if (semantic === 'POSITION') {
    if (
      componentType !== 5126 ||
      accessorType !== 'VEC3' ||
      ('normalized' in accessor && accessor.normalized !== false)
    )
      return witnessGeometryFailure();
    component = {
      bytes: 4,
      read: (view, offset) => view.getFloat32(offset, true),
    };
    componentCount = 3;
  } else {
    const indexComponent = INDEX_COMPONENTS[componentType];
    if (
      !indexComponent ||
      accessorType !== 'SCALAR' ||
      ('normalized' in accessor && accessor.normalized !== false)
    )
      return witnessGeometryFailure();
    component = indexComponent;
    componentCount = 1;
  }
  if ('sparse' in accessor) return witnessGeometryFailure();
  if (optionalJsonInteger(bufferView.buffer, 0) !== 0)
    return witnessGeometryFailure();
  if (
    'target' in bufferView &&
    bufferView.target !== (semantic === 'POSITION' ? 34962 : 34963)
  )
    return witnessGeometryFailure();

  const count = jsonInteger(accessor.count);
  const viewOffset = optionalJsonInteger(bufferView.byteOffset, 0);
  const viewLength = jsonInteger(bufferView.byteLength);
  const accessorOffset = optionalJsonInteger(accessor.byteOffset, 0);
  const buffers = jsonArray(document.buffers);
  if (buffers.length !== 1) return witnessGeometryFailure();
  const buffer = jsonRecord(buffers[0]);
  if ('uri' in buffer) return witnessGeometryFailure();
  const declaredBufferLength = jsonInteger(buffer.byteLength);
  const viewEnd = viewOffset + viewLength;
  if (
    !Number.isSafeInteger(viewEnd) ||
    viewEnd > declaredBufferLength ||
    viewEnd > binary.byteLength ||
    viewOffset > viewEnd
  )
    return witnessGeometryFailure();
  const elementSize = component.bytes * componentCount;
  let stride = elementSize;
  if (semantic === 'POSITION' && 'byteStride' in bufferView) {
    stride = jsonInteger(bufferView.byteStride, 1);
    if (stride < elementSize || stride > 252 || stride % component.bytes !== 0)
      return witnessGeometryFailure();
  } else if (semantic === 'index' && 'byteStride' in bufferView) {
    return witnessGeometryFailure();
  }
  const start = viewOffset + accessorOffset;
  const requiredEnd =
    count === 0 ? start : start + (count - 1) * stride + elementSize;
  if (
    viewOffset % component.bytes !== 0 ||
    accessorOffset % component.bytes !== 0 ||
    start % component.bytes !== 0 ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requiredEnd) ||
    start < viewOffset ||
    requiredEnd > viewEnd
  )
    return witnessGeometryFailure();

  const data = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength
  );
  return Array.from({ length: count }, (_, itemIndex) => {
    const elementOffset = start + itemIndex * stride;
    const values = Array.from({ length: componentCount }, (_, componentIndex) =>
      component.read(data, elementOffset + componentIndex * component.bytes)
    );
    if (!values.every(Number.isFinite)) return witnessGeometryFailure();
    return values;
  });
}

function boundRuntimeTriangles(
  bytes: ArrayBuffer,
  preset: DiceRuntimePreset,
  binding: RuntimeMeshBinding
): readonly RuntimeTriangle[] {
  const { document, binary } = parseGlbBytes(bytes);
  const nodes = jsonArray(document.nodes);
  const meshes = jsonArray(document.meshes);
  if (meshes.length !== 1 || binding.meshDefinitionIndex !== 0)
    return witnessGeometryFailure();
  const matchingNodes = nodes.filter((candidate) => {
    const node = jsonRecord(candidate);
    return node.name === binding.objectNode;
  });
  if (matchingNodes.length !== 1) return witnessGeometryFailure();
  if (
    jsonInteger(jsonRecord(matchingNodes[0]).mesh) !==
    binding.meshDefinitionIndex
  )
    return witnessGeometryFailure();
  const mesh = jsonRecord(meshes[binding.meshDefinitionIndex]);
  if (mesh.name !== binding.meshDefinition) return witnessGeometryFailure();
  const primitives = jsonArray(mesh.primitives);
  if (primitives.length !== preset.model.meshFacts.primitiveCount)
    return witnessGeometryFailure();

  const triangles: RuntimeTriangle[] = [];
  for (const primitiveValue of primitives) {
    const primitive = jsonRecord(primitiveValue);
    if (optionalJsonInteger(primitive.mode, 4) !== 4)
      return witnessGeometryFailure();
    const attributes = jsonRecord(primitive.attributes);
    const positions = readAccessor(
      document,
      binary,
      attributes.POSITION,
      'POSITION'
    );
    if (!('indices' in primitive)) return witnessGeometryFailure();
    const indices = readAccessor(
      document,
      binary,
      primitive.indices,
      'index'
    ).map((value) => jsonInteger(value[0]));
    if (indices.length % 3 !== 0) return witnessGeometryFailure();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const vertices = indices.slice(offset, offset + 3).map((index) => {
        if (index >= positions.length) return witnessGeometryFailure();
        const position = positions[index];
        if (position.length !== 3) return witnessGeometryFailure();
        return [position[0], position[1], position[2]] as RuntimeVector3;
      });
      triangles.push({
        index: triangles.length,
        vertices: vertices as [RuntimeVector3, RuntimeVector3, RuntimeVector3],
      });
    }
  }

  if (
    preset.model.geometry.kind !== 'single-mesh-triangle-groups' ||
    triangles.length !== preset.model.meshFacts.triangles ||
    triangles.length !== preset.model.geometry.totalTriangles
  )
    return witnessGeometryFailure();
  return triangles;
}

function compareVectors(left: RuntimeVector3, right: RuntimeVector3) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis] !== right[axis]) return left[axis] - right[axis];
  }
  return 0;
}

function roundedCoordinate(value: number) {
  if (!Number.isFinite(value)) return witnessGeometryFailure();
  if (Math.abs(value) >= Number.MAX_SAFE_INTEGER / 1_000_000) return value;
  const scaled = value * 1_000_000;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  const roundedInteger =
    fraction < 0.5
      ? floor
      : fraction > 0.5
        ? floor + 1
        : Math.abs(floor) % 2 === 0
          ? floor
          : floor + 1;
  const rounded = roundedInteger / 1_000_000;
  return rounded === 0 ? 0 : rounded;
}

function pythonJsonFloat(value: number) {
  if (!Number.isFinite(value)) return witnessGeometryFailure();
  if (value === 0) return '0.0';
  const sign = value < 0 ? '-' : '';
  const [coefficient, exponentText] = Math.abs(value)
    .toExponential()
    .split('e');
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) return witnessGeometryFailure();
  if (exponent < -4 || exponent >= 16) {
    const exponentSign = exponent < 0 ? '-' : '+';
    return `${sign}${coefficient}e${exponentSign}${String(
      Math.abs(exponent)
    ).padStart(2, '0')}`;
  }

  const digits = coefficient.replace('.', '');
  const decimalPosition = exponent + 1;
  if (decimalPosition <= 0)
    return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length)
    return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}.0`;
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(
    decimalPosition
  )}`;
}

function triangleSignature(triangle: RuntimeTriangle) {
  return [...triangle.vertices]
    .map((vertex) => vertex.map(roundedCoordinate) as [number, number, number])
    .sort(compareVectors);
}

function compareSignatures(
  left: readonly RuntimeVector3[],
  right: readonly RuntimeVector3[]
) {
  for (let index = 0; index < 3; index += 1) {
    const compared = compareVectors(left[index], right[index]);
    if (compared !== 0) return compared;
  }
  return 0;
}

function encodedTriangleSignatures(triangles: readonly RuntimeTriangle[]) {
  const signatures = triangles.map(triangleSignature).sort(compareSignatures);
  const serialized = `[${signatures
    .map(
      (signature) =>
        `[${signature
          .map((vertex) => `[${vertex.map(pythonJsonFloat).join(',')}]`)
          .join(',')}]`
    )
    .join(',')}]`;
  return new TextEncoder().encode(serialized);
}

export function __canonicalRuntimeTriangleSignaturesForTests(
  triangles: readonly (readonly [
    RuntimeVector3,
    RuntimeVector3,
    RuntimeVector3,
  ])[]
) {
  return encodedTriangleSignatures(
    triangles.map((vertices, index) => ({ index, vertices }))
  );
}

async function sha256Hex(bytes: Uint8Array) {
  const digestInput = new Uint8Array(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', digestInput)
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function triangleOutwardAreaNormal(triangle: RuntimeTriangle): RuntimeVector3 {
  const [a, b, c] = triangle.vertices;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  let normal: RuntimeVector3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const center: RuntimeVector3 = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  if (normal[0] * center[0] + normal[1] * center[1] + normal[2] * center[2] < 0)
    normal = [-normal[0], -normal[1], -normal[2]];
  const magnitude = Math.hypot(...normal);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    return witnessGeometryFailure();
  return normal;
}

function witnessOutwardNormal(
  triangles: readonly RuntimeTriangle[]
): RuntimeVector3 {
  let areaNormal: RuntimeVector3 = [0, 0, 0];
  for (const triangle of triangles) {
    const normal = triangleOutwardAreaNormal(triangle);
    areaNormal = [
      areaNormal[0] + normal[0],
      areaNormal[1] + normal[1],
      areaNormal[2] + normal[2],
    ];
  }
  const magnitude = Math.hypot(...areaNormal);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    return witnessGeometryFailure();
  const normal: RuntimeVector3 = [
    areaNormal[0] / magnitude,
    areaNormal[1] / magnitude,
    areaNormal[2] / magnitude,
  ];
  const projections = triangles.flatMap((triangle) =>
    triangle.vertices.map(
      (vertex) =>
        vertex[0] * normal[0] + vertex[1] * normal[1] + vertex[2] * normal[2]
    )
  );
  if (
    projections.length === 0 ||
    Math.max(...projections) - Math.min(...projections) > 0.00001
  )
    return witnessGeometryFailure();
  return normal;
}

async function validateFaceWitnessGeometry(
  bytes: ArrayBuffer,
  preset: DiceRuntimePreset,
  binding: RuntimeMeshBinding
): Promise<void> {
  try {
    if (preset.model.geometry.kind !== 'single-mesh-triangle-groups')
      return witnessGeometryFailure();
    const triangles = boundRuntimeTriangles(bytes, preset, binding);
    const body = new Set(preset.model.geometry.bodyTriangleIndices);
    const occupied = new Set<number>();
    for (const entry of Object.values(preset.faceSettlementMap.entries)) {
      const witness = entry.witness;
      if (witness.kind !== 'runtime-face-triangles')
        return witnessGeometryFailure();
      const witnessedTriangles = witness.triangleIndices.map((ordinal) => {
        if (
          !body.has(ordinal) ||
          occupied.has(ordinal) ||
          ordinal < 0 ||
          ordinal >= triangles.length
        )
          return witnessGeometryFailure();
        occupied.add(ordinal);
        return triangles[ordinal];
      });
      const digest = await sha256Hex(
        encodedTriangleSignatures(witnessedTriangles)
      );
      if (digest !== witness.triangleSignatureSha256)
        return witnessGeometryFailure();
      const normal = witnessOutwardNormal(witnessedTriangles);
      const agreement =
        normal[0] * witness.readDirection[0] +
        normal[1] * witness.readDirection[1] +
        normal[2] * witness.readDirection[2];
      if (!Number.isFinite(agreement) || agreement < 0.999999)
        return witnessGeometryFailure();
    }
    if (
      body.size !== ORIGINAL_CARVED_D20_BODY_TRIANGLES ||
      occupied.size !== ORIGINAL_CARVED_D20_BODY_TRIANGLES ||
      occupied.size !== body.size
    )
      return witnessGeometryFailure();
  } catch {
    return witnessGeometryFailure();
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
    await validateFaceWitnessGeometry(bytes, preset, binding);
    entry.snapshot = Object.freeze({
      status: 'ready',
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
    throw Error(reason);
  }
}

export function preloadDiceRuntimePreset(presetId: string): Promise<void> {
  if (!ALLOWLIST.has(presetId)) {
    disallowedOwner ??= Promise.reject(Error(DISALLOWED_REASON));
    return disallowedOwner;
  }

  const existing = requestOwners.get(presetId);
  if (existing) return existing;

  requestSnapshots.set(presetId, Object.freeze({ status: 'loading' }));
  const owner = loadRequestedPreset(presetId);
  requestOwners.set(presetId, owner);
  return owner;
}

export function getDiceRuntimePresetSnapshot(
  presetId: string
): DiceRuntimePresetSnapshot {
  if (!ALLOWLIST.has(presetId)) return DISALLOWED_SNAPSHOT;
  const cacheKey = presetCacheKeys.get(presetId);
  if (cacheKey) return presetCache.get(cacheKey)?.snapshot ?? IDLE_SNAPSHOT;
  return requestSnapshots.get(presetId) ?? IDLE_SNAPSHOT;
}

export function __resetDiceRuntimeProviderForTests() {
  manifestOwner = undefined;
  validatedManifest = undefined;
  disallowedOwner = undefined;
  requestOwners.clear();
  requestSnapshots.clear();
  presetCacheKeys.clear();
  presetCache.clear();
}
