import { describe, expect, it } from 'vitest';
import { parseDiceRuntimeManifest } from './diceRuntimeManifest';
import {
  FIXTURE_EXPECTED_RESULTS,
  validDiceRuntimeManifest,
  type FixtureDieKind,
} from './diceRuntimeTestFixtures';

type ManifestFixture = ReturnType<typeof validDiceRuntimeManifest>;

function cloneFixture(kind: FixtureDieKind = 'd20'): ManifestFixture {
  return structuredClone(validDiceRuntimeManifest(kind));
}

function expectRejected(value: unknown) {
  const result = parseDiceRuntimeManifest(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
}

describe('parseDiceRuntimeManifest', () => {
  it('strictly reconstructs, retains, and recursively freezes a valid manifest', () => {
    const inbound = validDiceRuntimeManifest();
    const result = parseDiceRuntimeManifest(inbound);

    expect(result).toMatchObject({ ok: true, manifest: inbound });
    if (!result.ok) throw Error(result.reason);
    const { manifest } = result;
    expect(manifest).not.toBe(inbound);
    expect(manifest.presets).not.toBe(inbound.presets);
    expect(manifest.presets[0]).not.toBe(inbound.presets[0]);
    expect(manifest.generatedBy).toBe('build_dice_runtime_manifest@2.0.0');
    expect(manifest.runtimeRoot).toBe('harness/models/custom-dice');
    expect(manifest.coordinateContract).toEqual(inbound.coordinateContract);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.coordinateContract)).toBe(true);
    expect(Object.isFrozen(manifest.presets)).toBe(true);
    expect(Object.isFrozen(manifest.presets[0].model.bounds.bboxMin)).toBe(
      true
    );
    const geometry = manifest.presets[0].model.geometry;
    expect(geometry.kind).toBe('single-mesh-triangle-groups');
    if (geometry.kind !== 'single-mesh-triangle-groups')
      throw Error('expected carved fixture geometry');
    expect(Object.isFrozen(geometry.bodyTriangleIndices)).toBe(true);
    const settlementEntry = manifest.presets[0].faceSettlementMap.entries['1'];
    expect(Object.isFrozen(settlementEntry)).toBe(true);
    expect(Object.isFrozen(settlementEntry.quaternion)).toBe(true);
    expect(Object.isFrozen(settlementEntry.witness)).toBe(true);
    expect(Object.isFrozen(settlementEntry.witness.readDirection)).toBe(true);
    expect(settlementEntry.witness.kind).toBe('runtime-face-triangles');
    if (settlementEntry.witness.kind !== 'runtime-face-triangles')
      throw Error('expected direct face witness');
    expect(Object.isFrozen(settlementEntry.witness.triangleIndices)).toBe(true);
    expect(Object.isFrozen(inbound)).toBe(false);
  });

  it.each(Object.keys(FIXTURE_EXPECTED_RESULTS) as FixtureDieKind[])(
    'accepts the exact settlement result set for %s',
    (kind) => {
      const result = parseDiceRuntimeManifest(validDiceRuntimeManifest(kind));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(
          result.manifest.presets[0].faceSettlementMap.supportedResults
        ).toEqual(FIXTURE_EXPECTED_RESULTS[kind]);
      }
    }
  );

  it('accepts a matching multi-node selector and geometry discriminator', () => {
    const value = cloneFixture();
    value.presets[0].model.selectors = {
      kind: 'multi-node',
      rootObjectNode: 'root',
      shellObjectNode: 'shell',
      numeralObjectNodeCount: 20,
    } as never;
    value.presets[0].model.geometry = { kind: 'multi-node' } as never;
    for (const entry of Object.values(
      value.presets[0].faceSettlementMap.entries
    )) {
      entry.witness = {
        kind: 'runtime-direction',
        readKind: 'face',
        readIndex: entry.witness.readIndex,
        readDirection: [0, 0, 1],
      } as never;
    }

    expect(parseDiceRuntimeManifest(value).ok).toBe(true);
  });

  it('preserves the alt-D4 three-vertex-label multi-node direction contract', () => {
    const value = cloneFixture('d4');
    value.presets[0].model.selectors = {
      kind: 'multi-node',
      rootObjectNode: 'root',
      shellObjectNode: 'shell',
      numeralObjectNodeCount: 12,
    } as never;
    value.presets[0].model.geometry = { kind: 'multi-node' } as never;
    value.presets[0].faceSettlementMap.entries['1'].witness = {
      kind: 'runtime-direction',
      readKind: 'vertex',
      readIndex: 0,
      readDirection: [0, 0, 1],
    } as never;

    expect(parseDiceRuntimeManifest(value).ok).toBe(true);
  });

  it.each([
    [
      'manifest',
      (value: ManifestFixture) => Object.assign(value, { extra: 1 }),
    ],
    [
      'coordinate contract',
      (value: ManifestFixture) =>
        Object.assign(value.coordinateContract, { authoringAxis: 'Z-up' }),
    ],
    [
      'preset',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0], { authoringSource: 'private.blend' }),
    ],
    [
      'model',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].model, { sourcePath: 'private.blend' }),
    ],
    [
      'selectors',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].model.selectors, { meshIndex: 0 }),
    ],
    [
      'bounds',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].model.bounds, { radius: 1 }),
    ],
    [
      'mesh facts',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].model.meshFacts, { vertices: 4 }),
    ],
    [
      'geometry',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].model.geometry, { faceGroups: [] }),
    ],
    [
      'settlement map',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].faceSettlementMap, {
          source: 'authoring',
        }),
    ],
    [
      'settlement entry',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].faceSettlementMap.entries['1'], {
          faceNormal: [0, 1, 0],
        }),
    ],
    [
      'result witness',
      (value: ManifestFixture) =>
        Object.assign(value.presets[0].faceSettlementMap.entries['1'].witness, {
          resultTag: 'D20_Result_01',
        }),
    ],
  ])('rejects unknown or authoring keys in the %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it.each([
    ['$schemaVersion', 1],
    ['contract', 'dice-presets'],
    ['generatedBy', 'build_dice_runtime_manifest@1.0.0'],
    ['runtimeRoot', '/models/custom-dice'],
  ])('rejects a wrong %s contract literal', (key, replacement) => {
    const value = cloneFixture() as unknown as Record<string, unknown>;
    value[key] = replacement;
    expectRejected(value);
  });

  it.each([
    '',
    '.dice',
    'dice.',
    'dice..d20',
    'dice/original',
    'dice\\original',
    'dice:original',
    'dice%2eoriginal',
    'https://evil.test',
    '../dice',
    'Dice.original',
    `dice.${'a'.repeat(33)}`,
    Array.from({ length: 8 }, () => 'abcdefgh').join('.'),
    'a.a.a.a.a.a.a.a.a',
  ])('rejects the unsafe bounded preset ID %s', (presetId) => {
    const value = cloneFixture();
    value.presets[0].presetId = presetId;
    expectRejected(value);
  });

  it('requires the family ID to use the same bounded identifier grammar', () => {
    const value = cloneFixture();
    value.presets[0].familyId = 'Dice/original';
    expectRejected(value);
  });

  it.each([
    '',
    '../Original_D20.glb',
    'original-set/../Original_D20.glb',
    '/models/Original_D20.glb',
    'https://evil.test/Original_D20.glb',
    'data:model/gltf-binary;base64,AA==',
    'original-set\\Original_D20.glb',
    'original-set/Original_D20.glb?version=1',
    'original-set/not-a-glb.bin',
  ])('rejects non-runtime-relative model path %s', (path) => {
    const value = cloneFixture();
    value.presets[0].model.path = path;
    expectRejected(value);
  });

  it.each(['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`])(
    'rejects malformed lowercase SHA-256 %s',
    (sha256) => {
      const value = cloneFixture();
      value.presets[0].model.sha256 = sha256;
      expectRejected(value);
    }
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid exact model byte size %s',
    (sizeBytes) => {
      const value = cloneFixture();
      value.presets[0].model.sizeBytes = sizeBytes;
      expectRejected(value);
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite bounds component %s',
    (component) => {
      const value = cloneFixture();
      value.presets[0].model.bounds.bboxMin[0] = component;
      expectRejected(value);
    }
  );

  it.each([
    [
      'zero dimension',
      (value: ManifestFixture) => {
        value.presets[0].model.bounds.dimensions[0] = 0;
      },
    ],
    [
      'negative dimension',
      (value: ManifestFixture) => {
        value.presets[0].model.bounds.dimensions[0] = -2;
      },
    ],
    [
      'reversed minimum and maximum',
      (value: ManifestFixture) => {
        value.presets[0].model.bounds.bboxMin[0] = 2;
        value.presets[0].model.bounds.bboxMax[0] = 1;
        value.presets[0].model.bounds.dimensions[0] = -1;
      },
    ],
    [
      'all-zero bounds',
      (value: ManifestFixture) => {
        value.presets[0].model.bounds.bboxMin = [0, 0, 0];
        value.presets[0].model.bounds.bboxMax = [0, 0, 0];
        value.presets[0].model.bounds.dimensions = [0, 0, 0];
      },
    ],
    [
      'dimension outside reconciliation tolerance',
      (value: ManifestFixture) => {
        value.presets[0].model.bounds.dimensions[0] = 2.000002;
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it('uses 0.000001 only as reconciliation tolerance, not a positivity threshold', () => {
    const atTolerance = cloneFixture();
    atTolerance.presets[0].model.bounds.dimensions[0] = 2.000001;
    expect(parseDiceRuntimeManifest(atTolerance).ok).toBe(true);

    const tinyPositive = cloneFixture();
    tinyPositive.presets[0].model.bounds.bboxMin[0] = 0;
    tinyPositive.presets[0].model.bounds.bboxMax[0] = 0.0000001;
    tinyPositive.presets[0].model.bounds.dimensions[0] = 0.0000001;
    expect(parseDiceRuntimeManifest(tinyPositive).ok).toBe(true);
  });

  it.each([
    [
      'unknown selector kind',
      (value: ManifestFixture) => {
        value.presets[0].model.selectors.kind = 'mesh' as never;
      },
    ],
    [
      'empty object node',
      (value: ManifestFixture) => {
        value.presets[0].model.selectors.objectNode = '';
      },
    ],
    [
      'selector/geometry discriminator mismatch',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry = { kind: 'multi-node' } as never;
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it.each([
    ['primitiveCount', 0],
    ['primitiveCount', 1.5],
    ['triangles', 0],
    ['materials', -1],
    ['textures', 0.5],
  ])('rejects invalid mesh fact %s=%s', (key, replacement) => {
    const value = cloneFixture();
    const facts = value.presets[0].model.meshFacts as unknown as Record<
      string,
      unknown
    >;
    facts[key] = replacement;
    expectRejected(value);
  });

  it.each([
    [
      'partition overlap',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry.numeralTriangleIndices = [0, 20];
      },
    ],
    [
      'partition gap',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry.numeralTriangleIndices = [];
      },
    ],
    [
      'partition out of range',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry.numeralTriangleIndices = [21];
      },
    ],
    [
      'duplicate partition index',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry.bodyTriangleIndices = [0, 0];
      },
    ],
    [
      'wrong geometry triangle total',
      (value: ManifestFixture) => {
        value.presets[0].model.geometry.totalTriangles = 22;
      },
    ],
  ])('rejects a single-mesh geometry %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it.each([
    [
      'incomplete supported results',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.supportedResults.pop();
      },
    ],
    [
      'duplicate supported result',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.supportedResults[1] = 1;
      },
    ],
    [
      'non-canonical decimal result key',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['01'] =
          value.presets[0].faceSettlementMap.entries['1'];
        delete value.presets[0].faceSettlementMap.entries['1'];
      },
    ],
    [
      'extra result key',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['21'] = {
          quaternion: [0, 0, 0, 1],
          witness: {
            kind: 'runtime-direction',
            readKind: 'face',
            readIndex: 20,
            readDirection: [0, 0, 1],
          },
        } as never;
      },
    ],
    [
      'missing result entry',
      (value: ManifestFixture) => {
        delete value.presets[0].faceSettlementMap.entries['20'];
      },
    ],
  ])('rejects an invalid exact result set: %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it.each([
    [
      'negative face index',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].witness.readIndex = -1;
      },
    ],
    [
      'fractional face index',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].witness.readIndex = 0.5;
      },
    ],
    [
      'non-finite quaternion',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].quaternion[0] =
          Number.NaN;
      },
    ],
    [
      'all-zero quaternion',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].quaternion = [
          0, 0, 0, 0,
        ];
      },
    ],
    [
      'non-normalized quaternion',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].quaternion = [
          0, 0, 0, 2,
        ];
      },
    ],
  ])('rejects a settlement entry with %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it('rejects a complete legacy v1 settlement contract', () => {
    const value = cloneFixture();
    value.$schemaVersion = 1 as never;
    value.generatedBy = 'build_dice_runtime_manifest@1.0.0' as never;
    for (const [key, entry] of Object.entries(
      value.presets[0].faceSettlementMap.entries
    )) {
      value.presets[0].faceSettlementMap.entries[key] = {
        faceIndex: entry.witness.readIndex,
        quaternion: entry.quaternion,
      } as never;
    }
    expectRejected(value);
  });

  it('accepts both exact v2 witness discriminators', () => {
    const value = cloneFixture();
    value.presets[0].faceSettlementMap.entries['1'].witness = {
      kind: 'runtime-direction',
      readKind: 'face',
      readIndex: 0,
      readDirection: [0, 0, 1],
    } as never;

    expect(parseDiceRuntimeManifest(value).ok).toBe(true);
  });

  it.each([
    [
      'missing witness',
      (value: ManifestFixture) => {
        delete (
          value.presets[0].faceSettlementMap.entries['1'] as Partial<
            (typeof value.presets)[number]['faceSettlementMap']['entries'][string]
          >
        ).witness;
      },
    ],
    [
      'wrong triangle witness read kind',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].witness.readKind =
          'vertex' as never;
      },
    ],
    [
      'empty triangle witness',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleIndices = [];
      },
    ],
    [
      'duplicate triangle ordinal',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleIndices = [0, 0];
      },
    ],
    [
      'out-of-range triangle ordinal',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleIndices = [21];
      },
    ],
    [
      'triangle ordinal outside the body role',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleIndices = [20];
      },
    ],
    [
      'triangle ordinal shared by two results',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '2'
        ].witness.triangleIndices = [0];
      },
    ],
    [
      'malformed triangle digest',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries[
          '1'
        ].witness.triangleSignatureSha256 = 'A'.repeat(64);
      },
    ],
    [
      'face index reused by two results',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['2'].witness.readIndex = 0;
      },
    ],
    [
      'non-unit read direction',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].witness.readDirection =
          [0, 0, 2];
      },
    ],
    [
      'non-finite read direction',
      (value: ManifestFixture) => {
        value.presets[0].faceSettlementMap.entries['1'].witness.readDirection =
          [0, Number.NaN, 1];
      },
    ],
  ])('rejects a v2 witness with %s', (_name, mutate) => {
    const value = cloneFixture();
    mutate(value);
    expectRejected(value);
  });

  it('rejects unknown die kinds', () => {
    const value = cloneFixture();
    value.presets[0].dieKind = 'd100' as never;
    expectRejected(value);
  });

  it('rejects sparse or decorated arrays instead of copying partial values', () => {
    const sparse = cloneFixture();
    delete sparse.presets[0].model.bounds.bboxMin[1];
    expectRejected(sparse);

    const decorated = cloneFixture();
    Object.assign(decorated.presets, { authoringOrder: true });
    expectRejected(decorated);
  });

  it('returns a frozen generic failure when a getter throws a prototype-trapping Proxy', () => {
    const thrownProxy = new Proxy(Object.create(null) as object, {
      getPrototypeOf() {
        throw Error('hostile thrown-value prototype trap');
      },
    });
    const inbound = cloneFixture();
    Object.defineProperty(inbound.presets[0].model, 'path', {
      enumerable: true,
      get() {
        throw thrownProxy;
      },
    });

    let result: ReturnType<typeof parseDiceRuntimeManifest> | undefined;
    expect(() => {
      result = parseDiceRuntimeManifest(inbound);
    }).not.toThrow();
    expect(result).toEqual({
      ok: false,
      reason: 'manifest could not be safely inspected',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('fails closed instead of throwing for hostile getters and proxies at any depth', () => {
    const throwingGetter = cloneFixture();
    Object.defineProperty(throwingGetter.presets[0].model, 'path', {
      enumerable: true,
      get() {
        throw Error('hostile getter');
      },
    });
    const throwingProxy = cloneFixture();
    throwingProxy.presets[0].faceSettlementMap.entries = new Proxy(
      throwingProxy.presets[0].faceSettlementMap.entries,
      {
        ownKeys() {
          throw Error('hostile proxy');
        },
      }
    );

    expect(() => parseDiceRuntimeManifest(throwingGetter)).not.toThrow();
    expectRejected(throwingGetter);
    expect(() => parseDiceRuntimeManifest(throwingProxy)).not.toThrow();
    expectRejected(throwingProxy);
  });
});
