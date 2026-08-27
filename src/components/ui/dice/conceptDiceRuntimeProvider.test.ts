import { createHash } from 'node:crypto';
import { Group, Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetConceptDiceRuntimeProviderForTests,
  getConceptDiceRuntimePresetSnapshot,
  preloadConceptDiceRuntimePreset,
} from './conceptDiceRuntimeProvider';
import {
  FIXTURE_MODEL_BYTES,
  FIXTURE_MODEL_SHA256,
  validDiceRuntimeManifest,
  type FixtureDieKind,
} from './diceRuntimeTestFixtures';

const loader = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parse = loader.parse;
  },
}));

const MANIFEST_URL = '/models/custom-dice/dice-tray-presets.json';
const CONCEPT_KINDS = ['d4', 'd6', 'd8', 'd10', 'd12'] as const;

type ConceptKind = (typeof CONCEPT_KINDS)[number];

function conceptManifest(kind: FixtureDieKind = 'd6') {
  const manifest = structuredClone(validDiceRuntimeManifest(kind));
  const preset = manifest.presets[0];
  preset.presetId = `dice.original.carved.${kind}`;
  preset.model.path = `original-set/Original_${kind.toUpperCase()}_Source.glb`;
  return manifest;
}

function okResponse(bytes: Uint8Array) {
  return {
    ok: true,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  };
}

function manifestBytes(manifest: unknown) {
  return new TextEncoder().encode(JSON.stringify(manifest));
}

function arrangeDigest() {
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn(
        async (_algorithm: string, bytes: ArrayBufferView) =>
          Uint8Array.from(
            Buffer.from(
              createHash('sha256')
                .update(
                  new Uint8Array(
                    bytes.buffer,
                    bytes.byteOffset,
                    bytes.byteLength
                  )
                )
                .digest('hex'),
              'hex'
            )
          ).buffer
      ),
    },
  });
}

function arrangeGltf(
  kind: ConceptKind = 'd6',
  options: { meshIndex?: number; scene?: Object3D } = {}
) {
  const manifest = conceptManifest(kind);
  const selectors = manifest.presets[0].model.selectors;
  const scene = options.scene ?? new Group();
  if (!scene.getObjectByName(selectors.objectNode)) {
    const node = new Object3D();
    node.name = selectors.objectNode;
    scene.add(node);
  }
  const gltf = {
    scene,
    parser: {
      json: {
        nodes: [{ name: selectors.objectNode, mesh: options.meshIndex ?? 0 }],
        meshes: [{ name: selectors.meshDefinition }],
      },
    },
  };
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
  manifest = conceptManifest(),
  modelBytes: Uint8Array = FIXTURE_MODEL_BYTES
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(okResponse(manifestBytes(manifest)))
    .mockResolvedValueOnce(okResponse(modelBytes));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  __resetConceptDiceRuntimeProviderForTests();
  loader.parse.mockReset();
  vi.unstubAllGlobals();
});

describe('concept dice runtime provider', () => {
  it.each(CONCEPT_KINDS)(
    'loads only the exact carved single-mesh concept preset for %s',
    async (kind) => {
      const manifest = conceptManifest(kind);
      const fetchMock = arrangeFetches(manifest);
      arrangeDigest();
      const gltf = arrangeGltf(kind);

      await preloadConceptDiceRuntimePreset(manifest.presets[0].presetId);

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        MANIFEST_URL,
        `/models/custom-dice/${manifest.presets[0].model.path}`,
      ]);
      expect(
        getConceptDiceRuntimePresetSnapshot(manifest.presets[0].presetId)
      ).toMatchObject({
        status: 'ready',
        assurance: 'provisional-concept',
        preset: {
          presetId: manifest.presets[0].presetId,
          dieKind: kind,
          model: {
            sha256: FIXTURE_MODEL_SHA256,
            sizeBytes: FIXTURE_MODEL_BYTES.byteLength,
          },
        },
        scene: gltf.scene,
        binding: {
          objectNode: manifest.presets[0].model.selectors.objectNode,
          meshDefinition: manifest.presets[0].model.selectors.meshDefinition,
          meshDefinitionIndex: 0,
        },
      });
      expect(
        getConceptDiceRuntimePresetSnapshot(manifest.presets[0].presetId)
          .assurance
      ).toBe('provisional-concept');
    }
  );

  it('coalesces concurrent concept owners and preserves one immutable source scene', async () => {
    const manifest = conceptManifest('d6');
    const fetchMock = arrangeFetches(manifest);
    arrangeDigest();
    const gltf = arrangeGltf('d6');

    const first = preloadConceptDiceRuntimePreset(manifest.presets[0].presetId);
    const second = preloadConceptDiceRuntimePreset(
      manifest.presets[0].presetId
    );

    expect(first).toBe(second);
    expect(
      getConceptDiceRuntimePresetSnapshot(manifest.presets[0].presetId)
    ).toMatchObject({ status: 'loading', assurance: 'provisional-concept' });
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    const firstSnapshot = getConceptDiceRuntimePresetSnapshot(
      manifest.presets[0].presetId
    );
    const secondSnapshot = getConceptDiceRuntimePresetSnapshot(
      manifest.presets[0].presetId
    );
    expect(firstSnapshot.scene).toBe(gltf.scene);
    expect(secondSnapshot.scene).toBe(gltf.scene);
    expect(firstSnapshot.preset).toBe(secondSnapshot.preset);
    expect(firstSnapshot.binding).toBe(secondSnapshot.binding);
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
  });

  it.each([
    'dice.original.carved.d20',
    'dice.original.carved.d10-percentile',
    'dice.original.painted-numbers.d6',
    'https://evil.test/caller-selected.glb',
    'dice.original.carved.d6/../d20',
  ])(
    'rejects non-concept or unsafe ID %s without model I/O',
    async (presetId) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const first = preloadConceptDiceRuntimePreset(presetId);
      const second = preloadConceptDiceRuntimePreset(presetId);

      expect(first).toBe(second);
      await expect(first).rejects.toThrow(/allowlist|concept/i);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(loader.parse).not.toHaveBeenCalled();
      expect(getConceptDiceRuntimePresetSnapshot(presetId)).toMatchObject({
        status: 'failed',
        assurance: 'provisional-concept',
      });
    }
  );

  it('rejects an ID whose preset kind does not match its carved concept suffix', async () => {
    const manifest = conceptManifest('d8');
    manifest.presets[0].presetId = 'dice.original.carved.d6';
    const fetchMock = arrangeFetches(manifest);
    arrangeDigest();

    await expect(
      preloadConceptDiceRuntimePreset('dice.original.carved.d6')
    ).rejects.toThrow(/kind|contract|mismatch/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loader.parse).not.toHaveBeenCalled();
  });

  it.each([
    ['byte size', new Uint8Array([1, 2])],
    ['SHA-256', FIXTURE_MODEL_BYTES],
  ])(
    'rejects a concept model with a bad %s before readiness',
    async (label, bytes) => {
      const manifest = conceptManifest('d6');
      if (label === 'SHA-256')
        manifest.presets[0].model.sha256 = 'c'.repeat(64);
      const fetchMock = arrangeFetches(manifest, bytes);
      arrangeDigest();
      arrangeGltf('d6');

      await expect(
        preloadConceptDiceRuntimePreset(manifest.presets[0].presetId)
      ).rejects.toThrow(/size|hash/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(loader.parse).not.toHaveBeenCalled();
    }
  );

  it('rejects a wrong exact glTF object-node to mesh-definition binding', async () => {
    const manifest = conceptManifest('d6');
    arrangeFetches(manifest);
    arrangeDigest();
    arrangeGltf('d6', { meshIndex: 1 });

    await expect(
      preloadConceptDiceRuntimePreset(manifest.presets[0].presetId)
    ).rejects.toThrow(/binding/i);
    expect(
      getConceptDiceRuntimePresetSnapshot(manifest.presets[0].presetId)
    ).toMatchObject({
      status: 'failed',
      assurance: 'provisional-concept',
      failureReason: expect.stringMatching(/binding/i),
    });
  });

  it('does not claim semantic witness correctness while retaining strict structure', async () => {
    const manifest = conceptManifest('d6');
    for (const entry of Object.values(
      manifest.presets[0].faceSettlementMap.entries
    ))
      entry.witness.readDirection = [1, 0, 0];
    arrangeFetches(manifest);
    arrangeDigest();
    arrangeGltf('d6');

    await preloadConceptDiceRuntimePreset(manifest.presets[0].presetId);

    expect(
      getConceptDiceRuntimePresetSnapshot(manifest.presets[0].presetId)
    ).toMatchObject({ status: 'ready', assurance: 'provisional-concept' });
  });
});
