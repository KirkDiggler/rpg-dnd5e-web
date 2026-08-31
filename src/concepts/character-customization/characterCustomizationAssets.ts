export type CharacterCustomizationSlot = 'scalp' | 'facial-hair';

export interface CharacterCustomizationAsset {
  readonly slot: CharacterCustomizationSlot;
  readonly styleRef: string;
  readonly label: string;
  readonly sourceMesh: string;
  readonly url: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly weightedBoneNames: readonly string[];
}

export interface CharacterCustomizationBodyAsset {
  readonly url: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly boneCount: 63;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}

export const CHARACTER_CUSTOMIZATION_ASSET_ROOT =
  '/models/synty/concepts/character-customization/';

export const CHARACTER_CUSTOMIZATION_BODY: CharacterCustomizationBodyAsset =
  Object.freeze({
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}dwarf-fighter-body.glb`,
    byteSize: 786_668,
    sha256: '8d70f73d57abe0a1bb8ec4b6b45eda27fc7841a12479fe7c745ea0b7020d64f6',
    rigFamily: 'modular-fantasy-hero-v1',
    boneCount: 63,
    animations: ['Idle_Relaxed', 'Walk_Forward'] as const,
  });

export const SCALP_OPTIONS = Object.freeze([
  {
    slot: 'scalp',
    styleRef: 'modular-fantasy-hero:hair:04',
    label: 'Hair 04',
    sourceMesh: 'Chr_Hair_04',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}scalp/hair-04.glb`,
    byteSize: 36_936,
    sha256: 'cc896dc487bf18193ec2dbcd4f289711e45f9b1ecea468a1cb7582af1b154f2b',
    weightedBoneNames: ['Head'],
  },
  {
    slot: 'scalp',
    styleRef: 'modular-fantasy-hero:hair:08',
    label: 'Hair 08',
    sourceMesh: 'Chr_Hair_08',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}scalp/hair-08.glb`,
    byteSize: 40_888,
    sha256: 'a4b091376e152d022aef73021f20130c949c6a91ebd44a3fad6f398b42f19f97',
    weightedBoneNames: ['Head'],
  },
  {
    slot: 'scalp',
    styleRef: 'modular-fantasy-hero:hair:16',
    label: 'Hair 16',
    sourceMesh: 'Chr_Hair_16',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}scalp/hair-16.glb`,
    byteSize: 43_488,
    sha256: 'ff71f18f62e172125be519e800d62f26ff88db5ee25915341ff63f5e1df14f73',
    weightedBoneNames: ['Head'],
  },
] as const satisfies readonly CharacterCustomizationAsset[]);

export const FACIAL_HAIR_OPTIONS = Object.freeze([
  {
    slot: 'facial-hair',
    styleRef: 'modular-fantasy-hero:facial-hair:01',
    label: 'Facial Hair 01',
    sourceMesh: 'Chr_FacialHair_Male_01',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}facial-hair/facial-hair-01.glb`,
    byteSize: 55_064,
    sha256: '49ccf51ea94778445fb4b0fe068776d6f8e6a7d37ae76171315baf0a9c970255',
    weightedBoneNames: ['Head'],
  },
  {
    slot: 'facial-hair',
    styleRef: 'modular-fantasy-hero:facial-hair:02',
    label: 'Facial Hair 02',
    sourceMesh: 'Chr_FacialHair_Male_02',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}facial-hair/facial-hair-02.glb`,
    byteSize: 64_652,
    sha256: 'fab5f63914339fd1c12fd09a9145396906e7da5c378ef6f8f6c37edeb62f7890',
    weightedBoneNames: ['Head'],
  },
  {
    slot: 'facial-hair',
    styleRef: 'modular-fantasy-hero:facial-hair:03',
    label: 'Facial Hair 03',
    sourceMesh: 'Chr_FacialHair_Male_03',
    url: `${CHARACTER_CUSTOMIZATION_ASSET_ROOT}facial-hair/facial-hair-03.glb`,
    byteSize: 38_544,
    sha256: 'fd5cc26275a796b45dc3af5da492678ddb18165effc002fc86df02f6859a5108',
    weightedBoneNames: ['Head'],
  },
] as const satisfies readonly CharacterCustomizationAsset[]);

export const DEFAULT_SCALP_STYLE_REF = SCALP_OPTIONS[0].styleRef;
export const DEFAULT_FACIAL_HAIR_STYLE_REF = FACIAL_HAIR_OPTIONS[1].styleRef;

export const CHARACTER_CUSTOMIZATION_ASSETS = Object.freeze([
  CHARACTER_CUSTOMIZATION_BODY,
  ...SCALP_OPTIONS,
  ...FACIAL_HAIR_OPTIONS,
]);

export function optionsForSlot(
  slot: CharacterCustomizationSlot
): readonly CharacterCustomizationAsset[] {
  return slot === 'scalp' ? SCALP_OPTIONS : FACIAL_HAIR_OPTIONS;
}

export function defaultStyleRefForSlot(
  slot: CharacterCustomizationSlot
): string {
  return slot === 'scalp'
    ? DEFAULT_SCALP_STYLE_REF
    : DEFAULT_FACIAL_HAIR_STYLE_REF;
}
