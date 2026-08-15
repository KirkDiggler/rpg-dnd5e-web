import { createHash } from 'node:crypto';

export type FixtureDieKind =
  | 'd20'
  | 'd12'
  | 'd10-percentile'
  | 'd10'
  | 'd8'
  | 'd6'
  | 'd4';

export const FIXTURE_EXPECTED_RESULTS: Readonly<
  Record<FixtureDieKind, readonly number[]>
> = {
  d20: Array.from({ length: 20 }, (_, index) => index + 1),
  d12: Array.from({ length: 12 }, (_, index) => index + 1),
  'd10-percentile': [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
  d10: Array.from({ length: 10 }, (_, index) => index + 1),
  d8: Array.from({ length: 8 }, (_, index) => index + 1),
  d6: Array.from({ length: 6 }, (_, index) => index + 1),
  d4: Array.from({ length: 4 }, (_, index) => index + 1),
};

const FIXTURE_DIRECTIONS = Array.from(
  { length: 21 },
  (_, triangleIndex) =>
    (triangleIndex === 1
      ? [1, 0, 0]
      : triangleIndex === 20
        ? [0, 0, -1]
        : [0, 0, 1]) as [number, number, number]
);

const FIXTURE_TRIANGLES = FIXTURE_DIRECTIONS.map(([x, , z]) =>
  x === 1
    ? ([
        [3, 0, 0],
        [3, 1, 0],
        [3, 0, 1],
      ] as const)
    : z === -1
      ? ([
          [0, 0, -3],
          [0, 1, -3],
          [1, 0, -3],
        ] as const)
      : ([
          [0, 0, 3],
          [1, 0, 3],
          [0, 1, 3],
        ] as const)
);

function paddedLength(length: number) {
  return Math.ceil(length / 4) * 4;
}

function buildFixtureGlb() {
  const positionByteLength = FIXTURE_TRIANGLES.length * 3 * 3 * 4;
  const indexByteOffset = positionByteLength;
  const indexByteLength = FIXTURE_TRIANGLES.length * 3 * 2;
  const binaryByteLength = indexByteOffset + indexByteLength;
  const binary = new Uint8Array(paddedLength(binaryByteLength));
  const binaryView = new DataView(binary.buffer);
  let positionOffset = 0;
  let vertexIndex = 0;
  for (const triangle of FIXTURE_TRIANGLES) {
    for (const vertex of triangle) {
      for (const component of vertex) {
        binaryView.setFloat32(positionOffset, component, true);
        positionOffset += 4;
      }
      vertexIndex += 1;
    }
  }
  for (let index = 0; index < vertexIndex; index += 1) {
    binaryView.setUint16(indexByteOffset + index * 2, index, true);
  }

  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: 'Original_D20_Source_NO_MATERIALS',
        mesh: 0,
      },
    ],
    meshes: [
      {
        name: 'Original_D20_Source_NO_MATERIALS_mesh',
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertexIndex,
        type: 'VEC3',
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: vertexIndex,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionByteLength },
      {
        buffer: 0,
        byteOffset: indexByteOffset,
        byteLength: indexByteLength,
      },
    ],
    buffers: [{ byteLength: binaryByteLength }],
  };
  const encodedDocument = new TextEncoder().encode(JSON.stringify(document));
  const json = new Uint8Array(paddedLength(encodedDocument.byteLength));
  json.fill(0x20);
  json.set(encodedDocument);

  const totalLength = 12 + 8 + json.byteLength + 8 + binary.byteLength;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  const binaryHeaderOffset = 20 + json.byteLength;
  view.setUint32(binaryHeaderOffset, binary.byteLength, true);
  view.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  const binaryOffset = binaryHeaderOffset + 8;
  bytes.set(binary, binaryOffset);

  return {
    bytes,
    positionByteOffset: binaryOffset,
    indexByteOffset: binaryOffset + indexByteOffset,
  };
}

const FIXTURE_GLB = buildFixtureGlb();

export const FIXTURE_MODEL_BYTES = FIXTURE_GLB.bytes;
export const FIXTURE_POSITION_BYTE_OFFSET = FIXTURE_GLB.positionByteOffset;
export const FIXTURE_INDEX_BYTE_OFFSET = FIXTURE_GLB.indexByteOffset;
export const FIXTURE_MODEL_SHA256 = createHash('sha256')
  .update(FIXTURE_MODEL_BYTES)
  .digest('hex');

function pythonFloat(value: number) {
  if (Object.is(value, -0) || value === 0) return '0.0';
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function fixtureTriangleDigest(triangleIndex: number) {
  const vertices = [...FIXTURE_TRIANGLES[triangleIndex]].sort((left, right) => {
    for (let axis = 0; axis < 3; axis += 1) {
      if (left[axis] !== right[axis]) return left[axis] - right[axis];
    }
    return 0;
  });
  const signature = `[${vertices
    .map((vertex) => `[${vertex.map(pythonFloat).join(',')}]`)
    .join(',')}]`;
  return createHash('sha256').update(`[${signature}]`, 'ascii').digest('hex');
}

export function validDiceRuntimeManifest(kind: FixtureDieKind = 'd20') {
  const supportedResults = [...FIXTURE_EXPECTED_RESULTS[kind]];
  const bodyTriangleIndices = Array.from({ length: 20 }, (_, index) => index);
  return {
    $schemaVersion: 2,
    contract: 'dice-runtime-presets',
    generatedBy: 'build_dice_runtime_manifest@2.0.0',
    sourceManifestSha256: 'b'.repeat(64),
    runtimeRoot: 'harness/models/custom-dice',
    coordinateContract: {
      assetUpAxis: 'Y-up glTF',
      assetUnits: 'glTF scene units',
      quaternionConvention: 'x,y,z,w',
      settlementMapMeaning:
        'Rotate the authored die so the selected result is uppermost.',
    },
    presets: [
      {
        presetId: 'dice.original.carved.d20',
        displayName: 'Original Carved D20',
        familyId: 'dice.original.carved',
        dieKind: kind,
        model: {
          path: 'original-set/Original_D20_Source.glb',
          sha256: FIXTURE_MODEL_SHA256,
          sizeBytes: FIXTURE_MODEL_BYTES.byteLength,
          selectors: {
            kind: 'single-mesh',
            objectNode: 'Original_D20_Source_NO_MATERIALS',
            meshDefinition: 'Original_D20_Source_NO_MATERIALS_mesh',
          },
          bounds: {
            bboxMin: [-1, -1, -1],
            bboxMax: [1, 1, 1],
            dimensions: [2, 2, 2],
          },
          meshFacts: {
            primitiveCount: 1,
            triangles: 21,
            materials: 0,
            textures: 0,
          },
          geometry: {
            kind: 'single-mesh-triangle-groups',
            totalTriangles: 21,
            bodyTriangleIndices,
            numeralTriangleIndices: [20],
          },
        },
        faceSettlementMap: {
          supportedResults,
          entries: Object.fromEntries(
            supportedResults.map((result, readIndex) => [
              String(result),
              {
                quaternion: [0, 0, 0, 1],
                witness:
                  kind === 'd20'
                    ? {
                        kind: 'runtime-face-triangles',
                        readKind: 'face',
                        readIndex,
                        readDirection: [...FIXTURE_DIRECTIONS[readIndex]],
                        triangleIndices: [readIndex],
                        triangleSignatureSha256:
                          fixtureTriangleDigest(readIndex),
                      }
                    : {
                        kind: 'runtime-direction',
                        readKind: 'face',
                        readIndex,
                        readDirection: [0, 0, 1],
                      },
              },
            ])
          ),
        },
      },
    ],
  };
}
