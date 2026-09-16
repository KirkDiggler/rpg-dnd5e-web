import type { MaterialEditorManifest } from './materialRecipe';

const SHA = (n: number) => n.toString(16).repeat(64);
const SOURCE_PATH = 'FBX/SM_Bld_Wall_L_Curve_01.fbx';
const OBJECT_NAME = 'SM_Bld_Wall_L_Curve_01';
export const SLOT_MATERIAL_NAMES = ['Stone_01', 'Brick_Medium_01'];

/** The editing profile exactly as the producer serializes it (wire format). */
export interface WireEditingProfile {
  schemaVersion: 2;
  profileId: string;
  packSlug: string;
  packVersion: string;
  definitions: Record<
    string,
    {
      label: string;
      baseColor: { image: string | null };
      normal: { image: string; strength: number } | null;
      emissive: {
        image: string | null;
        color: string;
        strength: number;
      } | null;
      wrap: 'repeat' | 'clamp';
    }
  >;
  assignments: {
    familyDefaults: Record<string, string>;
    slotOverrides: {
      sourcePath: string;
      objectName: string;
      slot: number;
      definition: string;
    }[];
  };
  selections: Record<string, string | null>;
}

export type RawMaterialEditorManifest = Omit<
  MaterialEditorManifest,
  'profile'
> & { profile: WireEditingProfile };

/** Raw manifest exactly as the producer's _prepare_editing_locked emits it. */
export function materialEditorManifestFixture(): RawMaterialEditorManifest {
  return {
    schemaVersion: 3,
    mode: 'material-editor',
    profile: {
      schemaVersion: 2,
      profileId: 'dark-fortress-editor-demo',
      packSlug: 'polygon-dark-fortress',
      packVersion: 'v3',
      definitions: {
        'wall-stone': {
          label: 'Wall stone',
          baseColor: { image: 'Texture/Stone_Texture_01.png' },
          normal: null,
          emissive: null,
          wrap: 'repeat',
        },
      },
      assignments: {
        familyDefaults: { Stone_01: 'wall-stone' },
        slotOverrides: [],
      },
      selections: {},
    },
    profileSha256: SHA(1),
    catalogSha256: SHA(2),
    catalog: {
      schemaVersion: 1,
      packSlug: 'polygon-dark-fortress',
      packVersion: 'v3',
      inputSha256: SHA(3),
      families: [
        {
          id: 'Stone_01',
          label: 'Stone 01',
          kind: 'atlas',
          uses: [
            {
              sourcePath: SOURCE_PATH,
              sourceSha256: SHA(4),
              group: 'environment',
              objectName: OBJECT_NAME,
              slot: 0,
              declaredMaterial: 'Stone_01',
            },
          ],
          options: [],
          recommendedOptionId: null,
          reasons: [],
        },
        {
          id: 'Brick_Medium_01',
          label: 'Brick Medium 01',
          kind: 'unresolved',
          uses: [
            {
              sourcePath: SOURCE_PATH,
              sourceSha256: SHA(4),
              group: 'environment',
              objectName: OBJECT_NAME,
              slot: 1,
              declaredMaterial: 'Brick_Medium_01',
            },
          ],
          options: [],
          recommendedOptionId: null,
          reasons: [],
        },
      ],
    },
    sourceAudit: { sourceCount: 1, verifiedCount: 1, exceptions: [] },
    auditedSlots: {
      [SOURCE_PATH]: {
        sourceSha256: SHA(4),
        objects: {
          [OBJECT_NAME]: {
            materialIndices: [0, 1],
            materialNames: SLOT_MATERIAL_NAMES,
            meshDataName: 'Mesh',
            slotCount: 2,
            topologySha256: SHA(5),
            uvSha256: SHA(6),
            usedSlots: [0, 1],
          },
        },
      },
    },
    inventory: {
      schemaVersion: 1,
      images: [
        {
          path: 'Texture/Stone_Texture_01.png',
          sha256: SHA(7),
          bytes: 128,
          format: 'png',
          url: `/models/synty/asset-review-editor/images/${SHA(7)}.png`,
        },
        {
          path: 'Texture/Clay_Texture_01.tga',
          sha256: SHA(8),
          bytes: 256,
          format: 'tga',
          preview: {
            url: `/models/synty/asset-review-editor/images/${SHA(9)}.png`,
            sha256: SHA(9),
            format: 'png',
          },
        },
      ],
    },
    recipes: {
      recipeBindings: [
        {
          sourcePath: SOURCE_PATH,
          objectName: OBJECT_NAME,
          slot: 0,
          materialName: 'Stone_01',
          definition: 'wall-stone',
          scope: 'family-default',
          overriddenDefault: null,
          channels: {
            baseColor: {
              path: 'Texture/Stone_Texture_01.png',
              sha256: SHA(7),
            },
            normal: null,
            emissive: null,
            wrap: 'repeat',
          },
        },
      ],
      optionBindings: [],
      unassignedActualSlots: [[SOURCE_PATH, OBJECT_NAME, 1]],
      unusedDefinitions: [],
    },
    editor: {
      schemaVersion: 1,
      sources: [
        {
          sourcePath: SOURCE_PATH,
          sourceSha256: SHA(4),
          glb: {
            url: `/models/synty/asset-review-editor/models/${SHA(10)}.glb`,
            sha256: SHA(10),
          },
          layoutReportSha256: SHA(11),
          editorReportSha256: SHA(12),
          targets: [
            {
              objectName: OBJECT_NAME,
              slot: 0,
              materialName: `MaterialReviewSlot_${OBJECT_NAME}_0`,
              faceCount: 12,
              rendered: true,
              target: {
                mesh: 0,
                primitive: 0,
                material: 0,
                materialName: `MaterialReviewSlot_${OBJECT_NAME}_0`,
              },
            },
            {
              objectName: OBJECT_NAME,
              slot: 1,
              materialName: `MaterialReviewSlot_${OBJECT_NAME}_1`,
              faceCount: 6,
              rendered: true,
              target: {
                mesh: 0,
                primitive: 1,
                material: 1,
                materialName: `MaterialReviewSlot_${OBJECT_NAME}_1`,
              },
            },
          ],
        },
      ],
    },
  };
}

export const FIXTURE_SOURCE_PATH = SOURCE_PATH;
export const FIXTURE_OBJECT_NAME = OBJECT_NAME;
