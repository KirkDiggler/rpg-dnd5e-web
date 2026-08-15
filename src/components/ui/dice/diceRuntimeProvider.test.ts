import { Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDiceRuntimeProviderForTests,
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
} from './diceRuntimeProvider';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';

const loader = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parse = loader.parse;
  },
}));

const PRESET_ID = 'dice.original.carved.d20';
const MANIFEST_URL = '/models/custom-dice/dice-tray-presets.json';
const MODEL_URL = '/models/custom-dice/original-set/Original_D20_Source.glb';
const MODEL_BYTES = new Uint8Array([1, 2, 3]);

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

function arrangeDigest(hexByte = 0xaa) {
  const digest = vi.fn(async () => new Uint8Array(32).fill(hexByte).buffer);
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

function arrangeFetches(manifest: unknown = validDiceRuntimeManifest()) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(okBytesResponse(manifestBytes(manifest)))
    .mockResolvedValueOnce(okBytesResponse(MODEL_BYTES));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
  it('coalesces concurrent witnesses around exact contract bytes, hash, and one source scene', async () => {
    const fixture = validDiceRuntimeManifest();
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
    expect(digest).toHaveBeenCalledTimes(1);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(loader.parse.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
    const firstSnapshot = getDiceRuntimePresetSnapshot(PRESET_ID);
    const secondSnapshot = getDiceRuntimePresetSnapshot(PRESET_ID);
    expect(firstSnapshot).toMatchObject({
      status: 'ready',
      preset: {
        presetId: PRESET_ID,
        model: { sha256: 'a'.repeat(64), sizeBytes: 3 },
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
      generatedBy: 'build_dice_runtime_manifest@1.0.0',
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
    const digest = arrangeDigest(0xbb);

    const first = preloadDiceRuntimePreset(PRESET_ID);
    const second = preloadDiceRuntimePreset(PRESET_ID);
    await expect(first).rejects.toThrow(/hash/i);
    await expect(second).rejects.toThrow(/hash/i);
    await expect(preloadDiceRuntimePreset(PRESET_ID)).rejects.toThrow(/hash/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
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
        digest: vi.fn(async () => {
          order.push('digest');
          return new Uint8Array(32).fill(0xaa).buffer;
        }),
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
      'digest',
      'parse',
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
