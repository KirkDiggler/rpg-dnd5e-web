/**
 * GENERATED FILE — DO NOT EDIT.
 * Provider commit: 37c13c68b6cfc87ad6684351f934b4ff1fd83515
 * Race/class manifest SHA-256: 6a0cf1fb99389c8b66ce34dbb60943d88af98f2181bfc28646deffe7260460eb
 */

export type BardAppearanceRaceRef =
  | 'dwarf'
  | 'elf'
  | 'gnome'
  | 'half-elf'
  | 'halfling'
  | 'half-orc'
  | 'human'
  | 'tiefling';
export interface BardAppearance {
  readonly combination: `${BardAppearanceRaceRef}:bard`;
  readonly raceRef: `dnd5e:races:${BardAppearanceRaceRef}`;
  readonly classRef: 'dnd5e:classes:bard';
  readonly url: string;
  readonly sha256: string;
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly boneCount: 63;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly defaultPalette: string;
}
export interface BardAppearanceCatalog {
  readonly schemaVersion: 1;
  readonly workflowVersion: 'bard-race-class-appearances-v1';
  readonly classRef: 'dnd5e:classes:bard';
  readonly raceOrder: readonly BardAppearanceRaceRef[];
  readonly appearances: Readonly<Record<BardAppearanceRaceRef, BardAppearance>>;
}

export const BARD_APPEARANCE_PROVIDER = Object.freeze({
  providerCommit: '37c13c68b6cfc87ad6684351f934b4ff1fd83515',
  manifestSha256:
    '6a0cf1fb99389c8b66ce34dbb60943d88af98f2181bfc28646deffe7260460eb',
} as const);

export const BARD_APPEARANCE_CATALOG = Object.freeze({
  schemaVersion: 1,
  workflowVersion: 'bard-race-class-appearances-v1',
  classRef: 'dnd5e:classes:bard',
  raceOrder: [
    'dwarf',
    'elf',
    'gnome',
    'half-elf',
    'halfling',
    'half-orc',
    'human',
    'tiefling',
  ],
  appearances: {
    dwarf: {
      combination: 'dwarf:bard',
      raceRef: 'dnd5e:races:dwarf',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/dwarf-bard.glb',
      sha256:
        '128e78dd9973dba9404ff3b1204f9937f6cc2ab4116ab152f1c914bab7d73688',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    elf: {
      combination: 'elf:bard',
      raceRef: 'dnd5e:races:elf',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/elf-bard.glb',
      sha256:
        '2636f6131910b07cd0ef3915e2834709e92a5c64151496c0ae970edcc879bdd8',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    gnome: {
      combination: 'gnome:bard',
      raceRef: 'dnd5e:races:gnome',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/gnome-bard.glb',
      sha256:
        '989bc26ebaf1cd82a27a8a9130e5c415d3b6fc14b72eec580c7a7a451b0d7136',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    'half-elf': {
      combination: 'half-elf:bard',
      raceRef: 'dnd5e:races:half-elf',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/half-elf-bard.glb',
      sha256:
        '0173a9d5a366f2f5d67da23d8925ad80f055651420c1be9cf02c968c9b71436b',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    halfling: {
      combination: 'halfling:bard',
      raceRef: 'dnd5e:races:halfling',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/halfling-bard.glb',
      sha256:
        '196075978e2b2fce8ac14e8dc8612fe4d12c0d1cc3c3a8066c23685fc00565b6',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    'half-orc': {
      combination: 'half-orc:bard',
      raceRef: 'dnd5e:races:half-orc',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/half-orc-bard.glb',
      sha256:
        '1b4cc33d3b858122229842802c39ebabe3e0a0658fd8dd9e612f2514ac765bce',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a-half-orc-olive-40',
    },
    human: {
      combination: 'human:bard',
      raceRef: 'dnd5e:races:human',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/human-bard.glb',
      sha256:
        '767de0dde82ae92605239b183ed510ad3523aa132781c070b702844478a84832',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '01-a',
    },
    tiefling: {
      combination: 'tiefling:bard',
      raceRef: 'dnd5e:races:tiefling',
      classRef: 'dnd5e:classes:bard',
      url: '/models/synty/characters/race-class/tiefling-bard.glb',
      sha256:
        '2f2d75034b3604e607ed315b8604151e98c1c4ee1e4fa642509ff3f8f10eda28',
      rigFamily: 'modular-fantasy-hero-v1',
      boneCount: 63,
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      defaultPalette: '02-a-tiefling-crimson',
    },
  },
} as const satisfies BardAppearanceCatalog);
