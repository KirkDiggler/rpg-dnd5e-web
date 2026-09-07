/**
 * GENERATED FILE — DO NOT EDIT.
 * Provider schema-v2 projection: nested slot objects are intentional consumer truth.
 * Provider commit: 69a229aabe4a366039dd06a68148a8ff9e0ca4e8
 * Source manifest SHA-256: 10ba18b4281ea65b757d959ab7caa888adced2b106e2dc3b2e6ae0d19688ba4a
 */

export type DwarfStarterClass = 'barbarian' | 'fighter' | 'monk' | 'rogue';
export type DwarfCustomizationSlot = 'scalp' | 'facial-hair';

export interface DwarfStyleOption {
  readonly slot: DwarfCustomizationSlot;
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

export interface DwarfCustomizationBody {
  readonly combination: string;
  readonly classRef: DwarfStarterClass;
  readonly outfit: string;
  readonly url: string;
  readonly sha256: string;
  readonly fallbackUrl: string;
  readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}

export interface DwarfCustomizationCatalog {
  readonly schemaVersion: 2;
  readonly workflowVersion: 'character-customization-v1';
  readonly raceRef: 'dwarf';
  readonly profileRef: 'modular-fantasy-hero-v1:dwarf';
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly proportions: readonly [1.08, 0.78, 1.08];
  readonly skeleton: {
    readonly boneCount: 63;
    readonly inverseBindSha256: string;
  };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: {
    readonly id: '01-a';
    readonly sha256: string;
    readonly dimensions: readonly [1024, 1024];
  };
  readonly socketProfile: {
    readonly id: 'modular-fantasy-hero-main-hand-v1';
    readonly bone: 'Hand_R';
    readonly boneUnitMeters: 0.01;
    readonly positionMeters: readonly [number, number, number];
    readonly rotationQuaternion: readonly [number, number, number, number];
    readonly scale: 1;
  };
  readonly bodies: Readonly<Record<DwarfStarterClass, DwarfCustomizationBody>>;
  readonly slots: {
    readonly scalp: {
      readonly defaultStyleRef: string;
      readonly options: readonly DwarfStyleOption[];
    };
    readonly facialHair: {
      readonly defaultStyleRef: string;
      readonly options: readonly DwarfStyleOption[];
    };
  };
  readonly surface: {
    readonly mode: 'uniform-pbr-v1';
    readonly defaultColorSrgb: number;
    readonly defaultRoughness: number;
    readonly defaultMetalness: number;
  };
  readonly defaults: {
    readonly scalpStyleRef: string;
    readonly facialHairStyleRef: string;
    readonly colorSrgb: number;
    readonly roughness: number;
    readonly metalness: number;
  };
}

export const DWARF_CUSTOMIZATION_CATALOG = Object.freeze({
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
    sha256: '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
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
      fallbackUrl: '/models/synty/characters/race-class/dwarf-barbarian.glb',
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
      defaultStyleRef: 'modular-fantasy-hero:hair:04',
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
      defaultStyleRef: 'modular-fantasy-hero:facial-hair:02',
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
    scalpStyleRef: 'modular-fantasy-hero:hair:04',
    facialHairStyleRef: 'modular-fantasy-hero:facial-hair:02',
    colorSrgb: 5912613,
    roughness: 0.72,
    metalness: 0,
  },
} as const satisfies DwarfCustomizationCatalog);
