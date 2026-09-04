/**
 * GENERATED FILE — DO NOT EDIT.
 * Provider commit: 91ddbdfd88db1eccc465616671d7f1f427f5056e
 * Aggregate manifest SHA-256: 2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac
 */

export type CustomizationRaceRef =
  | 'human'
  | 'elf'
  | 'dwarf'
  | 'half-elf'
  | 'tiefling'
  | 'halfling'
  | 'gnome'
  | 'half-orc';
export type CustomizationStarterClass =
  | 'barbarian'
  | 'fighter'
  | 'monk'
  | 'rogue';
export type CustomizationSlot = 'scalp' | 'facial-hair';
export type CustomizationDefaultSelection =
  | { readonly kind: 'style'; readonly styleRef: string }
  | { readonly kind: 'none' };
export interface CharacterCustomizationStyleOption {
  readonly slot: CustomizationSlot;
  readonly styleRef: string;
  readonly label: string;
  readonly url: string;
  readonly sha256: string;
  readonly thumbnailUrl: string;
  readonly thumbnailSha256: string;
  readonly animations: readonly [];
  readonly material: {
    readonly mode: 'uniform-pbr-v1';
    readonly count: 1;
    readonly textureCount: 0;
    readonly opaque: true;
  };
}
export interface CharacterCustomizationBody {
  readonly combination: string;
  readonly classRef: CustomizationStarterClass;
  readonly outfit: string;
  readonly url: string;
  readonly sha256: string;
  readonly fallbackUrl: string;
  readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}
export interface CharacterCustomizationProfile {
  readonly schemaVersion: 2 | 3;
  readonly workflowVersion: string;
  readonly raceRef: CustomizationRaceRef;
  readonly profileRef: string;
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly proportions: readonly [number, number, number];
  readonly skeleton: {
    readonly boneCount: 63;
    readonly inverseBindSha256: string;
  };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: {
    readonly id: string;
    readonly sha256: string;
    readonly dimensions: readonly [1024, 1024];
  };
  readonly socketProfile: {
    readonly id: 'modular-fantasy-hero-main-hand-v1';
    readonly bone: 'Hand_R';
    readonly boneUnitMeters: number;
    readonly positionMeters: readonly [number, number, number];
    readonly rotationQuaternion: readonly [number, number, number, number];
    readonly scale: 1;
  };
  readonly bodies: Readonly<
    Record<CustomizationStarterClass, CharacterCustomizationBody>
  >;
  readonly slots: {
    readonly scalp: {
      readonly defaultSelection: CustomizationDefaultSelection;
      readonly options: readonly CharacterCustomizationStyleOption[];
    };
    readonly facialHair: {
      readonly defaultSelection: CustomizationDefaultSelection;
      readonly options: readonly CharacterCustomizationStyleOption[];
    };
  };
  readonly surface: {
    readonly mode: 'uniform-pbr-v1';
    readonly defaultColorSrgb: number;
    readonly defaultRoughness: number;
    readonly defaultMetalness: number;
  };
  readonly defaults: {
    readonly scalp: CustomizationDefaultSelection;
    readonly facialHair: CustomizationDefaultSelection;
    readonly colorSrgb: number;
    readonly roughness: number;
    readonly metalness: number;
  };
}
export interface OutfitTreatment {
  readonly classRef: CustomizationStarterClass;
  readonly outfit: '01' | '16' | '08' | '10';
  readonly maskUrl: string;
  readonly maskSha256: string;
  readonly defaultPrimaryColorSrgb: number;
  readonly defaultSecondaryColorSrgb: number;
  readonly meshNames: readonly string[];
}
export interface CharacterCustomizationCatalog {
  readonly schemaVersion: 1;
  readonly workflowVersion: 'character-customization-profiles-v1';
  readonly profileOrder: readonly CustomizationRaceRef[];
  readonly profiles: Readonly<
    Record<CustomizationRaceRef, CharacterCustomizationProfile>
  >;
  readonly outfits: Readonly<
    Record<CustomizationStarterClass, OutfitTreatment>
  >;
}

export const CHARACTER_CUSTOMIZATION_PROVIDER = Object.freeze({
  providerCommit: '91ddbdfd88db1eccc465616671d7f1f427f5056e',
  aggregateManifestSha256:
    '2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac',
  outfitManifestSha256:
    '12a0656f83de0501d8aaa1c26201fc43e3a3fe999e64eb7bb88f4bf1c94581d2',
} as const);

export const CHARACTER_CUSTOMIZATION_CATALOG = Object.freeze({
  schemaVersion: 1,
  workflowVersion: 'character-customization-profiles-v1',
  profileOrder: [
    'human',
    'elf',
    'dwarf',
    'half-elf',
    'tiefling',
    'halfling',
    'gnome',
    'half-orc',
  ],
  profiles: {
    human: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'human',
      profileRef: 'modular-fantasy-hero-v1:human',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1, 1, 1],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          '456511cf8689bcccf1874fc07463a3e7c5d117459bc5e69b0009093b80e2f75d',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'human:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/human-v1/bodies/human-barbarian-body.glb',
          sha256:
            'dda32acacfd6cac816c039c6d22f760560b37d0770b1a00e24c79f92f10dab45',
          fallbackUrl:
            '/models/synty/characters/customization/human-v1/fallbacks/human-barbarian-complete.glb',
          fallbackSha256:
            'd474878caa8288954b31975ed6776ade7b470e7a6b29de4af295b48891f27b38',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'human:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/human-v1/bodies/human-fighter-body.glb',
          sha256:
            '59542d1acef44e2617f11328e2bacad3a6c42ceba56fd18fac20393f0e35742d',
          fallbackUrl:
            '/models/synty/characters/customization/human-v1/fallbacks/human-fighter-complete.glb',
          fallbackSha256:
            'fbfae8dd7bfa8cce0fd7849ff10378a248edcf36e8c743130978daf4437e027f',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'human:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/human-v1/bodies/human-monk-body.glb',
          sha256:
            'c19167158b3028586adee77631ad3140019be871056c3e396995b2bfd091fbfe',
          fallbackUrl:
            '/models/synty/characters/customization/human-v1/fallbacks/human-monk-complete.glb',
          fallbackSha256:
            '4372a00ae067025ed7c8bea5c3f0091968f53a293095435afe44885a4848ff3c',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'human:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/human-v1/bodies/human-rogue-body.glb',
          sha256:
            '51fdc3dada09a8739f4fa94133d064ca90996eb7cabd4ce3c9d1e5aec7356300',
          fallbackUrl:
            '/models/synty/characters/customization/human-v1/fallbacks/human-rogue-complete.glb',
          fallbackSha256:
            '50bce1437e8f6b48e412bb51018079b3fd659cd7c1d57ddcc5e8487368c57d2f',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:16',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-01.glb',
              sha256:
                'f352eeab85bc1e1a1e018bb2fc3f27862056219e870d58ee43f10e899d7d1db5',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                '4d06e9fb9351448d66ae0f5c97c0bbae34e3439dcb56a4ef459c684f2382cc51',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-02.glb',
              sha256:
                '9d1188a216c16b8a169e21151b8c9b8fa3efa8633407c4294c07ea2cba514853',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '9442609e7ac1166c565690b93459b71ff560001b2530f58910e0fa576ff257cc',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-03.glb',
              sha256:
                'ced6a91a65bd52f4c8e5bf87e6f70a9cfbd67909d5193203596e28728b5571f1',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                '5fe2a203fd157a60370aa4d5a7cd7aeea00aa1ba6a0d6b96c9590d841a45b41f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-04.glb',
              sha256:
                '48bf780a3ab9631ea7e6f616de1b496baa991e9281c4a10ab07f2cff342d28db',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                '86edddd720c7feae841f6a22198352c1377dc9edb83b0cf32b5ddf3bcf96d714',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-05.glb',
              sha256:
                'c64ffdea33af88953d118c9feee003fe44817bd70b56ad7ddf4698cd9deb7fdc',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                'cb98dd6b52f4388975698e0cedea9269e7186f8c90af7c3bc4bef55c9d5c79fd',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-06.glb',
              sha256:
                '2a97e2c6ab561b9ee9a3972c9fb6e010cc98b4297bf0ef4b938a8c4abd168eaf',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                'ff57d8222ba4a79693033d056606b87667d683f31d62db7a1c6e73a4e5600c02',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-07.glb',
              sha256:
                'e6369c11333eb9f9c36ede38013e2ad6b031870cd0bee725135a4559a2bc5454',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                '74d56df4796e21ec7bfdb889234d96e56e3936f97389e6b0c53f97ce5f900be6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-08.glb',
              sha256:
                '01fe9c82ba96fc27f855dd46fa305954aa0349154abc53f81e85656d56dfe3c1',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '1b7bb58672a8d6d3e4805bbbd1c9bcb5a88ea24ff069568f5f9692c7a12d55a5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-09.glb',
              sha256:
                '966ab05d9f989171ca04aad33803323a35e7d4b3596fa7d26fb5b62da8075c81',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '96ef6cc1f8e44e02ae9f284beebf6afe4f8bdffcda5587ac6b079536f936aac9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-10.glb',
              sha256:
                '398c475146646874a707071beb0d7495ae9f1ecb0afea599b076333353865cf5',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                '95a94ecd09f1e6a717c40c6d88c3175da173cd70a99b02a1a5fdb01ac5942b6d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-11.glb',
              sha256:
                'aa9e724d086485fb236ce00a557a5a4ba5c3e4f9b5bc140ce2e3a06d131c3f2c',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'a12e2ecbd8648628b8b063923ea6104be63aaf7e76679fe50c7e7225ad2a95c7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-12.glb',
              sha256:
                'aebe3a79aa0a6e1ef4a54bc8baf7061dfcaa13bb05c4745943631339e3766f79',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                'caee89307f11fd2fa15f7207e648cc565f61c9ebb73b1614b514d2236c3fc11f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-13.glb',
              sha256:
                'a9cc65d10bbd3e72cdb31efc131df8a546d1e6c328847f4fc20638b682e7bd20',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                '196751e2f6700b175f29c7caaee4d1f63a92e14f48d00a9821895039f1b96ecf',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-14.glb',
              sha256:
                'c932026b582289e4b09b3514a58ed1606b066564f6857615fc03d1cd3a169e06',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                'cf55353c9c1f73803d0bf14097138e6cf0bb732cf4c6f648e4daf7559bce958d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-15.glb',
              sha256:
                '44452cdc5b20b526f5fac83d7e7ebe4134a87e1739fdcac2c15b772af9ff709e',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                '0e73e354e2342efc01b466eea889ca30d651fa1c7dbc28240ba4888b1dfdf5ee',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-16.glb',
              sha256:
                '6fda922a7a08e399b537df553bff0d568728cefd33ccfaa69a4e18ab64fbc959',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '628fd96d57e3b95b73dc1e5314cfcce599c10041a649a5c963e8a8b641aa6f11',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-17.glb',
              sha256:
                '2665262771e71907875ae2ab7d6ee61886d3035b43af852bf6edc4304ea02adc',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '23e432a51097c5bb0d6ac563f9de5ee7bfa167e27ab250dab486e457830ee303',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-18.glb',
              sha256:
                'd55309f7ceaca74d6f6c37a2736b36c17fd7515c4a890f4e51a45ce8987b75ac',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '855b47c53e1298fde5f82480f702f7b9e4295ac956a9efe832c33c5ba267f44a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-19.glb',
              sha256:
                'f0bf71f3ee3196594a8db5b7c80a6c5066cab2137dc696978d67d14b84e0f42b',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                '24fc8b8166c17fa5e76aadbd3ab486889becb02926a641ec498e8659dac4bf0a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-20.glb',
              sha256:
                '74ae4f1af926cc7aa0f2af94ca030d78b79d68e2944a7310ad76bb68ad833d36',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                '28a79157ab0981655774c7ad93ddd88f821311161088916aae9a885a38a3b0df',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-21.glb',
              sha256:
                'b1636d3e16eef32c7f9c6e69c19c629dcce78479f4566b64e411279f9ec9cee5',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                'bae13b70a328855129a87d9c2d5d302de81aa74b2efb708f325d9ae9f656e9ab',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-22.glb',
              sha256:
                'e1e5c0c06a89c504c3e3905acfa2e97ce602cdaca29f693b0ee9c350fbb42c50',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                '9dab4e81499d941a095cc97c319dec82b5404f7d0b4bb85906e933e334deea80',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-23.glb',
              sha256:
                'c2aa169407056c14eb9efec88c32e53de82acddcb552996ddf46d342b31ebdbc',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                '4aa3af05571b215616cd31debc6ad3a484bfdc888c23a0f12297ac02ca991186',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-24.glb',
              sha256:
                '7f19b76c28780b3ceafd80fb5b6c85d773a380bbbd7a213f33ef154a2f1fe7b5',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '1a9825ae3dacd0b4ccf3c264f393617e19df8b7e885d25743ed2c975992dfa74',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-25.glb',
              sha256:
                'e48e89a1f5017642ca1599aac549910feb3f1e974d3e8beef61e34ac04c4cc59',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                '9ddc90762c0c962e2399b1ff29c8989eeb9c943251af4737da5a5b3f40248aa7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-26.glb',
              sha256:
                'b9d9bf6604d125bd37bef85211c403e91b90f90e3e35652a91037a43bcfbb9b8',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '0fb1a768a5f81d0dbebb1e02bc279c5838b381d0c6739b826659f4ad5cc43f0d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-27.glb',
              sha256:
                'b31a3a686bc6d1d34b15f3b01456ef386785ce9f36b60642f835b95763db0868',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'c39babb7b9f90b41503cccb690139d0bcb84d929b743ca6c5d34d43d4b17ef21',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-28.glb',
              sha256:
                'd1408376eb7d3495743d6e1171aa48fbd6ca6651ab677140c3ac3b89acd3b880',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                'a6ca5fd3f50e3d8438d19cbe9581d5d7653909bd1a39f7f1ac509b8e0129c5da',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-29.glb',
              sha256:
                '0c5c8c1eb3bcf06ddf18cbfb675c22495aa085afa09429abb87722f4413d8392',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                '27c8d6f2a05f93773e15599a5a2524085c9a5009de140f7dc2a796f02071b9c2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-30.glb',
              sha256:
                '24107d301656af36fdd2516e5f026a5ef39af20b065399466e2a9e4867265767',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '9d43188d84f723d20b49001b6298cdef0802005ccd43b7514cf5a666e6244ea3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-31.glb',
              sha256:
                'e7b447b47668951fa570ad06ab9e3b74cff6a61c24972ded6f5380a802807a60',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '5c16f2e446c647686049333c1c1fbd7fd60d9ccd5141fca9296d733db2ddb4e5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-32.glb',
              sha256:
                '8ce84ac8056a5b1b75ad4a12eb6286f7dc41b9de1d9a9fc294a939fc8a6c6502',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '08a0b88b6a1a2e2fa28fbf68317257dbd7fc1a71fdc997a63be16301ba1186f4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-33.glb',
              sha256:
                '8cadecbbbe334ea2439f2ac79f5f8effe86562e8a84a4c4af87899e67f0106a1',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '527880d4cb779bba4a97d4f2af92777734c1a5400dd197e35695fc9e9bc32383',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-34.glb',
              sha256:
                'e55654cf16c57e6b71d15ac535d37fc58249774e4214b35f214bde0bb3cf3987',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                '4201fee06018aea69db449fee7fd2c0a2af07c839a787c2abaa636a36892537c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-35.glb',
              sha256:
                '6ff02fefb46e2f9e9ec1edc204f1f7cee35868998f697ebc06f9f76eca504be1',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                '1ed5d23877347b2e47b2136e59626a1c6189138ad7818044ce0ded9b281f16c5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-36.glb',
              sha256:
                '955d2d662a617847889f5cd4c3412883f1c4cf6044b19348d289eee1bb6ddf19',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                'a269f21afcfa5ca67b948dfc29b44a65da5dcbebab442928228401f8cfc30013',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-37.glb',
              sha256:
                'f3fee4f94e6263ff228079aa465aae1c394cbd56f469ab643d7252293c5b5b90',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '045a38ccc6a19b0f87456bc8a354d8ab6f34cc0f879412f7ada3e2ef7ee724aa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/human-v1/scalp/hair-38.glb',
              sha256:
                '2c964ef3110917633d7795b3b9fddf17e26d693d4b1382cd61fe8c6746f26b1d',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '66c487ac552ada850b16c36b3b72abcdcdc1dac4eb1e8199f328dd9ae4ed6494',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '31a1efaff865e02be08079ff17d07d6c6a31dcb80812f12e88277b5458c213f0',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                'c80114756464b608fc3d123f0b327cd39c6ef2e8e27477137af6d9f39a676203',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '9d99d689964e5a89d8f03f6a5c9053ba4091827dd8b9c4d1081a0bba24f184fd',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '1718ea905a473043a4f3c8922b6cc176c3fb7c793eca7abc3c0ce6ec9774eb09',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'ca6993ced13ed80bfc1e0b4d01469637103410fc7074704989f564765a567023',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                '92f1a0f17c69b6181db2b91010f8f9f476487bdcbd1222ac845fa4fb2b4bca44',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-04.glb',
              sha256:
                'ca83528ac01ecccae96faab5236320186ec3050a35ca6276765627a7fa2a7866',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                '6454e2940d5eedcd5095da1d792164baea63deecf7a6aa50a85692c93054fa0e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '1cf38523e4f956215a7ad30b1780e60e94d06f707d225bb55ec3d2ee4570c29d',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                'a263e79e18bafcfb4ce1570eeb097cd6223a9f2152311dc3fb8336d987d3839c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'aad2d49744c5b4411f86479333487cb9fad614d2e7aa11477f7dc83c60453522',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                'acd84ac82a96f29e8af75a8790055dbdc876b9aeec2d15a68d8c7e8785f62098',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-07.glb',
              sha256:
                'b0e72233829d06ebc3123a03d5fa47d611742a4e27fa53b12a714a14f492dbf5',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                '9424a4c78d18138ebef0cadc9aaefa1612ed70d85fe4f21eba84c2261c258348',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '53b653c3ccd4f69d833dab4bdf1e7a5937a01c48ec6ce050b96e624f474ca3ed',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                'bd6806a0bc3cd25554fa135ef28b7dacc25b96c168043d46cc9451c17187ae5c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-09.glb',
              sha256:
                'e89a9b1b25777d20cb27b5f597e00eae2e84b8e6138ed3fff571349163e03c50',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                '44642d99cc3e89c418146cbd8452d98f8f0ef5a309fa771b4b54e8aabf54f669',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '9d4938a9e7a6c2cf6f1ac1f0e6d4ae29d7682361a3aae74bd5149e12d698f1e8',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                '4f3d7808bb8f7fa912d75378b484d85e770a6dcca9ccbb3ce23b929889cd13e9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-11.glb',
              sha256:
                'd26d870c5ddc7e784b40ddfc45454a54d52a8beec9612030ed590f12b5e8bec3',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                'd1b5df0aaee196ec1c85628b4a3341f16d6a30453682df1584837c4b3954d79c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '021b6e1146ffa6b7b3e643046760c974b6f63e6e4853bc5433c0941d814831c9',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                'd7232e0d79134f08bb9a79085bc57300da5eccb058201e420bc350e3b477b2fa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '13f8256d3c886e2321168f895029009bb7a762db7b321369731af71ea7bbfba7',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                '795a08fc08d50bbd8be3917a0f046f189580271097adca479d985975c5b953c7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '58eb561dd405061f6c311cb898738317062558bc46608c9776ebf5a994e29ad7',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                'c2286fb3acc1568cfd766c6845b9532ee45f986b8c25357da3e063ae50df8ab1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '7257c6c0ca39e1c6b8f4f8b538ccdfa259cd23d76a39250cba31f9fd386ae256',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                '898e9fa6704dffe05cc0c6856458c783fb3b9cf23721d1d088b3e76fc27f78a8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'aee0495b06342312ee76f243d240f07a7d16725d09443a879946c4a6f8e2a44c',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                'b734248a224c8681ed7ce427ce303a7ac547b718f276c240f32424a7c3ae716a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-17.glb',
              sha256:
                'be633789ddc819d36828c4f85297325228bb77f170802828403d367fd5c717ae',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                '7dd946c7d185ce79a23a15dcc027d4a7d1a37f9fdbc9e7cf449140cd64a17aac',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/human-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '9c703579dd55c9a7c8697fcdce06b25d0f9075211ec3a98d2ae3c914c26fe5a6',
              thumbnailUrl:
                '/models/synty/characters/customization/human-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                'dcbed45f9b0327d0818231fdcaca72fb25a5bb629cbbea0bb95634302b334b46',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:16',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    elf: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'elf',
      profileRef: 'modular-fantasy-hero-v1:elf',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1, 1, 1],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          '456511cf8689bcccf1874fc07463a3e7c5d117459bc5e69b0009093b80e2f75d',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'elf:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/elf-v1/bodies/elf-barbarian-body.glb',
          sha256:
            '4a9ef96d1dd1966d43cbc81109376223f77199977acb752b0ae98d1f16dbecb2',
          fallbackUrl: '/models/synty/characters/race-class/elf-barbarian.glb',
          fallbackSha256:
            'e436883e6adf7e9912bffafc8734351cd970fb6154263e0fe96e842f490ef80d',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'elf:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/elf-v1/bodies/elf-fighter-body.glb',
          sha256:
            'dddb367b22e198683e7b1f5ed69864ae2dc39ecd88b50ed289c6730a77273b69',
          fallbackUrl: '/models/synty/characters/race-class/elf-fighter.glb',
          fallbackSha256:
            '3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'elf:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/elf-v1/bodies/elf-monk-body.glb',
          sha256:
            '2c40028c14203797c836a5d890a5baddedc5f8b20785f7ca258f3d762a90531b',
          fallbackUrl: '/models/synty/characters/race-class/elf-monk.glb',
          fallbackSha256:
            '4167695e5268a84dfdbf202a883c6012825216902afa60f7b88bbc6349236206',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'elf:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/elf-v1/bodies/elf-rogue-body.glb',
          sha256:
            '23b164c6c61d0b75945967d16a3141b97be99beb7d1e333a70477f8e9b4fc8d5',
          fallbackUrl: '/models/synty/characters/race-class/elf-rogue.glb',
          fallbackSha256:
            '939e38fbb1121a6b185e7edf427f6b0a7867597a004e94c41f0982db3df82365',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:01',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-01.glb',
              sha256:
                'f352eeab85bc1e1a1e018bb2fc3f27862056219e870d58ee43f10e899d7d1db5',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'c9b79464606025822e50eacd24af01d27ae16097606fa5d87b86364fb5a050b4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-02.glb',
              sha256:
                '9d1188a216c16b8a169e21151b8c9b8fa3efa8633407c4294c07ea2cba514853',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '3bf1c236319af7f95bfacc4efc37d5b3027aed5837f5bad4daaf5d251219def6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-03.glb',
              sha256:
                'ced6a91a65bd52f4c8e5bf87e6f70a9cfbd67909d5193203596e28728b5571f1',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                '65b23a44f1d85237ca804963140534ba8c3970e3e4628295ea6d679ad344f8ee',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-04.glb',
              sha256:
                '48bf780a3ab9631ea7e6f616de1b496baa991e9281c4a10ab07f2cff342d28db',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                '5fb479fd0f464c5fe5eab7458bace180098a1e24f05aa0e9f6d15457926db083',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-05.glb',
              sha256:
                'c64ffdea33af88953d118c9feee003fe44817bd70b56ad7ddf4698cd9deb7fdc',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                '0a75bb9277a4977bc012e6c1afd32392d7af15fc9623dcf85752ac57cba9cbb2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-06.glb',
              sha256:
                '2a97e2c6ab561b9ee9a3972c9fb6e010cc98b4297bf0ef4b938a8c4abd168eaf',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '5b1ab9bf3d47357456035b13290718c4f3dfaaf5c161b36455e7386abad18b45',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-07.glb',
              sha256:
                'e6369c11333eb9f9c36ede38013e2ad6b031870cd0bee725135a4559a2bc5454',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                'c3a30c1b5b366c91d95783e4704f3dd01067dc8d599a035a81ce240b98d8df38',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-08.glb',
              sha256:
                '01fe9c82ba96fc27f855dd46fa305954aa0349154abc53f81e85656d56dfe3c1',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '72029d290b6474581decde6f8168103ba1f90b0de1ab8e49c1d4e1b6d46abfef',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-09.glb',
              sha256:
                '966ab05d9f989171ca04aad33803323a35e7d4b3596fa7d26fb5b62da8075c81',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '779af1364e7d20f46cb5f2a1cbf0c935bf3fd896b903a747bd3fd7a63f4096e4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-10.glb',
              sha256:
                '398c475146646874a707071beb0d7495ae9f1ecb0afea599b076333353865cf5',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                'a343f03baa5886ed0905996599aebf6fcb9d9ecb7511d00e42bb683c3fbfccb4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-11.glb',
              sha256:
                'aa9e724d086485fb236ce00a557a5a4ba5c3e4f9b5bc140ce2e3a06d131c3f2c',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                '6ae4d5f6910903e4cdb5a3d743295e7b3e7bbd8aae936d5cbd015b08bd29bf97',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-12.glb',
              sha256:
                'aebe3a79aa0a6e1ef4a54bc8baf7061dfcaa13bb05c4745943631339e3766f79',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                '0062dcb148ed35b4e5a8b217ac9ad0d4341f19c2479afc82341ef4e106598fcb',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-13.glb',
              sha256:
                'a9cc65d10bbd3e72cdb31efc131df8a546d1e6c328847f4fc20638b682e7bd20',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                'db9f9687be95dfc9a677b0660bc3aa98647eda0a389feb2abb07acf9d4e38389',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-14.glb',
              sha256:
                'c932026b582289e4b09b3514a58ed1606b066564f6857615fc03d1cd3a169e06',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                'faacc232b5543681058dadf9b13ea0e680c054a8e0694298e1c6ca2d2c4a3341',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-15.glb',
              sha256:
                '44452cdc5b20b526f5fac83d7e7ebe4134a87e1739fdcac2c15b772af9ff709e',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                '101311cd86a86a56f25e5efc27b875fc47e0ff9e6d8ec99fb8a30097e9853039',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-16.glb',
              sha256:
                '6fda922a7a08e399b537df553bff0d568728cefd33ccfaa69a4e18ab64fbc959',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                'dbedb3a4aa5eba57e57f0dc3c57d779a1da8550ebcf7e5a133f2494b9674fe3f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-17.glb',
              sha256:
                '2665262771e71907875ae2ab7d6ee61886d3035b43af852bf6edc4304ea02adc',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '84113d89a095c887ef06116f76a97064df50574a83ce3b0ef7724a89d25bb7a6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-18.glb',
              sha256:
                'd55309f7ceaca74d6f6c37a2736b36c17fd7515c4a890f4e51a45ce8987b75ac',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '15b9a5e93d0cb571ea947fdc8338506c96a2d2b72da038ae1d71d87fe8444bdd',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-19.glb',
              sha256:
                'f0bf71f3ee3196594a8db5b7c80a6c5066cab2137dc696978d67d14b84e0f42b',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                '8eeda30aa229c65216bd6f6497a6bd621d051beb3d2b9d47f5626805385cf7be',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-20.glb',
              sha256:
                '74ae4f1af926cc7aa0f2af94ca030d78b79d68e2944a7310ad76bb68ad833d36',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                'f75271745653fda11f4522243017db93f5f39be9ed2f56272e247e70cb55e9ea',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-21.glb',
              sha256:
                'b1636d3e16eef32c7f9c6e69c19c629dcce78479f4566b64e411279f9ec9cee5',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                '5a70ecbadb603e0a2aa53a58f07d43202bd07dca29729c429cc34a3a05eb92a7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-22.glb',
              sha256:
                'e1e5c0c06a89c504c3e3905acfa2e97ce602cdaca29f693b0ee9c350fbb42c50',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                '4b2ff2c4ce346948966f59b05bfa58d55179105608fc1dc220f354bb0fd6e9e9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-23.glb',
              sha256:
                'c2aa169407056c14eb9efec88c32e53de82acddcb552996ddf46d342b31ebdbc',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                'b459859563151a3e997216012f83d034d79cb45a0643276793fa03f36420500d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-24.glb',
              sha256:
                '7f19b76c28780b3ceafd80fb5b6c85d773a380bbbd7a213f33ef154a2f1fe7b5',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '9b786373ca424a1b2f132c4cab3d34269f7281352bcd168a84577066bdad2a95',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-25.glb',
              sha256:
                'e48e89a1f5017642ca1599aac549910feb3f1e974d3e8beef61e34ac04c4cc59',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                'a376958f89566506477651415147c4fb8e9d800e6432fe0a910ce362deed07f1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-26.glb',
              sha256:
                'b9d9bf6604d125bd37bef85211c403e91b90f90e3e35652a91037a43bcfbb9b8',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '3fc12dff1c78c97eeb49e471c6498c889fca5cf0ccc8c0a2a7ca532aa18bbe67',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-27.glb',
              sha256:
                'b31a3a686bc6d1d34b15f3b01456ef386785ce9f36b60642f835b95763db0868',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'f4f8560e2abdb01440179ec79729fb1423e9ef02071f1089b851264e876204d0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-28.glb',
              sha256:
                'd1408376eb7d3495743d6e1171aa48fbd6ca6651ab677140c3ac3b89acd3b880',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '08cfbe3fd60b2b8d8af21987c3b3da6ab13637b35450eb2bec7816ded15f19ab',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-29.glb',
              sha256:
                '0c5c8c1eb3bcf06ddf18cbfb675c22495aa085afa09429abb87722f4413d8392',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                '174f2d96de5560bffec0d40062794c30a069da8869dbe6760e8e30e1287de231',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-30.glb',
              sha256:
                '24107d301656af36fdd2516e5f026a5ef39af20b065399466e2a9e4867265767',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '1bc3b7bf6ef3492b38cf4b6fa045b930097cbe0cf87d7d8ce9e72fe71e721506',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-31.glb',
              sha256:
                'e7b447b47668951fa570ad06ab9e3b74cff6a61c24972ded6f5380a802807a60',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                'a4eb95c6b6c6a6aa594667f846b7ee1c845da7bc3df123d3727d277cc3003f01',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-32.glb',
              sha256:
                '8ce84ac8056a5b1b75ad4a12eb6286f7dc41b9de1d9a9fc294a939fc8a6c6502',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '2a1c95d4753e58807a94b18c603a128b3795de144223da949dd13a6c7bc0a278',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-33.glb',
              sha256:
                '8cadecbbbe334ea2439f2ac79f5f8effe86562e8a84a4c4af87899e67f0106a1',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '4e1ee9edcad5b4781b6194c0bd6474d018e8c96a415cfcbe81861f8f5658a541',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-34.glb',
              sha256:
                'e55654cf16c57e6b71d15ac535d37fc58249774e4214b35f214bde0bb3cf3987',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                '5c0117a278fe1f655027c5a38beb112bf3b188d4b003685b74d43cadc32db7d8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-35.glb',
              sha256:
                '6ff02fefb46e2f9e9ec1edc204f1f7cee35868998f697ebc06f9f76eca504be1',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                'f5485454903cfb6a7c83140bf892aad6d4bff9f550d124694913b94983f1e434',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-36.glb',
              sha256:
                '955d2d662a617847889f5cd4c3412883f1c4cf6044b19348d289eee1bb6ddf19',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                '5071b6a3aaff385d4954ef067028fee9cff4f66163445af6da962de04878cdb6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-37.glb',
              sha256:
                'f3fee4f94e6263ff228079aa465aae1c394cbd56f469ab643d7252293c5b5b90',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '08338fff16e5c6ede4c39dab517bbea0a17787c369e56a80e901f81d5867636c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/elf-v1/scalp/hair-38.glb',
              sha256:
                '2c964ef3110917633d7795b3b9fddf17e26d693d4b1382cd61fe8c6746f26b1d',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '5f3b7efc2685283ad50529be6a5f87c787aebf345aa9fa97f53fbbeb8e334751',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '31a1efaff865e02be08079ff17d07d6c6a31dcb80812f12e88277b5458c213f0',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '93cc71bb3a2fe1fca853aef1f614592f2b78cb05db7ad174840c86fdf7034509',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '9d99d689964e5a89d8f03f6a5c9053ba4091827dd8b9c4d1081a0bba24f184fd',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '991ba3beb500da958b91582f70587f62a55af9a434f2362a9a70eadf5f2ca8d5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'ca6993ced13ed80bfc1e0b4d01469637103410fc7074704989f564765a567023',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                'bcc72ab935c67dadc7cae3a625e0f733186e4e5b9ace1305a3986642ca4d28de',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-04.glb',
              sha256:
                'ca83528ac01ecccae96faab5236320186ec3050a35ca6276765627a7fa2a7866',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                'be689c71cd654f1477c77b90daaddb032661f6b893d37918cc41d08916ac789d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '1cf38523e4f956215a7ad30b1780e60e94d06f707d225bb55ec3d2ee4570c29d',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                '7b96f57cd3abd65b4886e366701865bf2b7e4f8f3b6f1acb458edb87bc575d11',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'aad2d49744c5b4411f86479333487cb9fad614d2e7aa11477f7dc83c60453522',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '57fc9fc2c27b72429cda33ca798f953ec2b40147c09687bcc30fa614d00ce314',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-07.glb',
              sha256:
                'b0e72233829d06ebc3123a03d5fa47d611742a4e27fa53b12a714a14f492dbf5',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                '06362de8f6144ac682453b0939d3a93a8c02ef1df8545ea8025220bda7843a2a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '53b653c3ccd4f69d833dab4bdf1e7a5937a01c48ec6ce050b96e624f474ca3ed',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                '5438df083fc451922e5246f8adccad6674c3f517874c19da0f3df35ed5a72c5e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-09.glb',
              sha256:
                'e89a9b1b25777d20cb27b5f597e00eae2e84b8e6138ed3fff571349163e03c50',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                '68dd8d36276826e3b5c7dda1a7b077389bff000b4d03aa24a35a86adc2859c75',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '9d4938a9e7a6c2cf6f1ac1f0e6d4ae29d7682361a3aae74bd5149e12d698f1e8',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                '4dc43e555f98fe808adf32127054cb9b005b5ebe1117a7066934efab6b1c3658',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-11.glb',
              sha256:
                'd26d870c5ddc7e784b40ddfc45454a54d52a8beec9612030ed590f12b5e8bec3',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                '7588b430d53ee4edf38ff1a182696b8503c48dda57ce08c9ffb100b2093783e3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '021b6e1146ffa6b7b3e643046760c974b6f63e6e4853bc5433c0941d814831c9',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '1c92806d1a4c7b266cacee6a9cf95f3de4a996ae11c376d61699cb1c5a35e316',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '13f8256d3c886e2321168f895029009bb7a762db7b321369731af71ea7bbfba7',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                '07ed00110776b435ed4859a228ab5a262cfe7b28f34ffaa6a85e4955019acd91',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '58eb561dd405061f6c311cb898738317062558bc46608c9776ebf5a994e29ad7',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                'a66c0b12b0cff2f6fe3bba0069e2807c45f4a4ba655b49d57ab1fffb64f2b2d1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '7257c6c0ca39e1c6b8f4f8b538ccdfa259cd23d76a39250cba31f9fd386ae256',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'b9d630add67d54422eabe22a9ddb3b0ab9a8c2cd17c66f488f82431a9504a7b7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'aee0495b06342312ee76f243d240f07a7d16725d09443a879946c4a6f8e2a44c',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                'cbc51e270a320f6c76dab05fad93a2103d8f575bc70887ecdf95728db4b45f3f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-17.glb',
              sha256:
                'be633789ddc819d36828c4f85297325228bb77f170802828403d367fd5c717ae',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                'd453c825f47f4032a703d1ea5e9b36b6ca18aaede224347a437f1c05a9cf588f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/elf-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '9c703579dd55c9a7c8697fcdce06b25d0f9075211ec3a98d2ae3c914c26fe5a6',
              thumbnailUrl:
                '/models/synty/characters/customization/elf-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                '4424a7150dea7fdfb0243110e0a8bd5e0f41a19c2f51d997eb363fd9ebac9bed',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:01',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    dwarf: {
      schemaVersion: 2,
      workflowVersion: 'character-customization-v1',
      raceRef: 'dwarf',
      profileRef: 'modular-fantasy-hero-v1:dwarf',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1.08, 0.78, 1.08],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          'ced85b4f006ee0261b87c9d607c42ae596e4f1f908576bd67649f73207f8265d',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'dwarf:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-barbarian-body.glb',
          sha256:
            'f534d980ae01fb83031df3aeccca692e9ab6f3e0c8ed47be66bb1ba9d98f97e4',
          fallbackUrl:
            '/models/synty/characters/race-class/dwarf-barbarian.glb',
          fallbackSha256:
            'dfd29de0d5a3611f6e92b88e7f706587ef705b332f0a8a949ee23919396a9a7f',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'dwarf:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-fighter-body.glb',
          sha256:
            '8d70f73d57abe0a1bb8ec4b6b45eda27fc7841a12479fe7c745ea0b7020d64f6',
          fallbackUrl: '/models/synty/characters/race-class/dwarf-fighter.glb',
          fallbackSha256:
            '7e1c611b5b5e02a709e75ed71deeccdc30242e0716da469adc2ddaa559068224',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'dwarf:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-monk-body.glb',
          sha256:
            '2da4a500934f07302e57f766893ec2e826886c2a32a9c31f037d0c974ff51eb1',
          fallbackUrl: '/models/synty/characters/race-class/dwarf-monk.glb',
          fallbackSha256:
            'e44a953e0678b029a379822a0593b21111fb7052c18152750ded94eed7086247',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'dwarf:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-rogue-body.glb',
          sha256:
            '4535dbea0694cd2e829cc0ddb8672af4ccc2738e527206cd6077937192bde98f',
          fallbackUrl: '/models/synty/characters/race-class/dwarf-rogue.glb',
          fallbackSha256:
            'a6de5c8247d8fdd8eae3888ee10faa9eddb73b624be92e81c25993b24063cfe7',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:04',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-01.glb',
              sha256:
                '0f0f33a45b0e96a8561fd02ac1d577bfc63b3f59d8872fa6fdf62dcb08d9700a',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                '3ac7e88e4820e45b30c13447d83bcd8351761d8ea2500a0d45c99152040d4ebe',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-02.glb',
              sha256:
                '0d8f757aff41b52f86c2034f16a3fe569750cb423e2be5410ec438283f583bc9',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '1bd15b0038929841d9779b7361ea076b8a8ca6057118893c02f34cf3c95fbc16',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-03.glb',
              sha256:
                '922f1dd21bb7f6a188e02fc4cee12214fa6b3fa5e572ddf36939b16c24925fcc',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                '833a8167299bd17a03b5c3c1b59ccccfb413d9cb8be2aa291b9426d8c89f037d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-04.glb',
              sha256:
                'cc896dc487bf18193ec2dbcd4f289711e45f9b1ecea468a1cb7582af1b154f2b',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                'a269de42061bb7a4bb3856a5c5751b3464b611c1beb9b1f9ca13c75120536688',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-05.glb',
              sha256:
                '6c508ed22925fb960e8f540164af5ad447ec233a3b5a1d330495f9b9aa826564',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                'dc5193704963ddcab5ff9bfcb0300549eaa31da3b2b355b7ac3603d587eabddb',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-06.glb',
              sha256:
                'ae502ac171b426632b11049b8120a1a5f6e07bc1896d2921703b719c32d79506',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '067acdacdf53c1184c581c2ecdee478871631e3eebc40a04e8e6dce9f506348b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-07.glb',
              sha256:
                'a404d14efa135ab34cef1a1dd2d2523c36eb8b73d4958e4b5b7319c57bda783d',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                '34468a031aea0b23dbd47973fe216fdf9efb24381d7b3538c18c128a4bf459c1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-08.glb',
              sha256:
                'a4b091376e152d022aef73021f20130c949c6a91ebd44a3fad6f398b42f19f97',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '2704d5ce4edbb5509fdddc6e4d0de0c9ee8df06f6a2877f53331ccdfaae9002f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-09.glb',
              sha256:
                '4e9336e7a276171d8a043a2911fb978f1b8fa384039e416ca9da472a981b1d02',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '6d47dce4d2c0e9859dc51b201a215d53bf6c14fe09daec02443ee968c609e03b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-10.glb',
              sha256:
                '48ac37e6aa6a2b36e6b4a4606e7afdcb28cff0f4c548342243af7f09ca33b4a7',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                '6f1e559fc950ac010e5200f74d4a7c2196f311384a5da9501b4a8086240c715a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-11.glb',
              sha256:
                'ad3e46e73c6d7d8b5d4093289d4bcbec1e097ecddf301861230a10d1824ae40d',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'ef0a7acce73a64321bf93d66da0a9b3afdc5abf24656012704b24b277b595ed0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-12.glb',
              sha256:
                '477486928f1b62407e094109867fed724d118da3b44062a52751f1bdfe5334af',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                '8744b1ab1d6510a8e2f98c15e5aa535871c4e01553596f49888ac2177bc3946a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-13.glb',
              sha256:
                '057325ca0145004e6dffe68d9587fb2994a7077a1596d44edb0b16fdd93b6146',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                '303de92645b3f483c6f655ef020d9b12689deac74d64e7b3000b24618df9e312',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-14.glb',
              sha256:
                '80054f5e12307153992b92107a1e4582557857eee4001911aa4e528a23ac63a6',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                'c6202d6f54770f8f8f397fea297dea59c61b49c1ab02d7b188e2dd3dd4bd8ec9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-15.glb',
              sha256:
                'ed6b19239feeffffcc776475cbd58f130290d1cc0da5748895e1e227e887e90b',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                '7f64eb9f32e7dc212ca970cb2ee2b3e3f9c8662013108752129068403d00a1ee',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-16.glb',
              sha256:
                'ff71f18f62e172125be519e800d62f26ff88db5ee25915341ff63f5e1df14f73',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '9b334fc30f672b9c3581ca7a1285b954842ec577482a5e306680f70908f3c2e1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-17.glb',
              sha256:
                '7f845df44616c1a1aa72df323c32f3f6d0493c733e2252314a0ac1ef6df4a3f2',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '62de73dfa0a614785683d8a4ba7295a777a5f2f0e1116bc82b3f7f1549ce6105',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-18.glb',
              sha256:
                '0917f7f57435e45054158d73da91e562df8f694ac0864314312000004bb3c11e',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '43c8e1e8f53a0de1f27a7aba4bbea022f88c7109fc42bbb00859fb1d299ac687',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-19.glb',
              sha256:
                '587f7758e4491e5c4e2861fef36a81da4be850d47a3c56a7b61b028beee6a58e',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                'd5e22fea21630484ef0398bc14fc7f48fc974b7d755c47ed6c47e5154d95c793',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-20.glb',
              sha256:
                'dedf8ea4ab3d4756e135667fcdd76f70980236c35b2e6303efb4c0d5b3971bff',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                'a4ec6fd19d2c9e2b5bbf56a085558b7985437a6c744111d11ad4d776566a6fa2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-21.glb',
              sha256:
                '91f24128a394a57ddd70aca991d24837a9b3bcee1908d5fa943115c77791d504',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                'b373f097c12c92798b24625c3ab85f6095fa8691ddcb3a046912f31fb6af2f62',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-22.glb',
              sha256:
                '6e49420a31cca5730746535256f23bfff413ca3058fe99e97d084007990702c2',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                '7545d1693d302472782e5fde574dd87d6cc15f2f9fb1fe685e14214728e93539',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-23.glb',
              sha256:
                'b312a3b68104c1bb9e3f03b004b8a956563526f27cebf2159ed7cab005fe84b9',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                '0e10ea1cc10205a128b7ae80a94e0571f72cbf05356baaee42613d1d14995f4c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-24.glb',
              sha256:
                'b59616f3eb25e2be263449fc39b852d37d242c577270592350903b0d37d15c2a',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '39ad25751db72af81cc3cd1d8f79b2391918260981bc1cafbbc8d3d629d35b60',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-25.glb',
              sha256:
                '44723cee2e371448be8bf71aa900742a9042ca772c7623ce9b9761196e29057b',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                '29974dd8bbdb086d5f81caf1d61d3d4132cce29085e8cba29cf69fac00fcc4e6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-26.glb',
              sha256:
                '7e8740bce7be4a934e7b8f04a76169f81f389c13309eb6326d65a6f53b12884a',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                'dc55a73e76fe85c4a208601a13726bcb2472cd9e1c866cd11acf71ad721e4312',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-27.glb',
              sha256:
                '487e81af0e3ca79eb0c476f5002682194160f033ff31198c813e4c34f0e51b61',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'e53703f99c7d30ff464089fe00057c538d6731def198486f669158e0976e326d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-28.glb',
              sha256:
                '9effd771b6c761adacf599ca96290bee5b475dc78de05e62be2a1a71149f829b',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '7046ebf422f4007fd28814273b61eff590b09e6d8f8897530a352485f452b2c1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-29.glb',
              sha256:
                '8a903e974ec94332a49dd0ca36c78b0f0e02303712916d51f0fc98f94c817016',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                'f01897d6090ddbd944668bf5f61fe666adcc76727771ffc11e1f6b522adacd18',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-30.glb',
              sha256:
                '49a95d7fc1211a98f9ee8f4cc083e364c79f729a30891370dfce0588b5d4e1c8',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '0330e24335e4bbd5916a44dbd06d1d728c33243b865126e542b0baa5888fd773',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-31.glb',
              sha256:
                '665fc3c864f63c9b45e80d4b8f1b2987ba3e6bde8d5a2a4d427a460e06c109ce',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '8e12d8a2c27d670b96b5060014d43e33a4f8bd9acb1846401c8f51241286dd5c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-32.glb',
              sha256:
                'c2a9083a14938fdcb67afe90ef11969edac14acdbb630a55b7f6ca09c3cb07fd',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                'bba6482e3f6305e8826d5dc2e6f3f905eeec406d23d9f278a2ab3e619cbab88c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-33.glb',
              sha256:
                '6276aef6a2d90ba2932b423502952a902029d77aa8740e941bf00da77c7f9de6',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '1efa82b3a8e87045fac071360d5f077fc4cc7136b3a00e515a352c3cf611f485',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-34.glb',
              sha256:
                '211e519b2afff2f1ee5b91315b309397f9b7450b8fa7b28048099e8d32183c01',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                'c53e9df2fc7739535f60e5f263bc13532c17333c3b5035e569e070ad3e7759d8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-35.glb',
              sha256:
                'c057a6bc69f7dfe1a7ce3d81ab47ee05d22dd4ba19b7d0ca00385fd236a33b14',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                'b5b5acbc8c47b83a375d5aa6d7e0e886c73095c895da715ac17181ea500ab523',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-36.glb',
              sha256:
                '08f714e9af3dbf89a991603f2a789ddbba9cdbccfa35aef18c7c2a3741276e84',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                '7563455e95080da276d28a15d72d9f17307f70815be6d415379dec9672720ddb',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-37.glb',
              sha256:
                'cd716ec78525a49efc347a656376a823b85b4ea6596de44616336ab8723c9d32',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '692c1a06080ac720a3c903d7a8fefcf8ba2cd6e5697b1a9c91dffe34cb8253ff',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-38.glb',
              sha256:
                'fc5c231c98320458cde9a52c1292a1b88741b5f91df0eb217073c53f404c03a5',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '71722711e439fa34763fa3b582350cc8aa9836e35256d525c3f25777c0485a3c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:facial-hair:02',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '49ccf51ea94778445fb4b0fe068776d6f8e6a7d37ae76171315baf0a9c970255',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '0ac344e871d007f575dbeb1f49185fd06572d322350b32e4c2c157a9206d061a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-02.glb',
              sha256:
                'fab5f63914339fd1c12fd09a9145396906e7da5c378ef6f8f6c37edeb62f7890',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '001d3705a9a5d5aff809fd686b4caff249adcab0353a6aea657d097fb082f59f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'fd5cc26275a796b45dc3af5da492678ddb18165effc002fc86df02f6859a5108',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                '8b32671b93b7bd33c36b482e854b61c5856e0f6f2fc358ca40de637ab57e28bf',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-04.glb',
              sha256:
                '7d49e3786181725ea9a8825f129be03666f827de0aaa1143f5ae2456fc7940f4',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                '6d7aa8bf3f593553977514f0db8905bd869fe54f0e751674b2bfdee3b72b0b19',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '69e5711364b0e16d3ad0222f500ea4c50ffd76b18e21751673c24807fc5dd50b',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                '42e3760e2cc02e1e8a5df9293292208439759d9db41962d99f787029a9a8de67',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'de1fb424bd85350812e6820da8569f2cd1fb40d7262ec1b37aaa55e928006a57',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '1a48d2a35d0ccd1d57a0a9117ce4181d53836db9c41cdbe30545706f6d69c6e4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-07.glb',
              sha256:
                '14a06afc42a7dd30a1a72f95c3d27782bdf33a1bcdd9f632ff93a55c31f38658',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                'af24b7bd9227413112e1e27f32b47ace24255c58cf976715b24897c66d3b0662',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-08.glb',
              sha256:
                'ff38692c47a073156ee867d77a226b29d50b3ec8dcc0ab5ebc77d09095847dbe',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                '3db4aa5c892f7f4fd014ff0d9d3ae47217df0990ab20298a730c570eeff46100',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-09.glb',
              sha256:
                '079f90d8288c11637a90e6169b4f496afeba7171ee06a35aedf5a351b0f8ab15',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                'a2d55a9c6b1442e67e93874724c743e143340eddcbc85eb726c952c5b255e761',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '302dd32fa123253e31370c47aec4460cad8ff72f0a8339fbb028371ec4d8eeae',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                'c6395bf6d893fa82935c88f1b066c960a8d1da02b6989f81c7c29e997963431f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-11.glb',
              sha256:
                '9746a1b2d7011b701c9cdab4141d556005d97a87b6de1becb469f09d3ae174f2',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                '96a84e5d4898301a22abff65fba84619a42e2fbae4bbb661d7528a4143039a66',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '2e133cf4e4edcdd515b74a8c706c4a5e07488af8853c25dd253de6b585bfcef9',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '30657959c590fee14ca8fd8fdc41075dc8adba98d4d59411332bd70cb51db2ff',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-13.glb',
              sha256:
                'b174bf1302ae0fde0c72f8ac140bcffc31b97f4c6cabeaa3b3bb08ea001b1a46',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                'b076e85c139d2784d47d32155c8273a3bf16abf360e85999ea087562021ac96b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '59c8c87aa190813bc1c6a5fad84aeb48b33b844bd12da498813014bbdce11772',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                '809682aff968255d46bdd2955099f57e8f97eab76e81d52ef12b3c944f026c63',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '15da3698a867a956b3bd4deda02d05909aebcecc321fef01285f41c10ee93ca2',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'a40f3e875e51175a46c042e322348d49be994830a70acb74b84832966535a72b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-16.glb',
              sha256:
                '5545ad039834c6560401149748711c27b93821a6d38467051a492cbaf3627144',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                'bb1f91a3b5efd2a5404c5b619cc8d5474c0c12adf880788d1de48b32df22b899',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-17.glb',
              sha256:
                '1ddc392b98a915290dea1527759bc8752dd20960e1d02b1451b2a3997df05fc1',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                'e9a372de57f9199e2c3a047e63efcaf0c82e41c79d1062c0b50aa7c0402aa656',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '77b524ba8ffbe0447f09bc0f936f179dab47e1aa393b60c12ad8c6c0d1214617',
              thumbnailUrl:
                '/models/synty/characters/customization/dwarf-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                'dba92d867e6fddd9626f41d64145c3f09f78e458c21800bc8ae72e4fda66856e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        defaultColorSrgb: 5912613,
        defaultMetalness: 0,
        defaultRoughness: 0.72,
        mode: 'uniform-pbr-v1',
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:04',
        },
        facialHair: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:facial-hair:02',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    'half-elf': {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'half-elf',
      profileRef: 'modular-fantasy-hero-v1:half-elf',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1, 1, 1],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          '456511cf8689bcccf1874fc07463a3e7c5d117459bc5e69b0009093b80e2f75d',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'half-elf:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/half-elf-v1/bodies/half-elf-barbarian-body.glb',
          sha256:
            '8f7e688d1d5f57e175cb9a752ba0b260b54e192849114b00a884f02f34b297e7',
          fallbackUrl:
            '/models/synty/characters/race-class/half-elf-barbarian.glb',
          fallbackSha256:
            '9dde33258b69ec66bd694f705fcc035d307a388b1518027571f33ffc75b76ca8',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'half-elf:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/half-elf-v1/bodies/half-elf-fighter-body.glb',
          sha256:
            '1dac2c6c6a093d2a60a82904584f0bc85816d94f52ee6cbc5db42177f19dc7c9',
          fallbackUrl:
            '/models/synty/characters/race-class/half-elf-fighter.glb',
          fallbackSha256:
            'd8a82b5a803a030e6f7c384f93b7a29e0cf288f52c4daa8ebaaec6818f8d639b',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'half-elf:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/half-elf-v1/bodies/half-elf-monk-body.glb',
          sha256:
            'fed7a562534cc68c24bb7a78848ecd3e5cce32e7313be5b492b1be1279794715',
          fallbackUrl: '/models/synty/characters/race-class/half-elf-monk.glb',
          fallbackSha256:
            'ba9c7d636ecb06eb0d65ab509d527b27b28b17e534f0cc9861331076eaca6924',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'half-elf:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/half-elf-v1/bodies/half-elf-rogue-body.glb',
          sha256:
            'e566cfe9f468087d35afb2acbc65740508221552641558be1fd8fe51019488d4',
          fallbackUrl: '/models/synty/characters/race-class/half-elf-rogue.glb',
          fallbackSha256:
            'ff8c8a978880afaafa0428a28dae7a027806c4d6931c3ea79107dd51d3687754',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:16',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-01.glb',
              sha256:
                'f352eeab85bc1e1a1e018bb2fc3f27862056219e870d58ee43f10e899d7d1db5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'be8996c7fa75da08f06371189feda291db15e5883a00a0cf58e29896669f8117',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-02.glb',
              sha256:
                '9d1188a216c16b8a169e21151b8c9b8fa3efa8633407c4294c07ea2cba514853',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '1115426dba413177e678949ef9a54b537a31e74e2f507a887fe024b44a4026ea',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-03.glb',
              sha256:
                'ced6a91a65bd52f4c8e5bf87e6f70a9cfbd67909d5193203596e28728b5571f1',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                'c71a34a399d26abead174de460a143073bc6806d6d90ccb47ae071d15e2c82e5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-04.glb',
              sha256:
                '48bf780a3ab9631ea7e6f616de1b496baa991e9281c4a10ab07f2cff342d28db',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                'f7682543fc402ffcd1530ed6636713311bb6242ed13e11849650eb6fca29de76',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-05.glb',
              sha256:
                'c64ffdea33af88953d118c9feee003fe44817bd70b56ad7ddf4698cd9deb7fdc',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                '375bf0e416e2f5138c78090e978199afa4a9552cdc6a222da51094322914aa39',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-06.glb',
              sha256:
                '2a97e2c6ab561b9ee9a3972c9fb6e010cc98b4297bf0ef4b938a8c4abd168eaf',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '2d65f6149d0022e0e440ddc0ee413af9f71c335ef98c406482e6c2e15fe8ebc1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-07.glb',
              sha256:
                'e6369c11333eb9f9c36ede38013e2ad6b031870cd0bee725135a4559a2bc5454',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                'f0634b8d830b4a35e6c3c7fe7850a3d3e99766e4430feeb1eba881129039aae2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-08.glb',
              sha256:
                '01fe9c82ba96fc27f855dd46fa305954aa0349154abc53f81e85656d56dfe3c1',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '5f0e88788b3ce612e4e51d8a4b606da3e98b9652358a8050df6e25a3d22d9089',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-09.glb',
              sha256:
                '966ab05d9f989171ca04aad33803323a35e7d4b3596fa7d26fb5b62da8075c81',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '22aa0cbc3a06f9b8a4219b1ea1d2df6858cdd2ab5a054d86ca3ef9a4486394b4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-10.glb',
              sha256:
                '398c475146646874a707071beb0d7495ae9f1ecb0afea599b076333353865cf5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                'ca92ff1630c2208ed3ff24e1e649f75eac2eaee7dc21f657c57ad91f5b98da3f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-11.glb',
              sha256:
                'aa9e724d086485fb236ce00a557a5a4ba5c3e4f9b5bc140ce2e3a06d131c3f2c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'a18c430fd30d96e42f958f40c9ea783ad050b77089c8c6be252f0b62f952db2a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-12.glb',
              sha256:
                'aebe3a79aa0a6e1ef4a54bc8baf7061dfcaa13bb05c4745943631339e3766f79',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                '1d169e05cfc782e68054b70de538da30c1325b08f0f16c6c9246a44b528903d5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-13.glb',
              sha256:
                'a9cc65d10bbd3e72cdb31efc131df8a546d1e6c328847f4fc20638b682e7bd20',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                'ecea18c53f29a1d71fb59458aefd9ece97d097ba64db9b1ed21e99bd4a767ea5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-14.glb',
              sha256:
                'c932026b582289e4b09b3514a58ed1606b066564f6857615fc03d1cd3a169e06',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                '09ae10a4bae591d062f9e6d4d7e5d558073eaf89105c51605016198fa5bbded9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-15.glb',
              sha256:
                '44452cdc5b20b526f5fac83d7e7ebe4134a87e1739fdcac2c15b772af9ff709e',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                'b0208b73026252d29aeff56d2e7b5f4e5778013cadaeb84136771df405c02b12',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-16.glb',
              sha256:
                '6fda922a7a08e399b537df553bff0d568728cefd33ccfaa69a4e18ab64fbc959',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '921d8660ae5a454ca1ef0f3bae6937bfbd68ec4b1ab211a44f9a352f18d00976',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-17.glb',
              sha256:
                '2665262771e71907875ae2ab7d6ee61886d3035b43af852bf6edc4304ea02adc',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '997a08bb3a0c66fdd1736c13b89c273ddace8a9b1f779899f3fc45675aa75f6b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-18.glb',
              sha256:
                'd55309f7ceaca74d6f6c37a2736b36c17fd7515c4a890f4e51a45ce8987b75ac',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '9ccf98956a7af8e14d8f01c3f7523e63dfc95900b4640e6604315bb24d0ae0cf',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-19.glb',
              sha256:
                'f0bf71f3ee3196594a8db5b7c80a6c5066cab2137dc696978d67d14b84e0f42b',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                'd89a0ab68360483c45bbe75bec699f778902c97084c6d40d35703ef4ba2322d0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-20.glb',
              sha256:
                '74ae4f1af926cc7aa0f2af94ca030d78b79d68e2944a7310ad76bb68ad833d36',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                '1a7d7280bfc6dab024829c11a6efa6926547a9275158f8a2419cf17d6f7173d5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-21.glb',
              sha256:
                'b1636d3e16eef32c7f9c6e69c19c629dcce78479f4566b64e411279f9ec9cee5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                'dbaee82f9ca43c508bb5a506a0e9fad726d926ec4b2b1e37a532d90ac4f45053',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-22.glb',
              sha256:
                'e1e5c0c06a89c504c3e3905acfa2e97ce602cdaca29f693b0ee9c350fbb42c50',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                'cee036a0f6bf595866051ff96c0556bc7306ad4b4d4d85106c25de2c6ac93d41',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-23.glb',
              sha256:
                'c2aa169407056c14eb9efec88c32e53de82acddcb552996ddf46d342b31ebdbc',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                'bc8ed9d3cd2c97b9c1cd206bcc1b27c9d8ea958592df2881a09c8166bced8613',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-24.glb',
              sha256:
                '7f19b76c28780b3ceafd80fb5b6c85d773a380bbbd7a213f33ef154a2f1fe7b5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '583c66c54e1519f3e45d951cf0eb954bee0dbd1930a5362ffeb2b96952163d54',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-25.glb',
              sha256:
                'e48e89a1f5017642ca1599aac549910feb3f1e974d3e8beef61e34ac04c4cc59',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                'e1db9cf30373e3359cf15ea9eef59044aa9753a356cc658995433feb967a4117',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-26.glb',
              sha256:
                'b9d9bf6604d125bd37bef85211c403e91b90f90e3e35652a91037a43bcfbb9b8',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '1fce3c1682d61bc77bd1dbf8e71e2f1bd98f0d6282abbac205746dcbce530d95',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-27.glb',
              sha256:
                'b31a3a686bc6d1d34b15f3b01456ef386785ce9f36b60642f835b95763db0868',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'd0e8ce9c6861796fb54e9564a8ae60e3bfa7c665c2bd597e4d8aeddc69590408',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-28.glb',
              sha256:
                'd1408376eb7d3495743d6e1171aa48fbd6ca6651ab677140c3ac3b89acd3b880',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '390527d97236d0d3cfc275aed5da81af752f68721efb47bf8c10c143eb0126f4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-29.glb',
              sha256:
                '0c5c8c1eb3bcf06ddf18cbfb675c22495aa085afa09429abb87722f4413d8392',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                'd8a7a6a781e0ed980dc4e9ab72334c5eeb5377b2bc4d9f486c635263c93e7932',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-30.glb',
              sha256:
                '24107d301656af36fdd2516e5f026a5ef39af20b065399466e2a9e4867265767',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '9114d2280178715ca803e89b52d9fce141791403fc39d865a58548fa28fd5324',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-31.glb',
              sha256:
                'e7b447b47668951fa570ad06ab9e3b74cff6a61c24972ded6f5380a802807a60',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '0183434c66c6aca44551a18a4c52ba8d2714d0044ce3498172d8e767aa915c4d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-32.glb',
              sha256:
                '8ce84ac8056a5b1b75ad4a12eb6286f7dc41b9de1d9a9fc294a939fc8a6c6502',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '9d95652ea762aaa3d5d3d78eec2c5c3e61478f67e365ac88cc1c4a562cc3e297',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-33.glb',
              sha256:
                '8cadecbbbe334ea2439f2ac79f5f8effe86562e8a84a4c4af87899e67f0106a1',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '1d8f015ada2c482df716bf6a0d274dd14b04582ff21e46b68495de1cab4d6c21',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-34.glb',
              sha256:
                'e55654cf16c57e6b71d15ac535d37fc58249774e4214b35f214bde0bb3cf3987',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                '7abbb9db25b1b61c4eeb38a8d9a64edbeea615173d0f49c6ef4dfb85dac716d2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-35.glb',
              sha256:
                '6ff02fefb46e2f9e9ec1edc204f1f7cee35868998f697ebc06f9f76eca504be1',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                '9ba34cf6308daedd0e189b0a6a53a34fd16c1fe113671f28b73f5123025f6ac6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-36.glb',
              sha256:
                '955d2d662a617847889f5cd4c3412883f1c4cf6044b19348d289eee1bb6ddf19',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                'ff5abfdd3a3488b1273d02bfad6a85ffe13a4d96ded9ae4908f9e625d69aafe0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-37.glb',
              sha256:
                'f3fee4f94e6263ff228079aa465aae1c394cbd56f469ab643d7252293c5b5b90',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '9bb08207db3d1a0ac9e6e56a7f8cae84cad667644f30bd974019d944618c38a0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/half-elf-v1/scalp/hair-38.glb',
              sha256:
                '2c964ef3110917633d7795b3b9fddf17e26d693d4b1382cd61fe8c6746f26b1d',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '8f174523e04e20ed1836eb93531300fd2d13e10796da0d6019d33c3e55c7bb42',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '31a1efaff865e02be08079ff17d07d6c6a31dcb80812f12e88277b5458c213f0',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '4a5a158b549728bf6cc3172cef13c5cbf1aacbf4f7e634f998225138f66a4a3b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '9d99d689964e5a89d8f03f6a5c9053ba4091827dd8b9c4d1081a0bba24f184fd',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '0d0d8c40013692d4a0e77533a2d6781ae97a6efd188d346c447d6a1a9341d8b6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'ca6993ced13ed80bfc1e0b4d01469637103410fc7074704989f564765a567023',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                '59cd36354ad6f17c6a53219861ce9d9d02e4e86fe54608119e58b61485556d9a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-04.glb',
              sha256:
                'ca83528ac01ecccae96faab5236320186ec3050a35ca6276765627a7fa2a7866',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                '7667f826ace05a61ca0c7eff06934047a216885463dee365cbd027b99e49e6bd',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '1cf38523e4f956215a7ad30b1780e60e94d06f707d225bb55ec3d2ee4570c29d',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                '3eec98255cf02a9bb85ad6cb89b8f6acf26d95217583e3c7fc78652bac4f208d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'aad2d49744c5b4411f86479333487cb9fad614d2e7aa11477f7dc83c60453522',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '3c81b7c998a0fb6b69d6394523ff4576819e8021b954fb12a7ff43814eb3a42e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-07.glb',
              sha256:
                'b0e72233829d06ebc3123a03d5fa47d611742a4e27fa53b12a714a14f492dbf5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                '829604000c3f624d0c4b7d390987b98835d60fb625470298019dca3fc0d3a485',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '53b653c3ccd4f69d833dab4bdf1e7a5937a01c48ec6ce050b96e624f474ca3ed',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                'a00b100cae10553bdf1d86b641536425926f98dbf7990038674ccadc83813c81',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-09.glb',
              sha256:
                'e89a9b1b25777d20cb27b5f597e00eae2e84b8e6138ed3fff571349163e03c50',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                '35bad2bb961fe276894796d809e70841875f34b5a1885524666182545bced740',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '9d4938a9e7a6c2cf6f1ac1f0e6d4ae29d7682361a3aae74bd5149e12d698f1e8',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                '14a63a14a8af40856ab63d816121690d669debeca65c0a86210725c53755b3e1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-11.glb',
              sha256:
                'd26d870c5ddc7e784b40ddfc45454a54d52a8beec9612030ed590f12b5e8bec3',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                '88c177715b511a72c3fae3008fce59a0ed2d7ef287d6b2e3e385c6d19f0d1c05',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '021b6e1146ffa6b7b3e643046760c974b6f63e6e4853bc5433c0941d814831c9',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '56fbe39989450aa6c17a0ab3a622d0cb95122a071d5318eec59348ea81af53a2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '13f8256d3c886e2321168f895029009bb7a762db7b321369731af71ea7bbfba7',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                'ed5f6e675dd1852a17d65cd8848668fb00b6c6e96b0eb4b18de189fcf063f2be',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '58eb561dd405061f6c311cb898738317062558bc46608c9776ebf5a994e29ad7',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                'b38f5169a846c90c95f3e4e726534b6b60a50b57591c902033a5f2bdecbfc99e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '7257c6c0ca39e1c6b8f4f8b538ccdfa259cd23d76a39250cba31f9fd386ae256',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'dedb1ed59f8df50c03464976de1cfcbecab76b298267fc1dd665825a27e16134',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'aee0495b06342312ee76f243d240f07a7d16725d09443a879946c4a6f8e2a44c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                '6cd69541ba8e53e91787a9e6d75df2a8c64aecd7b15f3b6698b3f1e2c6b9c93f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-17.glb',
              sha256:
                'be633789ddc819d36828c4f85297325228bb77f170802828403d367fd5c717ae',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                '6e08d28e8dcc603ca791d2b0e970c02a07bc81ee945cd068df58de96beeda2fa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/half-elf-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '9c703579dd55c9a7c8697fcdce06b25d0f9075211ec3a98d2ae3c914c26fe5a6',
              thumbnailUrl:
                '/models/synty/characters/customization/half-elf-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                'a9df5be1be9a706bd45adb68f8af77492560245ee99222edf6a70952eb966f3a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:16',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    tiefling: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'tiefling',
      profileRef: 'modular-fantasy-hero-v1:tiefling',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1, 1, 1],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          '456511cf8689bcccf1874fc07463a3e7c5d117459bc5e69b0009093b80e2f75d',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '02-a-tiefling-crimson',
        sha256:
          '38fcf12eecdcb9075b9a944857eec3c52aefb82b8e2f3f06355c58009a267e67',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'tiefling:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/tiefling-v1/bodies/tiefling-barbarian-body.glb',
          sha256:
            '038fa8e147a6e1384e76c4a8b7a0554db351ee3ce5bb4ab5721de54ad03ad79b',
          fallbackUrl:
            '/models/synty/characters/race-class/tiefling-barbarian.glb',
          fallbackSha256:
            '06e819db490b185fcfa66f5197bab95f632d70297695d216e237b0aa50f884a1',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'tiefling:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/tiefling-v1/bodies/tiefling-fighter-body.glb',
          sha256:
            '4123eae0a0796a3afd21b7ce19ab941477f19d67d3011dd831ecdde5fea36d04',
          fallbackUrl:
            '/models/synty/characters/race-class/tiefling-fighter.glb',
          fallbackSha256:
            'ebdefbc679fc8d01defe201b890fea0608a96b43215f701c241b34f7281363f7',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'tiefling:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/tiefling-v1/bodies/tiefling-monk-body.glb',
          sha256:
            '3a6bea01a2599a06dee8ff35ed2db4ff55901f215b5248e92fb0e3ac6766a795',
          fallbackUrl: '/models/synty/characters/race-class/tiefling-monk.glb',
          fallbackSha256:
            'b44a642a305018eefd5276d39ed30ef4f6f6b27ab71795e63a173393a0ee1fa6',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'tiefling:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/tiefling-v1/bodies/tiefling-rogue-body.glb',
          sha256:
            '3e6eab3ca8b9d21a0febec9edcf626aeb05dc213c1bb9cb5ef67bb9e5f37e793',
          fallbackUrl: '/models/synty/characters/race-class/tiefling-rogue.glb',
          fallbackSha256:
            'ebb2d827df5906079e808bd78d9904775d3b25143776b0817c08b17f81a98a04',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:03',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-01.glb',
              sha256:
                'f352eeab85bc1e1a1e018bb2fc3f27862056219e870d58ee43f10e899d7d1db5',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'e4154a19efb9576825bc26bcd27ae1e71047fcfeb3e89241766efdcbb93f32bb',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-02.glb',
              sha256:
                '9d1188a216c16b8a169e21151b8c9b8fa3efa8633407c4294c07ea2cba514853',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                'c39b24b8dd9db601fd494351b26e0ed4d736395700600b12d835fb8165d67ea2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-03.glb',
              sha256:
                'ced6a91a65bd52f4c8e5bf87e6f70a9cfbd67909d5193203596e28728b5571f1',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                'a7b18f95aef49304228308732b801623ec04c6bc94fd32ce7590dc81e3289dc6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-04.glb',
              sha256:
                '48bf780a3ab9631ea7e6f616de1b496baa991e9281c4a10ab07f2cff342d28db',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                'f0adb25df3a22308229f35c043554e22a4167971acab68899706651d9de632d0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-05.glb',
              sha256:
                'c64ffdea33af88953d118c9feee003fe44817bd70b56ad7ddf4698cd9deb7fdc',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                '920083b655a1e053a6e1211aa2e08cb3216e043bde2a718104e1aef847f544c0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-06.glb',
              sha256:
                '2a97e2c6ab561b9ee9a3972c9fb6e010cc98b4297bf0ef4b938a8c4abd168eaf',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '8716bbaa5e2eb78e8379d30372d3a08eed98720c6d30d22d9dd7f7fce0fd400f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-07.glb',
              sha256:
                'e6369c11333eb9f9c36ede38013e2ad6b031870cd0bee725135a4559a2bc5454',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                '212a412b7dded891e943c447141a785d1cf3ef3bd8466998124297cddaea1fe9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-08.glb',
              sha256:
                '01fe9c82ba96fc27f855dd46fa305954aa0349154abc53f81e85656d56dfe3c1',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                'c72e0ffb88572cf1f171031badfe61e832de87a11de224db137026fac27a8523',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-09.glb',
              sha256:
                '966ab05d9f989171ca04aad33803323a35e7d4b3596fa7d26fb5b62da8075c81',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                'ee8bded8c15f3acd2ca4a4aa0ffa9ce26ca3b31f65f70b151118148a83e648b0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-10.glb',
              sha256:
                '398c475146646874a707071beb0d7495ae9f1ecb0afea599b076333353865cf5',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                'd5674be319e67d8066685a08d4fdbfd8aaf52e37bac08f69ae732d3a39d8da14',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-11.glb',
              sha256:
                'aa9e724d086485fb236ce00a557a5a4ba5c3e4f9b5bc140ce2e3a06d131c3f2c',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'a7d5d376a8bdbaed483fb86d9c30c41a85e448cad628def96b41dfe55dd09524',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-12.glb',
              sha256:
                'aebe3a79aa0a6e1ef4a54bc8baf7061dfcaa13bb05c4745943631339e3766f79',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                'baa50bedacfee2e9dd5c7dd8984d2874ac4e2536f538849e3e95562f36f2738d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-13.glb',
              sha256:
                'a9cc65d10bbd3e72cdb31efc131df8a546d1e6c328847f4fc20638b682e7bd20',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                '075136c255e50cfc7ced9bc951ffa3c00eeb3f0f9c37daae6d811c2415fb0dba',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-14.glb',
              sha256:
                'c932026b582289e4b09b3514a58ed1606b066564f6857615fc03d1cd3a169e06',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                'eddd463ec6d81cc1bd2153b8b50908afe7e4e8a46a331fbada8ccd27adf4b171',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-15.glb',
              sha256:
                '44452cdc5b20b526f5fac83d7e7ebe4134a87e1739fdcac2c15b772af9ff709e',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                '24a956039f678f3f4cb01b945253d9165bf2ab560be48e3bc66f1b8b350b7ea1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-16.glb',
              sha256:
                '6fda922a7a08e399b537df553bff0d568728cefd33ccfaa69a4e18ab64fbc959',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '7f175b7d32df88f3410b677005c175619c27664b4b3a3dec92c7b599f45abb86',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-17.glb',
              sha256:
                '2665262771e71907875ae2ab7d6ee61886d3035b43af852bf6edc4304ea02adc',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '1b7118ccfc2504d36d5e7b3ec094598fd758c08aef0470847a0c3bb69b63ad75',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-18.glb',
              sha256:
                'd55309f7ceaca74d6f6c37a2736b36c17fd7515c4a890f4e51a45ce8987b75ac',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '276873eed0f247ed221e5c7dfde315c9a8758b369b1e6ee4b5cfe2463e6d858f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-19.glb',
              sha256:
                'f0bf71f3ee3196594a8db5b7c80a6c5066cab2137dc696978d67d14b84e0f42b',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                '904ac5a14913a55404d9f5c6cbd5c2858e7f33183a33804b44cf316fd7e09eb0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-20.glb',
              sha256:
                '74ae4f1af926cc7aa0f2af94ca030d78b79d68e2944a7310ad76bb68ad833d36',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                'b4257f3da0375b13fcaf1a21b441c4f88746a3eae6aec419d6b0fec26cdb0a05',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-21.glb',
              sha256:
                'b1636d3e16eef32c7f9c6e69c19c629dcce78479f4566b64e411279f9ec9cee5',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                'be0b5346aea2303ff1df2679ae8316b98ceb46ae81062183e8dfc263fe5011fa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-22.glb',
              sha256:
                'e1e5c0c06a89c504c3e3905acfa2e97ce602cdaca29f693b0ee9c350fbb42c50',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                '02aee296cb57fdbaccec7a8027781d27f054d334417b2066e9c64ffcd747415c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-23.glb',
              sha256:
                'c2aa169407056c14eb9efec88c32e53de82acddcb552996ddf46d342b31ebdbc',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                'cd09c39d09d95052cb212abb0bc28367eb83175899247f280bd0bb8704f3977b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-24.glb',
              sha256:
                '7f19b76c28780b3ceafd80fb5b6c85d773a380bbbd7a213f33ef154a2f1fe7b5',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '3d4bc7db0c8a46f821646c7234afac7879e6b3c5aa489464ccc20e9928b093f1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-25.glb',
              sha256:
                'e48e89a1f5017642ca1599aac549910feb3f1e974d3e8beef61e34ac04c4cc59',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                'f333fc414c928273e9869c76e5c64f4fc2e0d8d5fb081dc33f3fd32aa0046abe',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-26.glb',
              sha256:
                'b9d9bf6604d125bd37bef85211c403e91b90f90e3e35652a91037a43bcfbb9b8',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                'a76cf3e48832db3f764db757d72953f4e398ef30af0df37de31cf3e0d887d567',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-27.glb',
              sha256:
                'b31a3a686bc6d1d34b15f3b01456ef386785ce9f36b60642f835b95763db0868',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'd1b713ac786d83eef0871c695a85d4ac16adba7007705adfa9e4c659839c66aa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-28.glb',
              sha256:
                'd1408376eb7d3495743d6e1171aa48fbd6ca6651ab677140c3ac3b89acd3b880',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '029b7a865f094f3ff3e2cba0b6525b9fbb8742ebb5b0e18170e117fab27bab92',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-29.glb',
              sha256:
                '0c5c8c1eb3bcf06ddf18cbfb675c22495aa085afa09429abb87722f4413d8392',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                '7adf8065b46fbcc70335403a99371c5c8c72bef32ac2836a62cc2aeba8957e7d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-30.glb',
              sha256:
                '24107d301656af36fdd2516e5f026a5ef39af20b065399466e2a9e4867265767',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '1723974ab48be984995ccca3d7dc8ddd5e25db095f6625189306ad2cf4b1ff7e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-31.glb',
              sha256:
                'e7b447b47668951fa570ad06ab9e3b74cff6a61c24972ded6f5380a802807a60',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '888e47fb3eef21bc921ac7f136d2a3e06183f7c80decf3a5ce44fb2d67d680a3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-32.glb',
              sha256:
                '8ce84ac8056a5b1b75ad4a12eb6286f7dc41b9de1d9a9fc294a939fc8a6c6502',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '90077ab274ecf9fa24b390cc127955c017948bb10f63de7f8d5c3ead235cf301',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-33.glb',
              sha256:
                '8cadecbbbe334ea2439f2ac79f5f8effe86562e8a84a4c4af87899e67f0106a1',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '71e10fe37707ebebb2e23d3b59bec9f3a5cb1087417cbcb797557a3de2dbc3b5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-34.glb',
              sha256:
                'e55654cf16c57e6b71d15ac535d37fc58249774e4214b35f214bde0bb3cf3987',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                'bae226ff32877c78d9e6c688fd937f956152609873f0ab937a585eb16ff99124',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-35.glb',
              sha256:
                '6ff02fefb46e2f9e9ec1edc204f1f7cee35868998f697ebc06f9f76eca504be1',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                'c75c76d475a8349387c35d018b28c831d8e52e9e0def363ac38b78ca919dd70c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-36.glb',
              sha256:
                '955d2d662a617847889f5cd4c3412883f1c4cf6044b19348d289eee1bb6ddf19',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                'c8e61f06034cf6c3ee2d1484dc86d5e3fe927a3a772dff485ab55feee38ce78e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-37.glb',
              sha256:
                'f3fee4f94e6263ff228079aa465aae1c394cbd56f469ab643d7252293c5b5b90',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '51486a1f6fd7356e09ad0be20e72dc89193353f814184ddcc3fe61e35e22ac4e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/tiefling-v1/scalp/hair-38.glb',
              sha256:
                '2c964ef3110917633d7795b3b9fddf17e26d693d4b1382cd61fe8c6746f26b1d',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '932f8445587b9440f917af4b1f5c4862be2bbc112b1a675bbf8f7ce8ba26064b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '31a1efaff865e02be08079ff17d07d6c6a31dcb80812f12e88277b5458c213f0',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '29fb4b912a2d716a7973f6ca482bc530cf3a7b5b0c120110e894b5f32224be90',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '9d99d689964e5a89d8f03f6a5c9053ba4091827dd8b9c4d1081a0bba24f184fd',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '1dee5fdeff0fe8e6f515781e8b583f2768bf9cda2212a91c4084b929c43e539a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'ca6993ced13ed80bfc1e0b4d01469637103410fc7074704989f564765a567023',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                'a4dd87a120ea13dda46f02ea25a76bd6cc25c6bcea3f417ccf0360425c313265',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-04.glb',
              sha256:
                'ca83528ac01ecccae96faab5236320186ec3050a35ca6276765627a7fa2a7866',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                'b05e3e78a5a308e40bdc2205b6ae0f35008df81e3de2e484c59505071bd628c5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '1cf38523e4f956215a7ad30b1780e60e94d06f707d225bb55ec3d2ee4570c29d',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                '9adf412ee7a67efa3732de9f780bbec400fab8e72cdadbe0f6976ba149e74502',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'aad2d49744c5b4411f86479333487cb9fad614d2e7aa11477f7dc83c60453522',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                'ab1e1f873a817ff0dcaf09a078b345d5fa8eeb3fe8f2b70ba06864b4b3956e6d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-07.glb',
              sha256:
                'b0e72233829d06ebc3123a03d5fa47d611742a4e27fa53b12a714a14f492dbf5',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                'e7f5cb11aac5de7399232a1b1060853a02492223446c4892eecf13cfcf13e550',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '53b653c3ccd4f69d833dab4bdf1e7a5937a01c48ec6ce050b96e624f474ca3ed',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                'e655e93f522ff73a3c9f44e0e0f4bead700610c498953822264c44ae5414f023',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-09.glb',
              sha256:
                'e89a9b1b25777d20cb27b5f597e00eae2e84b8e6138ed3fff571349163e03c50',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                'bab49df9531025bbad56bf7b850a240db5eb3ca4fbdaa16929a38958b04002b2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '9d4938a9e7a6c2cf6f1ac1f0e6d4ae29d7682361a3aae74bd5149e12d698f1e8',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                'dfa70e539578c9c438cccf5d1ce00047079110fd6ddfc05af86c90d3345653c1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-11.glb',
              sha256:
                'd26d870c5ddc7e784b40ddfc45454a54d52a8beec9612030ed590f12b5e8bec3',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                '49582c6efb4b1b9ba59f5a497dd5627e80d20e8fb516b86001f90bdf8ccb3fc7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '021b6e1146ffa6b7b3e643046760c974b6f63e6e4853bc5433c0941d814831c9',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '7581b54348ccb170668030f9da888a3d417961c88624ab98d3a93b7556195549',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '13f8256d3c886e2321168f895029009bb7a762db7b321369731af71ea7bbfba7',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                'd4966096d15f250c1bbaa766c6ee52c655f4a721a443afed0a0105ea91513858',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '58eb561dd405061f6c311cb898738317062558bc46608c9776ebf5a994e29ad7',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                'f6a324019b5a39cb36de4776b9c0080527f6bf124ca2cc94795dc0ec9dc9a911',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '7257c6c0ca39e1c6b8f4f8b538ccdfa259cd23d76a39250cba31f9fd386ae256',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                '3768aaeb8ce14d3b250542015bb167f990b21414778e6886cf5969f916325020',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'aee0495b06342312ee76f243d240f07a7d16725d09443a879946c4a6f8e2a44c',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                'd260cf87b7910e5a7f18e14854d60caaa270d09a32e9531d9f52fbbe53bb0231',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-17.glb',
              sha256:
                'be633789ddc819d36828c4f85297325228bb77f170802828403d367fd5c717ae',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                'e52ba92c4571becd5e42d2125e41246b6563424d0cf65faa3fa276133c18357a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/tiefling-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '9c703579dd55c9a7c8697fcdce06b25d0f9075211ec3a98d2ae3c914c26fe5a6',
              thumbnailUrl:
                '/models/synty/characters/customization/tiefling-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                '9d7274103a7795fe5fbb2ed13be594a0f62d541920f2c069b9883b6e37100129',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:03',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    halfling: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'halfling',
      profileRef: 'modular-fantasy-hero-v1:halfling',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [0.84, 0.52, 0.84],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          '0395d873c7e26e024021b68b313bae85c15b0dacb29f1bc797ddd4d91abe8692',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'halfling:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/halfling-v1/bodies/halfling-barbarian-body.glb',
          sha256:
            '017d05fd45e88a1e9ac5d80a6fc917d596da6fe7a3c7df21332eb504658d06e8',
          fallbackUrl:
            '/models/synty/characters/race-class/halfling-barbarian.glb',
          fallbackSha256:
            '4bec886592680bffa6534aac726fd1477451b30b8429bffcfa330a27751a3b70',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'halfling:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/halfling-v1/bodies/halfling-fighter-body.glb',
          sha256:
            '2a4e8f77e98cce12f77a1aa0dd3743903606e48b83c20d2e81eb6a60b17c0792',
          fallbackUrl:
            '/models/synty/characters/race-class/halfling-fighter.glb',
          fallbackSha256:
            '74232e1eca2149752722d6ed14c482b4e69cc7551c835fbe84ba681c3de685d1',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'halfling:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/halfling-v1/bodies/halfling-monk-body.glb',
          sha256:
            '6c324e523b0f698f7e881132986e106e8fd40eb8747915c2e8c3f35b39d03c6f',
          fallbackUrl: '/models/synty/characters/race-class/halfling-monk.glb',
          fallbackSha256:
            'c06d21673cb573ac7edc9b71a31dda613e0ad2192a8ecbb73da3b1d94d0694ae',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'halfling:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/halfling-v1/bodies/halfling-rogue-body.glb',
          sha256:
            'a557f6f6703bfed6fd05b952d7ea0b76b4ad07caa19b229b27266330cf340365',
          fallbackUrl: '/models/synty/characters/race-class/halfling-rogue.glb',
          fallbackSha256:
            '8b5020f2b225544033dce772a201f8914f2eb03b8d45383e6dbd535e5ea3d981',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:16',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-01.glb',
              sha256:
                '15eb2dbeac8a10994b9907f7f6f6081e1d9a9e4e6a2f25bea4209545a9930fcb',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'b142652afa89a763dc9519fab0eb1bd4b6c70987424f22ac5a73990086f37949',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-02.glb',
              sha256:
                'b3fd4de635f2e77afad23f8c5db5aa53953612322f78e68c9b51ec123e7a891b',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '3a6b06fa2b637ba0c1fd90510028d24cf6adda8f927728c66637ecea34e61308',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-03.glb',
              sha256:
                '0b226479c61368f29c81072c3a130812f97974a18e4e7db2ca0ebf1b09465bb4',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                'a936ca89f1ee92153eb81c1c5e7a81f092458673047153828684267a3ba231e3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-04.glb',
              sha256:
                'c9bec5417d30af96c3159111c451b0a5abe09eca843742257e141d1bac69bbf8',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                '80bb0056b9f5becb1a138a21fb856406253d3fcc2618ebfb7f607e062c206faa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-05.glb',
              sha256:
                'ffc21d28d49bd0308d8c45e76e14a8ab0ba32e0cc8403c9f80a823573286d95d',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                'b3e79c79c22018ac67c5a1af17e5dac0194df3362cfdf03193c7a5fd2c37227b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-06.glb',
              sha256:
                '444f53a9cf19cccbffe9e1cdc37485ff6a7f69903ca941265f88afd32a518add',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                'b988e9eb465a2fb72f6478cd441984599b99284ec1c646b78c547e64c03e8697',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-07.glb',
              sha256:
                'e378b2bfab45577232a58dbed5915774d31eb83cbef53caf3dc3fc61558c0705',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                'ad489ab9c7375096c8634de02d51a56560f7cc019be28a3b884a092be7715061',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-08.glb',
              sha256:
                '9232b9d2f820da1131165da048bcf69c32fc0dc060dce9cfb7c44aa9a770e58d',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '0c2138da956ddabbaa3d7531f9e948065757e2fd6dd11a7e898160bf80df91a9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-09.glb',
              sha256:
                '13f8a7989fd68cbe566f8f3281b9f2ecd6be61f0071e952c698b3c27cbfe9b1c',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                'd79131e9b38ae19813050daed42530a389b136020b396c078954c2451c3d50c4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-10.glb',
              sha256:
                '7780c8bce7fda9be64f285283036c0743fc2f08906c46f1b1544453f8a86393e',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                'e464d204c84f967dc413524fa98b7ab3654e1885b8b4029091eebdfbf8355ed9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-11.glb',
              sha256:
                '9e831d7e436457138bb3cf1c7e0deeeae3bbe868d98849b786fda2cea7eed942',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'b59518dec4b3f4cfcd02e32cb5cb7d477fa41b205e568f765a22a9317111cd22',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-12.glb',
              sha256:
                'daa8bbe0ee1a2c5288a41a3cef1a38957710bf010924c20034132ed6788df80e',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                'ced89ef65b68af02302814afa16c9cd441cb927f030720647d82feba9eaba13a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-13.glb',
              sha256:
                'd0f2d5992d087c8ae949d06564722202a8fbf50a76e84fe1e93953205bd84c07',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                'bd655e824e8a59df729dd591839c14cb99b81e7fdce705414ec8fcf7eb0f1f53',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-14.glb',
              sha256:
                '3afb45df1abf3ce0e9f1f352c7771a3a9de66a177aa5df2644ab8e246e9cab8f',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                '8d09e52d16e653b1dfc1122d8d9891a44e904bf099958bf689a3313d7808a9c2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-15.glb',
              sha256:
                '270ecfe6d9a9d215163e15b6b22c29e9889c8954d3407cf455789078fce2851a',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                'bb994706e6a41216211475b7b4be7f9f5fb3b9b63062e20e83cccaae21a148e4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-16.glb',
              sha256:
                'f9fea1686901322533245b01a1f522edda4b23e96714137016d0e47a59edc880',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '44e94309f5ed89c403d6104a924df607d361955292af1fa70e9a679b5adc4b6e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-17.glb',
              sha256:
                '820bde119b1ab97dbf2b7cd5825c58e165289ffdaec088a59144b69fd8d8e88b',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                'f7af372402956ff14113802411bfa94dfb6d60c9f614691d1bf6eaa9943cdb12',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-18.glb',
              sha256:
                '397bdb92cb5dd284e9d20c66eb860667b5a380c34f40f0aab574109107e00372',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '85a6d8c2ce5a675a9624b45d1bc8a8b42bbc5942913996c41e5a1f3392ae2404',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-19.glb',
              sha256:
                '594f5eac02674a9b0bf99eeca8c8579504957c078d56191545204632c7b7e3fc',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                'd8c6189e8c2b0961200191259bd6ed6d415f014affb4a65145d9c5d54600525a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-20.glb',
              sha256:
                '70de52e29d30803f1145035dcc0406cb9e3a4a1d76c1cf618ee0a679d65d32b2',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                'a348276113b31c136257afecd86cf15223cdb0a09a3e509209071c1019c52709',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-21.glb',
              sha256:
                'cdb21ff50c38fc120f04a6b0f62accc16c4096550d9fd8e29c84e829784c4a47',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                '23df60970df4556302be6462fff91eda419a9c20fa816825aef0c14652d10729',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-22.glb',
              sha256:
                '0ea8f015fb3492eb051bb458aa6a0beb19345a93da9eed84acf86ef4c54e3544',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                '6d5dfa36f251e7d4b80903a44d4733bc69e884c2ef3dca8a8e3fa778dccb52a3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-23.glb',
              sha256:
                'd903821575def89302b6612cedd8a1fd163c70750e37391e07df65f35b791e3f',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                '0f616ca8ac8f88515388ff708ba09a8b07d612a13035ddd04c5e99390a83e4e5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-24.glb',
              sha256:
                '766bfd1dfb917a3d0960ea853a794cb0239f41b5f50fc9918e661dca0aa0f368',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '5ddee07a1e2def212755f50ab0d77c8505fa879eb950b1a59ba780bca2b24611',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-25.glb',
              sha256:
                '5a2c57766ceadaa4dba25e300cae73ca94b14e9a6f0a7dc4f01ee8402830eaaa',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                '6705563d9087c49d9e62ebe26723279ceeceb10ea63839128b14757dd17ee273',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-26.glb',
              sha256:
                'b6bc554f8d7c6b61150ada2493cf7f34d553361abfd2099e96d02146b07c3fec',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '1ad618d49cf592f8a55e787da0f113efb18a32ef83f16955bb3fcad212f1daea',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-27.glb',
              sha256:
                '3a61bdc21b877235bd5a8288397a4a7ff3fb3cc7beaac6b554befeec881154ba',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'f5152e5011e4bb5cac7554ea8608a406554686dd15b56922fb4d7baffadd521d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-28.glb',
              sha256:
                'ad6fa9ae9bcbf82c4bb6766ce7b30b47ddf777bd44bb96616d626e251765b1d1',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '369178990bdb128054c563c4e0686893e568070aead34b6398c7ba8744667e2c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-29.glb',
              sha256:
                'bb81011af77f01aa3d9c56a05c8583410ea5cff951883343b2fe1f00270ce713',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                'e4e1e76fdec74b61979d24aa8b9a1491ad23e7d847f8ac99ea1da58aad6b44cc',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-30.glb',
              sha256:
                '8ae70b55ebf8e9e4a42ebcf02064d7aeb2cb3baae45e0aec441f9a32b3059210',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '892033049f0a0c6698e72b80a0036648f1554e2d98e13886846d378616fb0d2e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-31.glb',
              sha256:
                'b88937bd5819ebeab5c1641bfc1fb38523e0250c2b496f586a3ca3150702f731',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '44cf2540d58d7581fda0b05873e5a855fa693e1e3219321b4709829e49f8a7df',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-32.glb',
              sha256:
                'fac12dce3eda395d3616c18f47956b8ed4454b73eb080baf4c92880f6da0a193',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '14ea94389cd0e71809366b9548e0b0a847ce58eae5fa85d1245eb15a387b4009',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-33.glb',
              sha256:
                'fb9b9e2ed7083a54a8a8c531dcbf5df23303d7e57922b838642bf71d0fa6ccaf',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                '21f4514dfed19981246bcd450832437b70d779a24b00bed3f4c2dfe8c1522e54',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-34.glb',
              sha256:
                '1e407a986c63572587ad0a2857af25d0a74f8c8e2a4358089327e29b0e28fa40',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                'a8bbb4999f8a1c8555d166c6db9b217c0afa2fb446f88896b97023fc93b1469e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-35.glb',
              sha256:
                'da04eaa4365bd3f8d7bad942ee44eaf6d32b0880e1bb506488d3e45c8cf45ac7',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                '3d8036187e47eb1d1437402736884db523ff102a8ccd5aba5403494916b5846c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-36.glb',
              sha256:
                '664b3274b45b60102fce5a1166ae7e080ac1b550e392551bb58a30243fd1cd22',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                '8ab8c254d1611761a90c835682da09bfe3bc590e67adce9fe2fd74b02b91d08a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-37.glb',
              sha256:
                '4ed2b405c054e8c034ecde3bd89ee3e79e8e4d397f06431c55c815c2f772bc4d',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                'c35c7abdcad4c0fe8000f41962a56c58735250b1f6cb5ef1789d9580fab08ab8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/halfling-v1/scalp/hair-38.glb',
              sha256:
                '05e2a6e94f9528322b714b33a404a9de43038a3b7747453e7fbd63e434acd7f9',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                'f9a10f6d512a864261f67d50ce996c1e5413d33e0eaa8d2e8f561a42407cae87',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '8d864fc18dd04fd79c1168233140e44d8e2dc2d49a8da164c1edfd904117d394',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '922a669f655d1f2420f54b775247f27ae66a59c5f60f6724666363300b74e0a1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '5774a86c362692b73c408fb381a93695bc73df48cc0105a409a3ae4bf8ae4040',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '79db4f3ee2072139270c73bebd39fe694838453550fea917fdc17edae2fef287',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-03.glb',
              sha256:
                'bab0053ccab5f2f98bad1a6cc12bd09cd4b85b8c67153683b2df839b38f8c4a3',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                '9dcdd324d435bab0f7a97426078637823b5603720643a0aa2393a7b8a20e33d6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-04.glb',
              sha256:
                '0e10593b5b03277a0593da7b1adfce3e63d28a15e4592b63f9c61cf04d604271',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                'a4025bba5c167e7adef6cbe26bf58346390b049277f14a9510a8c49935c7bc62',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '2a124fc2a84dac051e6a532217538d256a8fae02caebf2cb82b951ccc8bf373d',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                'a0403889b31cc51f50d33990ff76a5b7d75bf0322c47318c0885321858dfd6f2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-06.glb',
              sha256:
                '69b8835826dac49c7b87124a870bba01a75009381c772647c5971024cb9902b2',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '1fc568d61611ecfd33b12bc0d60a04f6047785364d6a5f100520fec06e0d22ef',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-07.glb',
              sha256:
                '01c778040e1f0d34314a4c7979f96976a8a3cb30c7868333670e4c1a0645d201',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                'da1eade3aa5186121fda2fff9513de7c0080e63a56d261e0a2066cc9f5d4d39b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-08.glb',
              sha256:
                'd61e299ebe06801eb99c3558577743d4c3ff6c323c314de5d53d1526b3cf6f63',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                '9d37fb3d96c9d301ad86b87863d3f5fccd8fa98de44cd064691705b765343498',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-09.glb',
              sha256:
                'e3891e7f37c6aadd0222679953c32c046319830166487dfd7daf7550ef1d1a1e',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                '5d24c2da45663d201849d9d1ac057ef1a936ee2efe479b454bba0c61f3844fe0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '8061d4ee8f114ad6a11e8cc6f8a81ddf24093467fa7571945e54074fd7515102',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                'a25a081658b61866e5198271fe8e1b663a05a558eb4e2f33fb77974325f5bfaa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-11.glb',
              sha256:
                '30974de56a2ef803e4c7761431e82662a3745f786deed3279e8235ccf66ac1e0',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                '88e556111cd55cf10562a342d5dbc8a1721af765adfd51a63cf9c88ab8250c48',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '428879acf12d06185b2a29b0eeaae96083b702e2627eca516664a7ac2dec1881',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '49ed0381716ec135706f6299e368156e313e9a386505d33ce96002b84220f111',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '876abed45dce5017876a20300a063552d7f850aff83b93d2c5022b81462fd74d',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                '8f665f88d0431c7a82bbd379137cdf67e0bb365e33fa1f488b6291923850ba6c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-14.glb',
              sha256:
                'b793dbff70b9dcb7de21d56f68594820bdb7466669f3496c6c65880cc404340c',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                'd5e97fdd768c278093e0f6f5c7963af279c5fab5e40d64e30f95d6bbe085d9e6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '14f4d7c751d21f058bc046bfe0c425900b7a4f38fe6c1920aa6db26166b014f0',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'b8196455de9e0606be3dbdf42538477f21e1dbcb46dcc38f7e6b92ffd439faf4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'f55592f9b2343e33a3b855badc5166d6c5388816f635a97d45c1d3b591a6af6a',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                '654407c72cbdc3d06e0d789300989a11974579596c95904a9ba273d0a0e73f27',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-17.glb',
              sha256:
                'dc7e918747ae7b61ef526ecbbcbf9a9cf5720592ac8c2ed7cbb0614da49d10f5',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                '468067563442871b2fa6bd38ed6065179241d292687de59243ae612cbb913284',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/halfling-v1/facial-hair/facial-hair-18.glb',
              sha256:
                'f1b4253700d311a90e1a1bd94ffba3672621d529d173645ee18b1fe4911f7cb3',
              thumbnailUrl:
                '/models/synty/characters/customization/halfling-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                '40a2125ef2c03174fe9fe20463f6b6dd341f4561613e4b75b52d792257039fbf',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:16',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    gnome: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'gnome',
      profileRef: 'modular-fantasy-hero-v1:gnome',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [0.76, 0.64, 0.76],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          'b848f15fb0e790f743d31e0fc0ae11aa9b753dc3b3eb34a3a1c81bba742d0545',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256:
          '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'gnome:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/gnome-v1/bodies/gnome-barbarian-body.glb',
          sha256:
            'c4b448d7366c6e04865d799f91918c726a68267cb71dc3df5ef621022a1712fa',
          fallbackUrl:
            '/models/synty/characters/race-class/gnome-barbarian.glb',
          fallbackSha256:
            'b95342c60e335f4138b5de3a18a554c49156ae57fb08654e7d874a432a905d58',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'gnome:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/gnome-v1/bodies/gnome-fighter-body.glb',
          sha256:
            '76bfd0898efa842d0cb621d57d2a5e693b3e46619c7e35c389058565ba9d8a73',
          fallbackUrl: '/models/synty/characters/race-class/gnome-fighter.glb',
          fallbackSha256:
            'f60688fb49f7dbcf25787c6b1b6da56477367fe134b90371e4ce0089dd926e3c',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'gnome:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/gnome-v1/bodies/gnome-monk-body.glb',
          sha256:
            '8dd7c1ef842e98771d62843787228308abb04b14c60de860ba0395c22514dd53',
          fallbackUrl: '/models/synty/characters/race-class/gnome-monk.glb',
          fallbackSha256:
            '75b267f3e9ed9bb7dd73433c99009f4ee9ea664d367afb4e9242949a747f9d60',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'gnome:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/gnome-v1/bodies/gnome-rogue-body.glb',
          sha256:
            '140c6bfc1cf782e83d6c6a4dc2f20054e09da61d1687c799f2df42e4f4e98740',
          fallbackUrl: '/models/synty/characters/race-class/gnome-rogue.glb',
          fallbackSha256:
            'e5a83d2c8ebdf33f27763cb5e8032dfb53175b5d7fb43dace17c61c83ec1bb0e',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:16',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-01.glb',
              sha256:
                '0d9082a72d635864b86e36a61075cfb530dd334cfe70b2f83a59c5d247b92dd6',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'c0538396d8181ca09ab52ecb3a4d5e66b2fc7bb698946e80ca620943b0693e80',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-02.glb',
              sha256:
                '9447cb787817e0791dd81ad3ad8fc1b6e9cc972a67d9878eee39c3901dfca3bf',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                'd14138b3b48f18abd5d6cf1c0f6a0db95ac92d1432b3cef1f395a0861f40f2d6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-03.glb',
              sha256:
                'b00a9bbcafa6b23a5f674192a09cffeb952a3d90d8f426eed73167787e45932b',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                'feb8a70a194db90cb630b0d58446ed50f8a62f70d95e3c28de680152ec2bee0a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-04.glb',
              sha256:
                '61d92e2f9e76b05d574a3a35932813aca485f2058fdb6c292adc7dd1a7e05baf',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                '3a15871fb4d63db14af442ca26b8535568a1892ab952e1ad7c12fa15b389ba98',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-05.glb',
              sha256:
                '983ef2bf73b9892c3db8b0b61fdd7bcbd04eaf513e9e4337d54d8ddc19d91e68',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                'c892c9fbc64b2b04ae0d723f8dcf18d843eb362c2d4e99c9681ee2874de06a19',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-06.glb',
              sha256:
                'b5c86cdc3b1b9f2e976fa6b68aa848773bd9c6c709daabbb2ee84cc03d021452',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '78c27b82110c1782c4a837a5eed6cf5bf3ab38d4479272b64daf3d8e019ba8c1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-07.glb',
              sha256:
                '10f60dae253de5f352dde5b9170f10bb1735d5d8bcee10195b378881af1568ec',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                '59f902c90924860288eeb5dbdb7e103f67d61e41c7fedbc6f1800b831bf69a68',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-08.glb',
              sha256:
                '936fb89a27ddfbd5bef15a05a0d0d692ba728edff8b90ff38f83fb04dfb4b1c4',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                'b0b8a32cecf03d9a9ceb96a9c8dfe1181500d079330e987b8c4c8e3219384c05',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-09.glb',
              sha256:
                'e262623f50f6b53c5233db6d96ee56da6b64b80051d1737c135567fdec63b109',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '509f0b620658ccdbb384f5e5265584b348f9327954c12f1efe49a71912b00f4f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-10.glb',
              sha256:
                'e8b55e74968cbf7b3cdeafbe49809d837068372b064e229c53a1cb32f82fdee0',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                '68b8b0ec21992e20dc05cd8473739df1030a473d7b8831fadd749e9212cb3386',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-11.glb',
              sha256:
                '3eced5738ff02bd849cfdac66f8e8e2d7de1ab0b42e30b0a7597cd15c19d9569',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                '97ba9feed53d0e21f9754f8fa5b6e6dc509973122237b7e9454fab2748175f8b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-12.glb',
              sha256:
                'eca25abdd943c91362a7967467d3800f6af4599b57e1c8af6fe01db120987150',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                '8c4b1dbe47fe424d1c4032360b1fe49d36dc52b53b346ab7ee5b7ba34c1d7e27',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-13.glb',
              sha256:
                'a51b089189f2a4439ce5d88899da5b0ee1094eef4fda396aaef65163409bda87',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                'bdb02cd81ba5e97a3562f59c0e5bb36c0acbc82fd87db85683a3a45ad5a2ada2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-14.glb',
              sha256:
                '5bcf75b1c79527ad54a1ee76094f930e9c723fcfc788331a525d818636feb30f',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                '5f754b7d2ebbd080e65746ac51f4d456f9d55e5ae564655c0034c2af35254a50',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-15.glb',
              sha256:
                'b49a0c54ebace62b87d718cf7e564a73afb25fee1628a4a9273a599addf1200d',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                'd08c1c93d352730e7a5033309ac3487cd9ae0e3610725ad1ca559a1bd1088cbe',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-16.glb',
              sha256:
                '1c592128774d6828d4161a877ac5bd4543ec9a3da3e4cdc22a78a7a8fdf4c3be',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                '24035aa71b6dceabace92f8dc5d3d3a179e11c3bdfecd0b1400005d14b27a109',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-17.glb',
              sha256:
                '8e274dd9b1f43847c222e9791059046ab7312eb34d5c4942c5f6a9ace94a658b',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '70a8dc089b18ca9814092d2023b23337baa3b8ee488f8b276c78b77c84d3ed4d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-18.glb',
              sha256:
                '908f517ffe2d3e69790de90e04e206af486aa1a537099ab8f2246203800eadb9',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                '4421ba836f89745a7ff5b813a47b9ea241a36f57b1884a48f2c4a939bd69e5d5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-19.glb',
              sha256:
                '482aac3a9a1f367074012c25e54f70bb2a1d290f9fd184ca69e61db6f82d85e3',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                '099aa75b5735d8279d5e938e23fd5d14bac523456efaa3da6e2f9489ce403593',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-20.glb',
              sha256:
                '779f7607f7a3aa3844b7c302227196171eb803c542ea6d664c44da9e179490d8',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                '8bb96bd9de4e0540364df532404072ddfcec8f0987a0aaa8ace349ff3d732147',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-21.glb',
              sha256:
                '5d6bfd20792d5be3f4e987a179f76664548532c8982a2417d68036fcdfb78a51',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                '2bebe843ab1b26e7f232f42b092cdea4d590d0cbf1a46fca9159ebb84072291f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-22.glb',
              sha256:
                '2d628b9abd2990fd5c38f2f0a1211b1b3528221507f0840df71834108828edf0',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                'af6383bf321236aee57084d1a8864e07a0097f5241bb90c2a234b4894d36c0a3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-23.glb',
              sha256:
                '7ab1c645b44ca29f66171eb4297ffeb5ccb8884080d32f8eb941c6197a47d6f6',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                '34e5bd89eb285835e7774574329c2371b42fc77498268c3fc8de9c77bea9022a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-24.glb',
              sha256:
                'e005be79fd697384c4573082915091d43eee7bb387b9a72bde40572074b8d4ac',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                'b97eec3e2a7af6f8d40feb80200a1d29d5f61deedd0481dc114156eaf78a8249',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-25.glb',
              sha256:
                '956d8c47234aabecd4c557121ab12653f34ad7c0c379f99fbb33273e2365e889',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                '0821c9d562a8eb0c6546014fcca87dec46f1f788b669b2c2a23b63a6c9232836',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-26.glb',
              sha256:
                '441937e3c03549bc1224639f586ffb2c54c21fd8ed39f5e7a5f5a8f96effef9a',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '52d72b09b5dd9d7189786e588a1e13179e49006db88a70b0fdd2307617d479e1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-27.glb',
              sha256:
                '2d2b8fd3c1e576af86c2cc96c5e9efe983b7940c4f98c1f44b3a929e200f7a53',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                'bf0aec95491c10a8959debc79e01200acb6d74f78d165a534631a3ce0280b072',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-28.glb',
              sha256:
                '7ddce5c29c41c5efb4706b0358faaa53eceec5d6fc1ab17926ca070500d158a0',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                'a7afce9e3101561e534db109306c3c21017463ae61189eac94120c785ceabd97',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-29.glb',
              sha256:
                '246fe783d9a9652d9760329a707792850245d047a2ba1dbc243fa2a758f4a0bd',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                '65dfa7e36dfff561f2b3ddd4001137aa74612cbf4778ea1e0dd0c740398a16b3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-30.glb',
              sha256:
                'c0e61fabfda2253b831939214711f93d107193f3d1acfc9dc71cea191ae4e45e',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '68ea4f87c4095d73ff60d6ab2e9160966ab5b3f59ea180f4546d979bd2a394e9',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-31.glb',
              sha256:
                '566c7a3679ad8d800527537e5682efe72d88c968900d4ce3be0589dfed810b0c',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '7d2ca742d82020fa9b28741adb7910c1008d0d6aec0c2ee229350b2204d85c90',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-32.glb',
              sha256:
                '57922de558d12d1263c12bc40eba1c224408e3a3dcd030e25ec97f95864b6614',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                'd1e76616ea0919b3661625144edf83933873704a729ec843e330127652d1d0a1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-33.glb',
              sha256:
                'cfa5c5ab3ff55789d1694495f7a2299382729d5fa321936b8b8a9200ad48b48f',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                'd208670877fb6e015782ee7c86e951541b902768a07dabcc2613b65ab40e825f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-34.glb',
              sha256:
                'b7dd64ff88d059f8baa3b24217c128f67c6bc5080d86d79839655a66991c9c37',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                '9b26a054acb3911f20bd7758c2eaa05f6de609f4b849bf15267fd5441b33d053',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-35.glb',
              sha256:
                'cdb2c8f1d29c0b34ffc9aa0376d4c6457676574346df5137acab11abaf21f59e',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                'b7ee8c3fe16416513e4bf195c1411e17c998aed8a8ed7ab195fe67bce96c22c0',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-36.glb',
              sha256:
                '6b31b2ffce5af223296ecc3659e4ba789a61daf8e05b4d519c0fbd5c5c678a5a',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                '457ab50b450cc1170902f661ff8d8d6a934b35be30d864b5fc8cee0cb8d231cc',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-37.glb',
              sha256:
                'd2e6649bc657d0406964ff9b2d29079a738b5070727c9669aeed325fcba10a9a',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                'cf769d8030409c86bab212f5e0c561d6618c639137543127d8a9859cb911ab2a',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/gnome-v1/scalp/hair-38.glb',
              sha256:
                '23a10514e0816001a054d0de373022183851a88eda51e263c30a2ada5204f04a',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '640079ae0e6f863363c77f394c7de25137293756b859a07328beffe81e1cac91',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-01.glb',
              sha256:
                '7cbe330d663d770ae0514c4f078699ad3b951bd742f6270afd4067d778d6a9c1',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                '0a942b63b7be136932b3acf19cc9c286ad8c147596e8141a457141a2a1e19dc1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-02.glb',
              sha256:
                '9b662c14c84cc65d92f02152ca93cbdc945a7827ebe4b502464bf7884b55a0bc',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                'e71288f6558a3c3c87df4376bedffc01e6669164c891a15365e888c73a141fde',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-03.glb',
              sha256:
                '1d5eeeab8da25ab875cbfe8b91be7ae9c16dd5fdbb18db4bd0e7f527fad261fd',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                '4ae7628663c92c743b5b1f438c00132651a35aa89289b3b1a2a4e805898331a2',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-04.glb',
              sha256:
                '7daf90f19f79559dc603e96124c2a3a3cd7d0319fda16369ef1a7b885389b8d1',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                '01fe7b8e07a4bf78710fdd0af5d83c2bbff2393a83e0835da3bd51d9a4c62637',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '113101e7ff53815f10823abc07e0384073c662f466847f40c1b33efe6062ddcd',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                '649e5e30966f6a799d9f137b9627fbce7c2333a073e87f817e9bfbcc8f1d315e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-06.glb',
              sha256:
                '188c44bb998c8027ecc1699e6a5626842ebe32413cb3b1b00c90ccf9a19011b4',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '242de4bbd1e46393d8de03ddf555218956b025de396b7cf27ac8d3fbcbd89c48',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-07.glb',
              sha256:
                '866204906a90776a9f28282a95a51e6b7879f3a8be4c1b8844e94dc03f8c39c2',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                'a5bbdff9e102d7a25961d29b8eefec4154a2eb2c683b66d73af381a41977366f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '97a4206cc4e781d704fe5d9c82b9d4aed43d054435204865296fd004133fc8ab',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                'ac2de68a440e6d1133450187cd8ab9743eb09bb893b0fec1e299ff3cefe939ff',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-09.glb',
              sha256:
                '1f014818b13cfb32ee244117c9ffcf2ea78492df13f670168271ae1ab98ef1f5',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                '1b65696e590ce69a724dc52d001f09772f3b5c9f9240810b9ca91066241f070f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-10.glb',
              sha256:
                '9e33f53d0a7e5d8d11cc073a56ae2b9d194d3659568cbb5ca82d519c343d89a4',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                'f3d44f1d09201deb0a2e3cd4eab6d2c6dcc798343da4dc9949710a019192c954',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-11.glb',
              sha256:
                '95cf73372ddf5fc7675d18d068ba862fe7d1592167543072e82e0689a76c3ec4',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                'fd28ff101b00bd203ade016c178988d627b1b8a0ec5a9df3fb1a9777a3019024',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-12.glb',
              sha256:
                'cadfb8391dfd4dcfe3b738945df7fb71601464c11e223dd399f1c94c72943667',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '5115894e42555dfc723ea608d23516e062c92177cf3c8c95dc7bfa0a5365c992',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '7d07e5f7ee021d7c780921db4f1f33f04e2683fd921d1608a2a081973d228c5c',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                '85715878c5214e929335ac60b7d88ad5d4f40ccd269de9e846856a77c1ec8c87',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '6fa657df41e2ba0b9396c1851397792d1da63c62314c5273a153943d9810628c',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                '8dc1f90f3f06bdfa45ef0452d8664e9852a9d1446fcf5fd4953d7aff41360bac',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '78d5b8878404135a7744e39d06acf0790d33d6a8c129d19504d2215dbd4d3cc5',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'e815a4093a775e3e229ca4d45dc67d67dfbc728ec8d94ea3eec90039856b62e4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-16.glb',
              sha256:
                'f5962342b25619a47eb2ed0c0357b62e72bcf1bdf8d9654a736fa4bc181942e6',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                '2ae3a011f4bb5650c04b34099a7d1a4a1c7e386b00ea7a06683b50fdc203d6bd',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-17.glb',
              sha256:
                '443ed94c679f49d24fda08b5e60702719a2ea94f4e083678153552ef856b32c8',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                '0507eea68404583ef4a82d058bb8df7d885e45423dd3acb97cc52e4bd554000f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/gnome-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '6fb3631b890cb968a64c8a49b70e580370d0b47c9acde769ee269c7c3992eec3',
              thumbnailUrl:
                '/models/synty/characters/customization/gnome-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                '204110eeee3a1d799fa346c56242f2f441ed7c068d62e8c82feaf2df453a5bff',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:16',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
    'half-orc': {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef: 'half-orc',
      profileRef: 'modular-fantasy-hero-v1:half-orc',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1.08, 1.05, 1.08],
      skeleton: {
        boneCount: 63,
        inverseBindSha256:
          'bfcc6d07d349090c3e4ffe764b6e32bb989aca274c36b04154aaa19a28f84687',
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a-half-orc-olive-40',
        sha256:
          'ef5e37f511a20f94844b729bac2bfb2a0f2341be22da8dcc3e0801d325f15791',
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      bodies: {
        barbarian: {
          combination: 'half-orc:barbarian',
          classRef: 'barbarian',
          outfit: '01',
          url: '/models/synty/characters/customization/half-orc-v1/bodies/half-orc-barbarian-body.glb',
          sha256:
            '7ef2e9be9afb30cbd4a558833218824b5dead005185867d659220b5a82fcbecb',
          fallbackUrl:
            '/models/synty/characters/race-class/half-orc-barbarian.glb',
          fallbackSha256:
            'a59e6cf665da6805968a5112250f49aff16da5f9769de1fb48d16fd889ea09f5',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        fighter: {
          combination: 'half-orc:fighter',
          classRef: 'fighter',
          outfit: '16',
          url: '/models/synty/characters/customization/half-orc-v1/bodies/half-orc-fighter-body.glb',
          sha256:
            'f46baa67ddbf122d9341b2aa40437a27ba9dce5efa5ddd7f62fe62e960528471',
          fallbackUrl:
            '/models/synty/characters/race-class/half-orc-fighter.glb',
          fallbackSha256:
            '2ffcb8d7acf9b0c91fa2075f8a53bcd0be42e05146d3b6b6663dad8eeaf11c12',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        monk: {
          combination: 'half-orc:monk',
          classRef: 'monk',
          outfit: '08',
          url: '/models/synty/characters/customization/half-orc-v1/bodies/half-orc-monk-body.glb',
          sha256:
            '69650d30c5bf1996c61476fd9e133767f8b870a0f588d18daa35c15983a45a4b',
          fallbackUrl: '/models/synty/characters/race-class/half-orc-monk.glb',
          fallbackSha256:
            '2d344f5b2f3c1da9e6a643821fc210e939db9f4d17a5f3f48e54cbda7ed57b9f',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
        rogue: {
          combination: 'half-orc:rogue',
          classRef: 'rogue',
          outfit: '10',
          url: '/models/synty/characters/customization/half-orc-v1/bodies/half-orc-rogue-body.glb',
          sha256:
            '82c1e23e4cc87233c1a1c136700c59155fc661045730ae80d8dc6f82321408ee',
          fallbackUrl: '/models/synty/characters/race-class/half-orc-rogue.glb',
          fallbackSha256:
            '82dd6fb1bcb5e054c268d3648ba223a3a41f4538bf83cdb72750b05d24824048',
          animations: ['Idle_Relaxed', 'Walk_Forward'],
        },
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: 'modular-fantasy-hero:hair:08',
          },
          options: [
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:01',
              label: 'Hair 01',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-01.glb',
              sha256:
                '6fc3922db236e4a3f0a6c4d5e26bcd2caa5b2104ba1c456cebc640ab91886428',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-01.png',
              thumbnailSha256:
                'f20b12fda5f5bf296dfdbec1e4df5d2c725797c2de10bfb3d474c977c6e4b0c8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:02',
              label: 'Hair 02',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-02.glb',
              sha256:
                '1819d5615d397e69c35ca41e4fbe680405c258d0d33e526efe079c1593c71428',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-02.png',
              thumbnailSha256:
                '39b6360b0c1f587fd048f51694817f71c74d3b6ca8310a936235844532d77f70',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:03',
              label: 'Hair 03',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-03.glb',
              sha256:
                '46b85456b29789b22faf4cb7b1d12e8ed323f7f57b881851f143fc3b5008a143',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-03.png',
              thumbnailSha256:
                '05b64313da122b376722cad060da33d0bc74fdcf0b7a16f1d61e4b2be2ddba09',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:04',
              label: 'Hair 04',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-04.glb',
              sha256:
                '79ff4df2ec29b90bafa96e174a57df5f6f610d8535a4d9d9345dd67b18675d7d',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-04.png',
              thumbnailSha256:
                '012498119a374630ca32e96a9c6675ede49c180a1ea27dde52a6650a82615785',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:05',
              label: 'Hair 05',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-05.glb',
              sha256:
                '0ce8292b83db21c9592ae4e2984622a93293a308ea6fbf8219bfa9efd247568e',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-05.png',
              thumbnailSha256:
                'd61e8167e6ac2f8f1321b586ce9dc64e1e602a354bdc12b4b1335312413e56d4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:06',
              label: 'Hair 06',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-06.glb',
              sha256:
                'bcc8e8fd9e32e8c2a8355bbfc039e9de0e574f1165ddae59c3fb281c96a27300',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-06.png',
              thumbnailSha256:
                '1f1438eddd8af677a3024154c0362b6580298002eba87fa5c27c58dcf17764f4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:07',
              label: 'Hair 07',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-07.glb',
              sha256:
                'd1f573404ce857f4fb98766bf999de22848855733dd2e6b6f701a4f07e10fca5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-07.png',
              thumbnailSha256:
                'b093d839d164d27db3482c67c0a2a524c7d2925e23bf093efbb57993af883fd8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:08',
              label: 'Hair 08',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-08.glb',
              sha256:
                'f2f6f9efc8dea503908a407af05ef2aa2800f89d455d7b52213c4526399faba9',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-08.png',
              thumbnailSha256:
                '7de01b3b71ef8f6bcd25818f3a0d50ba0c34a42d7e20d4250ce9d24164db53aa',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:09',
              label: 'Hair 09',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-09.glb',
              sha256:
                '3cd508315e0994432877c3a151653d955dc9daa0f9a6958ac3126e000100318a',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-09.png',
              thumbnailSha256:
                '62036f4bc04e1775bf77dff9c596d4346c46f02b086a503c37b478d6c85a219b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:10',
              label: 'Hair 10',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-10.glb',
              sha256:
                '0fc60fcbae411f7479bc55b2fe97878e3457cba9a408afe1ae4652b54723ad1e',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-10.png',
              thumbnailSha256:
                'ff9c13a518e0b016132c4617571d8701c7ce7dc9b3ef8112f8e8294d0e096d4b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:11',
              label: 'Hair 11',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-11.glb',
              sha256:
                '0c4d2be45f2d6dcd191043ce4da7222d3492a2d91e79b415745403de97e148a8',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-11.png',
              thumbnailSha256:
                'cfe37f9eee7d2078f9f0ac0213f06211b2cf747f000081a7d11225e5f133b206',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:12',
              label: 'Hair 12',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-12.glb',
              sha256:
                '962f5d6b6438fb249f5ab75a283b3c638b35eec076c55ee9afc9bca54e572779',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-12.png',
              thumbnailSha256:
                'd989cb6f412960099f8f81e10086c605c66fd8fb795d46f585160ebd6b182883',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:13',
              label: 'Hair 13',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-13.glb',
              sha256:
                '9b98acaea7b4c6680aabb8d2b3d1a4b88908e1d47b163b4ba5db7644d3e63be1',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-13.png',
              thumbnailSha256:
                '7cb8edecace6149a6b0872e0213d7ee8a0e303b32246c788ba311efb4efd9e47',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:14',
              label: 'Hair 14',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-14.glb',
              sha256:
                '12267ddf06b8c42ff8f9651ac5274efd7e7e5cc2ea0cbb11b8689cdac3416faf',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-14.png',
              thumbnailSha256:
                'af92f145e37d931c8497d5747f4fb8ebbc8dc46c9ea194100b630d2c4155df2d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:15',
              label: 'Hair 15',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-15.glb',
              sha256:
                '7c2e85e32071d70605e870b3783d6e387a41c994e1f459965943506861b7e7ac',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-15.png',
              thumbnailSha256:
                '40095fe3e5cb32102953e9b105d7efb5376465c545b15a6cfa5e71be1d5a88da',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:16',
              label: 'Hair 16',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-16.glb',
              sha256:
                'fd39473ce02327ac66748640005b7dae15296a4dc89a8ae4350ffb8e82eb6ab7',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-16.png',
              thumbnailSha256:
                'fd2c37aec156a72b1b8174975347aa3e5998ba306019a298d44277723a5d80bc',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:17',
              label: 'Hair 17',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-17.glb',
              sha256:
                'e2c953ccb7af9e94ec5d6b83850780d7787475e06ac02005b560bd815732be66',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-17.png',
              thumbnailSha256:
                '1bbf9194687329dc45206db391944035cc9e82b8541474e0353db9c61b5a5633',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:18',
              label: 'Hair 18',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-18.glb',
              sha256:
                '5d23187a752d0f4fdb51606f8621fdfeaf33cc2aac312de16e736955253a28a2',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-18.png',
              thumbnailSha256:
                'e398d4fe57118cf90d9559053d2f07f84e057ccd074a8f862c20b16bb300b9da',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:19',
              label: 'Hair 19',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-19.glb',
              sha256:
                '4e2a3945aaa567bca0e4e74b1277863c4926e103fb637c1734d174e7da293a4c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-19.png',
              thumbnailSha256:
                '514d9a11352bf3ab098209d1b0e2f52f6deb1c5fa67c4c91aacf89acb62bde15',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:20',
              label: 'Hair 20',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-20.glb',
              sha256:
                'e5dae8bd666974b4048e065495522e85240070aaa41eb426b021cb4fec7dfa5a',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-20.png',
              thumbnailSha256:
                '43d6fd2abbb878e888e1b56f311383871b85407d893b0758f8a3a651301cf708',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:21',
              label: 'Hair 21',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-21.glb',
              sha256:
                '2dfd9bb2ece8817bf314175c08fed6069603de9fabb7780619826fe1effacd90',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-21.png',
              thumbnailSha256:
                '7e462edcd67683deaf76df567ce2f71cb2548c5c267b63369034809dde97e83e',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:22',
              label: 'Hair 22',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-22.glb',
              sha256:
                'e4104fbb5301d6c691378673320146550cbf26ea315b9927372d1e3f2d0f221c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-22.png',
              thumbnailSha256:
                'c81dc3640962fe81d0d0a5c3c625fbb2f08e68edc21791511a7d3e4aa5bd5b1b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:23',
              label: 'Hair 23',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-23.glb',
              sha256:
                '7994cbe07a030d1b6686a1ad9a754b56ea68bf93539046ae29df1646eb99c833',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-23.png',
              thumbnailSha256:
                'e03b7a4336502c62be421ebf5fda4e68baee6c59ddce2c1b142ad56d1397e86c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:24',
              label: 'Hair 24',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-24.glb',
              sha256:
                '9035bace1c2bb93845be341483ec9d6254b0f7ccef55fa3af0efbf7cb58bbc32',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-24.png',
              thumbnailSha256:
                '2cd35684cbaeb681507701aa0ae1ff77fb95a482c82d54fdb23d1397c4c1aee7',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:25',
              label: 'Hair 25',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-25.glb',
              sha256:
                '059c8c12fb9b3de0b235902fc48de78089de9e6bfe48fbd8ffb2f021fc8e6122',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-25.png',
              thumbnailSha256:
                'c82c589c0d8f5073db45bb723d2311513d7301b6f530cff536a2b86c6b733df6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:26',
              label: 'Hair 26',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-26.glb',
              sha256:
                'f58e25eb515e4a3797a9280a342dce01e04e61b26b8f73efe9312b10e4993892',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-26.png',
              thumbnailSha256:
                '1e48999873d52280af981e990cf60ee7dae32757f7cc1b15c9a46e342fdc4254',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:27',
              label: 'Hair 27',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-27.glb',
              sha256:
                '25c15cdba0f8301d244189e0e980f6511094606d5c25a1956ccca39d443f238e',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-27.png',
              thumbnailSha256:
                '76cebf8fa93c6f84780411676c8580ea634e5d57023a17f73ead7130ff34d390',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:28',
              label: 'Hair 28',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-28.glb',
              sha256:
                'ea51a768bac413afa5436ec991252c22ff317432374eb2f0aa11a64f44817cfa',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-28.png',
              thumbnailSha256:
                '7438ca48b2171329a3dd865baa8c3b79c3327f0c35a3d3287352395ff84aa24d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:29',
              label: 'Hair 29',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-29.glb',
              sha256:
                '07ac6b3c9d7e221eca8c5ffe26afc5b5ee1fae41eacdf70511f8712770b06f14',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-29.png',
              thumbnailSha256:
                'f7ab2459156811ed735185abf7f4bcbb21cf0098e86478a7450af35255828d00',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:30',
              label: 'Hair 30',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-30.glb',
              sha256:
                '4e624c051867d2fad4e1d82fa8da7d04abbd57183aba1a18b989d973a9c74a87',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-30.png',
              thumbnailSha256:
                '2b29f29101af95b95ac39825a77302f62a30a54e7c453028c5daf6fccb0cd4d4',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:31',
              label: 'Hair 31',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-31.glb',
              sha256:
                '9b06fd09aac7c4e924fc64f9e11c6abc4d79cc9cd4d25ec2304bab24185aa09f',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-31.png',
              thumbnailSha256:
                '0a04ddc7a411064de41fee833614ce2c37ac3d25f150855192686d72ead1f29f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:32',
              label: 'Hair 32',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-32.glb',
              sha256:
                'b1279fd4e6e7c8376fadf87ce0ff16fbaacbcdba2402a42d44e4ec928adc3a42',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-32.png',
              thumbnailSha256:
                '5c378cc5209758052140333c221d75a43d2bcff549b17d29d0e7447e4e7cdd50',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:33',
              label: 'Hair 33',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-33.glb',
              sha256:
                '87d902aef28ff3978ac3e33d98b7732343296b1ff74ce1776f793223dea7ef82',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-33.png',
              thumbnailSha256:
                'e40ed5fc1bcf05913a72a1ed93324edd4a877e581f7a8d3876cb3c64cde7597c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:34',
              label: 'Hair 34',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-34.glb',
              sha256:
                '3ccc179f82d5e7fba59f5ed3036ad46e4005d0b9d7ef26bc97d9b0b9b25c246e',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-34.png',
              thumbnailSha256:
                '13d60feb3b55eba9c96c3d067ee03fc4cb194922dd1e80ea8dd4ecb63d6db7b6',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:35',
              label: 'Hair 35',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-35.glb',
              sha256:
                'd7e473af1e77f26559f929977edc1bcbffe2313c6ed36a90611356506828ed21',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-35.png',
              thumbnailSha256:
                'd69abb93cea90cffcf1850c2829ff1e39cb1e40df39a6f73c21cf241335be330',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:36',
              label: 'Hair 36',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-36.glb',
              sha256:
                '8696fb0bebbf2599dd2738b26ca82d08239dc61c15727ca15afa684ca7e6c997',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-36.png',
              thumbnailSha256:
                '41c7412df906d79e0b293dcd1609cc02759d94cb17851e37dfd1414f35f2ce43',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:37',
              label: 'Hair 37',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-37.glb',
              sha256:
                '5cd4bf7541be260105cc4b5385f18cc5ad0c399548984f8e64d8c2d41e069b89',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-37.png',
              thumbnailSha256:
                '0007ddde0f35e6a99aaaf9d4831ccdde5889def85ef67a597ccfcd42e6fbf7b5',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'scalp',
              styleRef: 'modular-fantasy-hero:hair:38',
              label: 'Hair 38',
              url: '/models/synty/characters/customization/half-orc-v1/scalp/hair-38.glb',
              sha256:
                'a7463875d4bdfb402fb876174c57f5a6ce3f5ac5100ebfdf52eae5d573db7195',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/scalp/hair-38.png',
              thumbnailSha256:
                '72e2a9bd04288e3ad958f7dd6027013a94d0375657198195f3343f0b097befc1',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
        facialHair: {
          defaultSelection: {
            kind: 'none',
          },
          options: [
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:01',
              label: 'Facial Hair 01',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-01.glb',
              sha256:
                'cc8131cdb14e5b39c728de1969f9965aa9732e67f2d21e56e4e382259e536b25',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-01.png',
              thumbnailSha256:
                'b4321ceb26d7ad6c844180067657a0fb35b64acdec1daa33e2615978716e5a12',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:02',
              label: 'Facial Hair 02',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-02.glb',
              sha256:
                'bba7ced6923e567f2f0498d46ce35089647ba8d97021f810bc02c4e16436ec74',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-02.png',
              thumbnailSha256:
                '6204bc24226fa5253cc854b9101cd9b357ed1117669f5ad64c5ad862d0699476',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:03',
              label: 'Facial Hair 03',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-03.glb',
              sha256:
                '30072f6baa12ee6bf697d8e531012b291672f456a5304b9c29888640e2d59eff',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-03.png',
              thumbnailSha256:
                'e430e705d433d1e0391a8b58b6bdccfcbe87de6a36b737f153a688a191070594',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:04',
              label: 'Facial Hair 04',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-04.glb',
              sha256:
                '349eec0a03b0982b50a5f555b2274034a7a142ac72329387110cd04a509d0517',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-04.png',
              thumbnailSha256:
                'e13a1489099486b1816a73257922fa545f12493c1390c7217dcc7b94037e1805',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:05',
              label: 'Facial Hair 05',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-05.glb',
              sha256:
                '4e5a74d37d0af09303da9417f6f007889f076ed1de4cb625668ee6e6c7aedcaf',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-05.png',
              thumbnailSha256:
                'e936ba2456cf1b7c7c0a68028852c446a276860269f4c5262fe7d7572d1712c3',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:06',
              label: 'Facial Hair 06',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-06.glb',
              sha256:
                'a774a735f44933c68b23086491100c44eae1153d87cbf9ff48dc39d8e053655c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-06.png',
              thumbnailSha256:
                '4e5707f42259635dabdf0875ff3ca0732be0b42d144bc43a28566a357c3aaa41',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:07',
              label: 'Facial Hair 07',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-07.glb',
              sha256:
                'd8298a40962c4c913f8578188f7c2d3796ebc6498d22280b7ba063cfe357cc47',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-07.png',
              thumbnailSha256:
                '58f999066499ae84664567ad0fd015ab9950182fc12be6366a63e371bd4ff99c',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:08',
              label: 'Facial Hair 08',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-08.glb',
              sha256:
                '4a13126a75a4a463dd8aab5754eb0b590c51dfde1a4f4f13c6af87b908f6491c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-08.png',
              thumbnailSha256:
                '8fc7bf81690400c1d85580be736215025a1645eff63feeced931d79bf539e37b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:09',
              label: 'Facial Hair 09',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-09.glb',
              sha256:
                '0caa403994bc0cb715874bf56bacb3d4e91ad695171f63e5cc706ef51f537bdb',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-09.png',
              thumbnailSha256:
                'd6eccd55b8d50b46e302af24afbbe7dfb6630b84c7aa8763d91de0d33376f89b',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:10',
              label: 'Facial Hair 10',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-10.glb',
              sha256:
                'af612f33aa43c79f8ef94b49d10c6c313efb3d5232a665f22048b7fb129b04f5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-10.png',
              thumbnailSha256:
                '240ef9fbca30dbdfe1712681fc2c529f9729188a32d2512cd5b3e39fe033eb5d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:11',
              label: 'Facial Hair 11',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-11.glb',
              sha256:
                '72bf5f9684cb441513ded7d30f91a7e653449df95330dcf190a714ddd3f38831',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-11.png',
              thumbnailSha256:
                'd6023d07ec5efce92f5e118026168efabb9e08a22048272325f86004f2c8db84',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:12',
              label: 'Facial Hair 12',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-12.glb',
              sha256:
                '8f997e817a7388b831c38881452a5f7ec628551f00ad468e55df2ec4cd302e94',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-12.png',
              thumbnailSha256:
                '7c76156b9b5971ea1f70a342f643b39984ada6378b100d7fd8518e833db95f4d',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:13',
              label: 'Facial Hair 13',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-13.glb',
              sha256:
                '0a6c39cb23d7d554e2328ed7a51a5cda81899279165076852a6d417298ae376c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-13.png',
              thumbnailSha256:
                'f1f00bd171af86ab480a28fb38f250680d0c137f4f3abcca755240560e8c0dcd',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:14',
              label: 'Facial Hair 14',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-14.glb',
              sha256:
                '1e662c64d40b2b8b073b80e6780e67757179a8b2653c0e6b231dfef6f99d6075',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-14.png',
              thumbnailSha256:
                '8edb3aea916ebe13e119072f721287654f99adb8c3840df22651b55d7ab49d40',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:15',
              label: 'Facial Hair 15',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-15.glb',
              sha256:
                '449f62f1a2b19e4c5e884e0454416aacfefc3eba849ea74f3e6440da1a39ce7c',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-15.png',
              thumbnailSha256:
                'c19bacece81a0728bf6612404b558c13fdf3678a5253ccda87ef95ddab4b6cad',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:16',
              label: 'Facial Hair 16',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-16.glb',
              sha256:
                '3e866c18b09651b3670108e401c962390b171c5589d275122b2c03af5822560d',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-16.png',
              thumbnailSha256:
                '63613a07309b7775256458344bf69935c670e5b3a47bf390e79c65e266c416a8',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:17',
              label: 'Facial Hair 17',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-17.glb',
              sha256:
                '926a7cc4625d9530d7734266394f892d87e7eb1ed2c460e56aa9eca3f973b42d',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-17.png',
              thumbnailSha256:
                'c8a868a7d02cf7fb0c3edcb15aa9e76e0d29d16166b07161a5e083fdbbb7f19f',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
            {
              slot: 'facial-hair',
              styleRef: 'modular-fantasy-hero:facial-hair:18',
              label: 'Facial Hair 18',
              url: '/models/synty/characters/customization/half-orc-v1/facial-hair/facial-hair-18.glb',
              sha256:
                '191f2b97af599510178202bec6d6ee3eae4fa84a3ed4fff1a684e5b56553b9a5',
              thumbnailUrl:
                '/models/synty/characters/customization/half-orc-v1/thumbnails/facial-hair/facial-hair-18.png',
              thumbnailSha256:
                'c8ed8382d1bccc3faa135f894a3f3cee036bf830bc19e3817b3a6df3718bcc73',
              animations: [],
              material: {
                mode: 'uniform-pbr-v1',
                count: 1,
                textureCount: 0,
                opaque: true,
              },
            },
          ],
        },
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 5912613,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalp: {
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:08',
        },
        facialHair: {
          kind: 'none',
        },
        colorSrgb: 5912613,
        roughness: 0.72,
        metalness: 0,
      },
    },
  },
  outfits: {
    barbarian: {
      classRef: 'barbarian',
      outfit: '01',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/barbarian-01.png',
      maskSha256:
        'fde645aec1ae6470c806515d1a2c254497edace9174906af58e1d8ff28415316',
      defaultPrimaryColorSrgb: 4810366,
      defaultSecondaryColorSrgb: 13739084,
      meshNames: [
        'Chr_Torso_Male_01',
        'Chr_Hips_Male_01',
        'Chr_ArmUpperLeft_Male_01',
        'Chr_ArmUpperRight_Male_01',
        'Chr_ArmLowerLeft_Male_01',
        'Chr_ArmLowerRight_Male_01',
        'Chr_HandLeft_Male_01',
        'Chr_HandRight_Male_01',
        'Chr_LegLeft_Male_01',
        'Chr_LegRight_Male_01',
      ],
    },
    fighter: {
      classRef: 'fighter',
      outfit: '16',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/fighter-16.png',
      maskSha256:
        '64573ee074597ffd53f34a7d4e1f81537793298ac6fe08cfa14169b2b86b589c',
      defaultPrimaryColorSrgb: 4810366,
      defaultSecondaryColorSrgb: 13739084,
      meshNames: [
        'Chr_Torso_Male_16',
        'Chr_Hips_Male_16',
        'Chr_ArmUpperLeft_Male_16',
        'Chr_ArmUpperRight_Male_16',
        'Chr_ArmLowerLeft_Male_16',
        'Chr_ArmLowerRight_Male_16',
        'Chr_HandLeft_Male_16',
        'Chr_HandRight_Male_16',
        'Chr_LegLeft_Male_16',
        'Chr_LegRight_Male_16',
      ],
    },
    monk: {
      classRef: 'monk',
      outfit: '08',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/monk-08.png',
      maskSha256:
        '45c2ef4b128e9b144ff245cd5b302f4017ce0b2f5b42828bfeb5d610fb9492ef',
      defaultPrimaryColorSrgb: 4810366,
      defaultSecondaryColorSrgb: 13739084,
      meshNames: [
        'Chr_Torso_Male_08',
        'Chr_Hips_Male_08',
        'Chr_ArmUpperLeft_Male_08',
        'Chr_ArmUpperRight_Male_08',
        'Chr_ArmLowerLeft_Male_08',
        'Chr_ArmLowerRight_Male_08',
        'Chr_HandLeft_Male_08',
        'Chr_HandRight_Male_08',
        'Chr_LegLeft_Male_08',
        'Chr_LegRight_Male_08',
      ],
    },
    rogue: {
      classRef: 'rogue',
      outfit: '10',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/rogue-10.png',
      maskSha256:
        '45c2ef4b128e9b144ff245cd5b302f4017ce0b2f5b42828bfeb5d610fb9492ef',
      defaultPrimaryColorSrgb: 4810366,
      defaultSecondaryColorSrgb: 13739084,
      meshNames: [
        'Chr_Torso_Male_10',
        'Chr_Hips_Male_10',
        'Chr_ArmUpperLeft_Male_10',
        'Chr_ArmUpperRight_Male_10',
        'Chr_ArmLowerLeft_Male_10',
        'Chr_ArmLowerRight_Male_10',
        'Chr_HandLeft_Male_10',
        'Chr_HandRight_Male_10',
        'Chr_LegLeft_Male_10',
        'Chr_LegRight_Male_10',
      ],
    },
  },
} as const satisfies CharacterCustomizationCatalog);
