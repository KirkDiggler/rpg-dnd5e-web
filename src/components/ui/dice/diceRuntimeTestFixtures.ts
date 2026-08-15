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

export function validDiceRuntimeManifest(kind: FixtureDieKind = 'd20') {
  const supportedResults = [...FIXTURE_EXPECTED_RESULTS[kind]];
  return {
    $schemaVersion: 1,
    contract: 'dice-runtime-presets',
    generatedBy: 'build_dice_runtime_manifest@1.0.0',
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
          sha256: 'a'.repeat(64),
          sizeBytes: 3,
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
            triangles: 2,
            materials: 0,
            textures: 0,
          },
          geometry: {
            kind: 'single-mesh-triangle-groups',
            totalTriangles: 2,
            bodyTriangleIndices: [0],
            numeralTriangleIndices: [1],
          },
        },
        faceSettlementMap: {
          supportedResults,
          entries: Object.fromEntries(
            supportedResults.map((result, faceIndex) => [
              String(result),
              { faceIndex, quaternion: [0, 0, 0, 1] },
            ])
          ),
        },
      },
    ],
  };
}
