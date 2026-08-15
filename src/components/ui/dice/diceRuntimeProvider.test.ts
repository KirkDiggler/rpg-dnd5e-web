import { createHash } from 'node:crypto';
import { Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as runtimeProvider from './diceRuntimeProvider';
import {
  __resetDiceRuntimeProviderForTests,
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
} from './diceRuntimeProvider';
import {
  FIXTURE_D20_BODY_TRIANGLE_COUNT,
  FIXTURE_INDEX_BYTE_OFFSET,
  FIXTURE_MODEL_BYTES,
  FIXTURE_MODEL_SHA256,
  FIXTURE_POSITION_BYTE_OFFSET,
  validDiceRuntimeManifest,
} from './diceRuntimeTestFixtures';

const loader = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parse = loader.parse;
  },
}));

const PRESET_ID = 'dice.original.carved.d20';
const MANIFEST_URL = '/models/custom-dice/dice-tray-presets.json';
const MODEL_URL = '/models/custom-dice/original-set/Original_D20_Source.glb';
const MODEL_BYTES = FIXTURE_MODEL_BYTES;

function manifestBytes(value: unknown = validDiceRuntimeManifest()) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function manifestWithInvalidMap() {
  const fixture = validDiceRuntimeManifest();
  delete fixture.presets[0].faceSettlementMap.entries['20'];
  return fixture;
}

function okBytesResponse(bytes: Uint8Array) {
  return {
    ok: true,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  };
}

function validGltf(
  options: {
    objectNode?: string;
    meshDefinition?: string;
    meshIndex?: number;
    scene?: Object3D;
  } = {}
) {
  const manifest = validDiceRuntimeManifest();
  const selectors = manifest.presets[0].model.selectors;
  const objectNode = options.objectNode ?? selectors.objectNode;
  const meshDefinition = options.meshDefinition ?? selectors.meshDefinition;
  const scene = options.scene ?? new Object3D();
  if (!scene.getObjectByName(objectNode)) {
    const runtimeNode = new Object3D();
    runtimeNode.name = objectNode;
    scene.add(runtimeNode);
  }
  return {
    scene,
    parser: {
      json: {
        nodes: [{ name: objectNode, mesh: options.meshIndex ?? 0 }],
        meshes: [{ name: meshDefinition }, { name: 'wrong-mesh' }],
      },
    },
  };
}

function digestBuffer(hex: string) {
  return Uint8Array.from(Buffer.from(hex, 'hex')).buffer;
}

function arrangeDigest(modelDigest = FIXTURE_MODEL_SHA256) {
  let callIndex = 0;
  const digest = vi.fn(
    async (_algorithm: string, value: ArrayBuffer | ArrayBufferView) => {
      const bytes = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);
      const hex =
        callIndex++ === 0
          ? modelDigest
          : createHash('sha256').update(bytes).digest('hex');
      return digestBuffer(hex);
    }
  );
  vi.stubGlobal('crypto', { subtle: { digest } });
  return digest;
}

function arrangeSuccessfulParse(gltf = validGltf()) {
  loader.parse.mockImplementation(
    (
      _bytes: ArrayBuffer,
      _path: string,
      onLoad: (result: typeof gltf) => void
    ) => onLoad(gltf)
  );
  return gltf;
}

function arrangeFetches(
  manifest: unknown = validDiceRuntimeManifest(),
  modelBytes: Uint8Array = MODEL_BYTES
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(okBytesResponse(manifestBytes(manifest)))
    .mockResolvedValueOnce(okBytesResponse(modelBytes));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface FixtureGlbDocument {
  accessors: Array<Record<string, unknown>>;
  bufferViews: Array<Record<string, unknown>>;
  buffers: Array<Record<string, unknown>>;
  meshes: Array<{
    primitives: Array<Record<string, unknown>>;
  }>;
}

function fixtureGlbParts() {
  const view = new DataView(
    MODEL_BYTES.buffer,
    MODEL_BYTES.byteOffset,
    MODEL_BYTES.byteLength
  );
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(
    new TextDecoder().decode(MODEL_BYTES.slice(20, 20 + jsonLength))
  ) as FixtureGlbDocument;
  const binaryHeader = 20 + jsonLength;
  const binaryLength = view.getUint32(binaryHeader, true);
  return {
    document,
    binary: MODEL_BYTES.slice(
      binaryHeader + 8,
      binaryHeader + 8 + binaryLength
    ),
  };
}

function paddedBytes(bytes: Uint8Array, paddingByte: number) {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.fill(paddingByte);
  padded.set(bytes);
  return padded;
}

function glbChunk(type: number, payload: Uint8Array) {
  const chunk = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.byteLength, true);
  view.setUint32(4, type, true);
  chunk.set(payload, 8);
  return chunk;
}

function rawGlb(chunks: readonly Uint8Array[]) {
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  let offset = 12;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function rebuiltFixtureGlb(
  mutate: (parts: {
    document: FixtureGlbDocument;
    binary: Uint8Array;
  }) => void = () => undefined,
  options: {
    chunkOrder?: readonly ('JSON' | 'BIN' | 'UNKNOWN')[];
    unalignedJson?: boolean;
  } = {}
) {
  const parts = fixtureGlbParts();
  mutate(parts);
  const encodedJson = new TextEncoder().encode(JSON.stringify(parts.document));
  let json = options.unalignedJson
    ? encodedJson
    : paddedBytes(encodedJson, 0x20);
  if (options.unalignedJson && json.byteLength % 4 === 0) {
    const extended = new Uint8Array(json.byteLength + 1);
    extended.set(json);
    extended[extended.length - 1] = 0x20;
    json = extended;
  }
  const chunks = (options.chunkOrder ?? ['JSON', 'BIN']).map((kind) => {
    if (kind === 'JSON') return glbChunk(0x4e4f534a, json);
    if (kind === 'BIN') return glbChunk(0x004e4942, parts.binary);
    return glbChunk(0x12345678, new Uint8Array(4));
  });
  return rawGlb(chunks);
}

function signatureDigestForRepeatedZTriangles(count: number) {
  const signature = '[[0.0,0.0,3.0],[0.0,1.0,3.0],[1.0,0.0,3.0]]';
  return createHash('sha256')
    .update(`[${Array.from({ length: count }, () => signature).join(',')}]`)
    .digest('hex');
}

function resizedBodyManifest(delta: -1 | 1) {
  const manifest = validDiceRuntimeManifest();
  const geometry = manifest.presets[0].model.geometry;
  const lastWitness = manifest.presets[0].faceSettlementMap.entries['20']
    .witness as {
    triangleIndices: number[];
    triangleSignatureSha256: string;
  };
  if (delta === -1) {
    const removed = geometry.bodyTriangleIndices.pop();
    if (removed === undefined) throw Error('fixture body unexpectedly empty');
    geometry.numeralTriangleIndices.unshift(removed);
    lastWitness.triangleIndices.pop();
  } else {
    const promoted = geometry.numeralTriangleIndices.pop();
    if (promoted === undefined)
      throw Error('fixture numeral unexpectedly empty');
    geometry.bodyTriangleIndices.push(promoted);
    lastWitness.triangleIndices.push(promoted);
  }
  lastWitness.triangleSignatureSha256 = signatureDigestForRepeatedZTriangles(
    lastWitness.triangleIndices.length
  );
  return manifest;
}

function hostileFailureValue() {
  return new Proxy(new Error('untrusted failure'), {
    getPrototypeOf() {
      throw Error('hostile provider prototype trap');
    },
    get(target, property, receiver) {
      if (
        property === 'message' ||
        property === 'toString' ||
        property === Symbol.toPrimitive
      )
        throw Error('hostile provider string trap');
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

beforeEach(() => {
  __resetDiceRuntimeProviderForTests();
  loader.parse.mockReset();
  vi.unstubAllGlobals();
});

describe('dice runtime provider', () => {
  it.each([
    [
      'sub-1e-4 exponents and normalized signed zero',
      [0.000002, -0.000002, -0.0000004],
      '[[[2e-06,-2e-06,0.0],[2e-06,-2e-06,0.0],[2e-06,-2e-06,0.0]]]',
      'd6c6dfef6bbb57825d23bacbf80428aa3e58d6d09d16c0d899cd92a93dda9a82',
    ],
    [
      'positive, negative, down, and up half-even ties',
      [0.0078125, 0.0234375, -0.0078125],
      '[[[0.007812,0.023438,-0.007812],[0.007812,0.023438,-0.007812],[0.007812,0.023438,-0.007812]]]',
      '98bc16bc595258e183275433b01de37aac745fdbaa102f1895718536cb292617',
    ],
    [
      'integral floats and positive/negative exponent spelling',
      [1, 1e20, -1e20],
      '[[[1.0,1e+20,-1e+20],[1.0,1e+20,-1e+20],[1.0,1e+20,-1e+20]]]',
      'f365cbbde472947c873d98bd1a0889f7b807a93f35e4b014eb8e47193191da87',
    ],
  ])(
    'matches producer-derived canonical signature bytes for %s',
    (_name, vector, expectedBytes, expectedDigest) => {
      type CanonicalSignatureEncoder = (
        triangles: readonly (readonly [
          readonly [number, number, number],
          readonly [number, number, number],
          readonly [number, number, number],
        ])[]
      ) => Uint8Array;
      const canonical = (
        runtimeProvider as unknown as {
          __canonicalRuntimeTriangleSignaturesForTests?: CanonicalSignatureEncoder;
        }
      ).__canonicalRuntimeTriangleSignaturesForTests;
      expect(canonical).toBeTypeOf('function');
      if (!canonical) return;
      const vertex = vector as [number, number, number];
      const bytes = canonical([[vertex, vertex, vertex]]);

      expect(new TextDecoder().decode(bytes)).toBe(expectedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        expectedDigest
      );
    }
  );

  it.each([
    ['smaller', -1 as const, FIXTURE_D20_BODY_TRIANGLE_COUNT - 1],
    ['larger', 1 as const, FIXTURE_D20_BODY_TRIANGLE_COUNT + 1],
  ])(
    'rejects a coherent %s carved-d20 body/witness union before model I/O',
    async (_name, delta, expectedCount) => {
      const manifest = resizedBodyManifest(delta);
      expect(
        manifest.presets[0].model.geometry.bodyTriangleIndices
      ).toHaveLength(expectedCount);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(okBytesResponse(manifestBytes(manifest)));
      vi.stubGlobal('fetch', fetchMock);
      const digest = arrangeDigest();

      const first = preloadDiceRuntimePreset(PRESET_ID);
      const second = preloadDiceRuntimePreset(PRESET_ID);
      await expect(first).rejects.toThrow(/carved d20 contract/i);
      await expect(second).rejects.toThrow(/carved d20 contract/i);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL);
      expect(digest).not.toHaveBeenCalled();
      expect(loader.parse).not.toHaveBeenCalled();
      expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
    }
  );

  it('coalesces concurrent witnesses around the exact 2,684-triangle contract and one source scene', async () => {
    const fixture = validDiceRuntimeManifest();
    const geometry = fixture.presets[0].model.geometry;
    const witnessOrdinals = Object.values(
      fixture.presets[0].faceSettlementMap.entries
    ).flatMap((entry) => entry.witness.triangleIndices ?? []);
    expect(geometry.bodyTriangleIndices).toHaveLength(
      FIXTURE_D20_BODY_TRIANGLE_COUNT
    );
    expect(witnessOrdinals).toHaveLength(FIXTURE_D20_BODY_TRIANGLE_COUNT);
    expect(new Set(witnessOrdinals).size).toBe(FIXTURE_D20_BODY_TRIANGLE_COUNT);
    const canonicalBytes = manifestBytes(fixture);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okBytesResponse(canonicalBytes))
      .mockResolvedValueOnce(okBytesResponse(MODEL_BYTES));
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();
    const gltf = arrangeSuccessfulParse();

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);

    expect(first).toBe(second);
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toEqual({
      status: 'loading',
    });
    await Promise.all([first, second]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      MANIFEST_URL,
      MODEL_URL,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(21);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(loader.parse.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
    const firstSnapshot = getDiceRuntimePresetSnapshot(PRESET_ID);
    const secondSnapshot = getDiceRuntimePresetSnapshot(PRESET_ID);
    expect(firstSnapshot).toMatchObject({
      status: 'ready',
      preset: {
        presetId: PRESET_ID,
        model: {
          sha256: FIXTURE_MODEL_SHA256,
          sizeBytes: MODEL_BYTES.byteLength,
        },
      },
      binding: {
        objectNode: fixture.presets[0].model.selectors.objectNode,
        meshDefinition: fixture.presets[0].model.selectors.meshDefinition,
        meshDefinitionIndex: 0,
      },
    });
    expect(firstSnapshot.preset).toBe(secondSnapshot.preset);
    expect(firstSnapshot.scene).toBe(gltf.scene);
    expect(firstSnapshot.scene).toBe(secondSnapshot.scene);
    expect(firstSnapshot.binding).toBe(secondSnapshot.binding);
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.preset)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.binding)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(canonicalBytes))).toMatchObject({
      generatedBy: 'build_dice_runtime_manifest@2.0.0',
      runtimeRoot: 'harness/models/custom-dice',
      coordinateContract: fixture.coordinateContract,
    });
  });

  it.each([
    'lightning',
    'dice.original.carved.d12',
    'https://evil.test/caller-selected.glb',
  ])(
    'rejects non-allowlisted caller input %s without fetching it',
    async (id) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      arrangeDigest();

      const first = preloadDiceRuntimePreset(id);
      const second = preloadDiceRuntimePreset(id);
      expect(first).toBe(second);
      await expect(first).rejects.toThrow(/allowlist/i);
      await expect(second).rejects.toThrow(/allowlist/i);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(loader.parse).not.toHaveBeenCalled();
      expect(getDiceRuntimePresetSnapshot(id)).toMatchObject({
        status: 'failed',
        failureReason: expect.stringMatching(/allowlist/i),
      });
    }
  );

  it('shares bounded disallowed ownership across distinct arbitrary IDs without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    arrangeDigest();

    const first = preloadDiceRuntimePreset('arbitrary.disallowed.one');
    const second = preloadDiceRuntimePreset('arbitrary.disallowed.two');
    const third = preloadDiceRuntimePreset(`arbitrary.${'x'.repeat(10_000)}`);

    expect(second).toBe(first);
    expect(third).toBe(first);
    await expect(first).rejects.toThrow(/allowlist/i);
    await expect(second).rejects.toThrow(/allowlist/i);
    await expect(third).rejects.toThrow(/allowlist/i);

    const firstSnapshot = getDiceRuntimePresetSnapshot(
      'arbitrary.disallowed.one'
    );
    expect(getDiceRuntimePresetSnapshot('arbitrary.disallowed.two')).toBe(
      firstSnapshot
    );
    expect(
      getDiceRuntimePresetSnapshot(`arbitrary.${'y'.repeat(10_000)}`)
    ).toBe(firstSnapshot);
    expect(firstSnapshot).toEqual({
      status: 'failed',
      failureReason: 'runtime preset is not allowlisted',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
  });

  it('coalesces a terminal manifest response failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    expect(first).toBe(second);
    await expect(first).rejects.toThrow(/manifest fetch/i);
    await expect(second).rejects.toThrow(/manifest fetch/i);
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
      /manifest fetch/i
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL);
    expect(digest).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
    const failed = getDiceRuntimePresetSnapshot(PRESET_ID);
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: expect.stringMatching(/manifest fetch/i),
    });
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toBe(failed);
  });

  it.each([
    [
      'malformed JSON',
      new TextEncoder().encode('{"contract":'),
      /manifest JSON/i,
    ],
    [
      'invalid strict contract',
      manifestBytes({
        ...validDiceRuntimeManifest(),
        authoringSource: 'private',
      }),
      /manifest/i,
    ],
    [
      'invalid settlement map',
      manifestBytes(manifestWithInvalidMap()),
      /manifest/i,
    ],
  ])(
    'fails terminally on %s before model I/O',
    async (_name, bytes, reason) => {
      const fetchMock = vi.fn().mockResolvedValue(okBytesResponse(bytes));
      vi.stubGlobal('fetch', fetchMock);
      const digest = arrangeDigest();

      const first = preloadDiceRuntimePreset(PRESET_ID);
      const second = preloadDiceRuntimePreset(PRESET_ID);
      await expect(first).rejects.toThrow(reason);
      await expect(second).rejects.toThrow(reason);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(digest).not.toHaveBeenCalled();
      expect(loader.parse).not.toHaveBeenCalled();
      expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
    }
  );

  it('fails terminally when the allowlisted preset is missing from a valid manifest', async () => {
    const fixture = validDiceRuntimeManifest();
    fixture.presets[0].presetId = 'dice.original.carved.d12';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okBytesResponse(manifestBytes(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/missing/i);
    await expect(second).rejects.toThrow(/missing/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(digest).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
  });

  it('coalesces a terminal model response failure after validating the manifest', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okBytesResponse(manifestBytes()))
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/model fetch/i);
    await expect(second).rejects.toThrow(/model fetch/i);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      MANIFEST_URL,
      MODEL_URL,
    ]);
    expect(digest).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
      status: 'failed',
      preset: { presetId: PRESET_ID },
    });
  });

  it('checks exact byte size before digest or GLTF parsing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okBytesResponse(manifestBytes()))
      .mockResolvedValueOnce(okBytesResponse(new Uint8Array([1, 2])));
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/size/i);
    await expect(second).rejects.toThrow(/size/i);
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(/size/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
  });

  it('checks SHA-256 before GLTF parsing and preserves digest failure', async () => {
    const fetchMock = arrangeFetches();
    const digest = arrangeDigest('bb'.repeat(32));

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/hash/i);
    await expect(second).rejects.toThrow(/hash/i);
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(/hash/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
  });

  it('normalizes a hostile digest rejection and unconditionally leaves a failed snapshot', async () => {
    const fetchMock = arrangeFetches();
    const digest = vi.fn().mockRejectedValue(hostileFailureValue());
    vi.stubGlobal('crypto', { subtle: { digest } });

    const owner = preloadDiceRuntimePreset(PRESET_ID);
    await expect(owner).rejects.toThrow('dice runtime failure');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
      status: 'failed',
      preset: { presetId: PRESET_ID },
      failureReason: 'dice runtime failure',
    });
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
      'dice runtime failure'
    );
  });

  it('normalizes a hostile GLTF rejection and unconditionally leaves a failed snapshot', async () => {
    const fetchMock = arrangeFetches();
    const digest = arrangeDigest();
    loader.parse.mockImplementation(
      (
        _bytes: ArrayBuffer,
        _path: string,
        _onLoad: unknown,
        onError: (error: unknown) => void
      ) => onError(hostileFailureValue())
    );

    const owner = preloadDiceRuntimePreset(PRESET_ID);
    await expect(owner).rejects.toThrow('dice runtime failure');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
      status: 'failed',
      preset: { presetId: PRESET_ID },
      failureReason: 'dice runtime failure',
    });
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
      'dice runtime failure'
    );
  });

  it('enforces contract → bytes/size/hash → GLTF parse ordering', async () => {
    const order: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      order.push(`fetch:${url}`);
      return {
        ok: true,
        arrayBuffer: async () => {
          order.push(`bytes:${url}`);
          return url === MANIFEST_URL
            ? manifestBytes().buffer
            : MODEL_BYTES.slice().buffer;
        },
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(
          async (_algorithm: string, value: ArrayBuffer | ArrayBufferView) => {
            const bytes = ArrayBuffer.isView(value)
              ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
              : new Uint8Array(value);
            const modelDigest = bytes.byteLength === MODEL_BYTES.byteLength;
            order.push(modelDigest ? 'digest:model' : 'digest:witness');
            return digestBuffer(
              modelDigest
                ? FIXTURE_MODEL_SHA256
                : createHash('sha256').update(bytes).digest('hex')
            );
          }
        ),
      },
    });
    loader.parse.mockImplementation(
      (
        _bytes: ArrayBuffer,
        _path: string,
        onLoad: (result: ReturnType<typeof validGltf>) => void
      ) => {
        order.push('parse');
        onLoad(validGltf());
      }
    );

    await preloadDiceRuntimePreset(PRESET_ID);

    expect(order).toEqual([
      `fetch:${MANIFEST_URL}`,
      `bytes:${MANIFEST_URL}`,
      `fetch:${MODEL_URL}`,
      `bytes:${MODEL_URL}`,
      'digest:model',
      'parse',
      ...Array.from({ length: 20 }, () => 'digest:witness'),
    ]);
  });

  it('binds a differing glTF object-node name to its mesh-definition index', async () => {
    arrangeFetches();
    arrangeDigest();
    const fixture = validDiceRuntimeManifest();
    const selectors = fixture.presets[0].model.selectors;
    const scene = new Object3D();
    const objectNode = new Object3D();
    objectNode.name = selectors.objectNode;
    scene.add(objectNode);
    const getObjectByName = vi.spyOn(scene, 'getObjectByName');
    arrangeSuccessfulParse(validGltf({ scene }));

    await preloadDiceRuntimePreset(PRESET_ID);

    const snapshot = getDiceRuntimePresetSnapshot(PRESET_ID);
    expect(selectors.objectNode).not.toBe(selectors.meshDefinition);
    expect(snapshot).toMatchObject({
      status: 'ready',
      scene,
      binding: {
        objectNode: selectors.objectNode,
        meshDefinition: selectors.meshDefinition,
        meshDefinitionIndex: 0,
      },
    });
    expect(getObjectByName).toHaveBeenCalledWith(selectors.objectNode);
    expect(getObjectByName).not.toHaveBeenCalledWith(selectors.meshDefinition);
  });

  it.each([
    [
      'one runtime index byte',
      () => {
        const bytes = MODEL_BYTES.slice();
        new DataView(bytes.buffer).setUint16(
          FIXTURE_INDEX_BYTE_OFFSET,
          405,
          true
        );
        return { manifest: validDiceRuntimeManifest(), bytes };
      },
    ],
    [
      'one runtime vertex coordinate',
      () => {
        const bytes = MODEL_BYTES.slice();
        new DataView(bytes.buffer).setFloat32(
          FIXTURE_POSITION_BYTE_OFFSET,
          0.25,
          true
        );
        return { manifest: validDiceRuntimeManifest(), bytes };
      },
    ],
    [
      'one witness digest',
      () => {
        const manifest = validDiceRuntimeManifest();
        manifest.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleSignatureSha256 = 'd'.repeat(64);
        return { manifest, bytes: MODEL_BYTES };
      },
    ],
    [
      'coordinated witness ordinal and digest permutation',
      () => {
        const manifest = validDiceRuntimeManifest();
        const first = manifest.presets[0].faceSettlementMap.entries['1'];
        const second = manifest.presets[0].faceSettlementMap.entries['2'];
        [first.witness.triangleIndices, second.witness.triangleIndices] = [
          second.witness.triangleIndices,
          first.witness.triangleIndices,
        ];
        [
          first.witness.triangleSignatureSha256,
          second.witness.triangleSignatureSha256,
        ] = [
          second.witness.triangleSignatureSha256,
          first.witness.triangleSignatureSha256,
        ];
        return { manifest, bytes: MODEL_BYTES };
      },
    ],
    [
      'one read direction',
      () => {
        const manifest = validDiceRuntimeManifest();
        manifest.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.readDirection = [0, 1, 0];
        return { manifest, bytes: MODEL_BYTES };
      },
    ],
  ])(
    'fails terminally on %s after exact GLTF binding and before readiness',
    async (_name, arrange) => {
      const { manifest, bytes } = arrange();
      arrangeFetches(manifest, bytes);
      arrangeDigest();
      arrangeSuccessfulParse();

      const first = preloadDiceRuntimePreset(PRESET_ID);
      const second = preloadDiceRuntimePreset(PRESET_ID);
      await expect(first).rejects.toThrow(/witness geometry/i);
      await expect(second).rejects.toThrow(/witness geometry/i);
      await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
        /witness geometry/i
      );

      expect(loader.parse).toHaveBeenCalledTimes(1);
      expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
        status: 'failed',
        failureReason: expect.stringMatching(/witness geometry/i),
      });
    }
  );

  it.each([
    [
      'declared buffer longer than the BIN chunk',
      () =>
        rebuiltFixtureGlb(({ document, binary }) => {
          document.buffers[0].byteLength = binary.byteLength + 1;
        }),
    ],
    [
      'short BIN chunk',
      () =>
        rebuiltFixtureGlb((parts) => {
          parts.binary = parts.binary.slice(0, -4);
        }),
    ],
    [
      'excess BIN padding',
      () =>
        rebuiltFixtureGlb((parts) => {
          const excess = new Uint8Array(parts.binary.byteLength + 4);
          excess.set(parts.binary);
          parts.binary = excess;
        }),
    ],
    [
      'nonzero BIN padding',
      () =>
        rebuiltFixtureGlb((parts) => {
          parts.binary[parts.binary.length - 1] = 1;
        }),
    ],
    [
      'an unaligned BIN chunk',
      () =>
        rebuiltFixtureGlb((parts) => {
          parts.binary = parts.binary.slice(0, -1);
        }),
    ],
    [
      'BIN before JSON',
      () => rebuiltFixtureGlb(undefined, { chunkOrder: ['BIN', 'JSON'] }),
    ],
    [
      'an unaligned JSON chunk',
      () => rebuiltFixtureGlb(undefined, { unalignedJson: true }),
    ],
    [
      'an extra unknown chunk',
      () =>
        rebuiltFixtureGlb(undefined, {
          chunkOrder: ['JSON', 'UNKNOWN', 'BIN'],
        }),
    ],
    [
      'a misaligned POSITION bufferView offset',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[0].byteOffset = 2;
        }),
    ],
    [
      'a misaligned index bufferView offset',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[1].byteOffset =
            Number(document.bufferViews[1].byteOffset) - 1;
        }),
    ],
    [
      'a misaligned POSITION accessor offset',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.accessors[0].byteOffset = 2;
        }),
    ],
    [
      'a nondivisible vertex stride',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[0].byteStride = 14;
        }),
    ],
    [
      'a vertex stride above the legal range',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[0].byteStride = 256;
        }),
    ],
    [
      'multiple embedded buffers',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.buffers.push({ byteLength: 0 });
        }),
    ],
    [
      'an external buffer URI',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.buffers[0].uri = 'external.bin';
        }),
    ],
    [
      'an out-of-range accessor index',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.meshes[0].primitives[0].indices = 99;
        }),
    ],
    [
      'an out-of-range bufferView index',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.accessors[0].bufferView = 99;
        }),
    ],
    [
      'an out-of-range decoded vertex index',
      () =>
        rebuiltFixtureGlb(({ document, binary }) => {
          const indexOffset = Number(document.bufferViews[1].byteOffset);
          new DataView(
            binary.buffer,
            binary.byteOffset,
            binary.byteLength
          ).setUint16(indexOffset, 65_535, true);
        }),
    ],
    [
      'a wrong POSITION bufferView target',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[0].target = 34963;
        }),
    ],
    [
      'a wrong POSITION component type',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.accessors[0].componentType = 5123;
        }),
    ],
    [
      'a wrong index accessor type',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.accessors[1].type = 'VEC2';
        }),
    ],
    [
      'a non-integer accessor count',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.accessors[0].count = '8055';
        }),
    ],
    [
      'a non-integer bufferView length',
      () =>
        rebuiltFixtureGlb(({ document }) => {
          document.bufferViews[0].byteLength = '96660';
        }),
    ],
  ])(
    'rejects hostile embedded GLB layout: %s after GLTF parse and before witness hashing',
    async (_name, arrange) => {
      const bytes = arrange();
      const manifest = validDiceRuntimeManifest();
      manifest.presets[0].model.sizeBytes = bytes.byteLength;
      const fetchMock = arrangeFetches(manifest, bytes);
      const digest = arrangeDigest();
      arrangeSuccessfulParse();

      const first = preloadDiceRuntimePreset(PRESET_ID);
      const second = preloadDiceRuntimePreset(PRESET_ID);
      await expect(first).rejects.toThrow(/witness geometry/i);
      await expect(second).rejects.toThrow(/witness geometry/i);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(digest).toHaveBeenCalledTimes(1);
      expect(loader.parse).toHaveBeenCalledTimes(1);
      expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
    }
  );

  it('rejects witness body-membership drift during strict manifest validation', async () => {
    const manifest = validDiceRuntimeManifest();
    manifest.presets[0].faceSettlementMap.entries['1'].witness.triangleIndices =
      [FIXTURE_D20_BODY_TRIANGLE_COUNT];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okBytesResponse(manifestBytes(manifest)));
    vi.stubGlobal('fetch', fetchMock);
    const digest = arrangeDigest();

    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
      /manifest validation/i
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(digest).not.toHaveBeenCalled();
    expect(loader.parse).not.toHaveBeenCalled();
    expect(getDiceRuntimePresetSnapshot(PRESET_ID).status).toBe('failed');
  });

  it('fails when the declared glTF node references the wrong mesh index', async () => {
    arrangeFetches();
    arrangeDigest();
    arrangeSuccessfulParse(validGltf({ meshIndex: 1 }));

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/binding/i);
    await expect(second).rejects.toThrow(/binding/i);

    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
      status: 'failed',
      failureReason: expect.stringMatching(/binding/i),
    });
  });

  it('coalesces GLTF parser failure as terminal ownership', async () => {
    const fetchMock = arrangeFetches();
    const digest = arrangeDigest();
    loader.parse.mockImplementation(
      (
        _bytes: ArrayBuffer,
        _path: string,
        _onLoad: unknown,
        onError: (error: Error) => void
      ) => onError(new Error('parser exploded'))
    );

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow('parser exploded');
    await expect(second).rejects.toThrow('parser exploded');
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(
      'parser exploded'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(getDiceRuntimePresetSnapshot(PRESET_ID)).toMatchObject({
      status: 'failed',
      failureReason: 'parser exploded',
    });
  });
});
