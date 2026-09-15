// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  GENERATED_NPC_APPEARANCES,
  GENERATED_NPC_APPEARANCE_PROVIDER,
  NPC_APPEARANCE_CATALOG,
  resolveNpcAppearance,
} from '../src/generated/npcAppearanceCatalog';

const APPROVED_REFS = [
  'dnd5e:npcs:goblin:warrior-male-01',
  'dnd5e:npcs:goblin:archer-male-01',
  'dnd5e:npcs:goblin:archer-female-01',
  'dnd5e:npcs:goblin:knight-01',
  'dnd5e:npcs:goblin:shaman-01',
  'dnd5e:npcs:goblin:king-01',
  'dnd5e:npcs:goblin:beast-tamer-01',
  'dnd5e:npcs:goblin:cook-01',
  'dnd5e:npcs:goblin:prisoner-01',
  'dnd5e:npcs:goblin:prisoner-02',
  'dnd5e:npcs:goblin:prisoner-03',
  'dnd5e:npcs:goblin:ranger-01',
  'dnd5e:npcs:goblin:wizard-01',
] as const;

const EXPECTED_LABELS: Readonly<Record<string, string>> = {
  'dnd5e:npcs:goblin:warrior-male-01': 'Warrior Male 01',
  'dnd5e:npcs:goblin:archer-male-01': 'Archer Male 01',
  'dnd5e:npcs:goblin:archer-female-01': 'Archer Female 01',
  'dnd5e:npcs:goblin:knight-01': 'Knight 01',
  'dnd5e:npcs:goblin:shaman-01': 'Shaman 01',
  'dnd5e:npcs:goblin:king-01': 'King 01',
  'dnd5e:npcs:goblin:beast-tamer-01': 'Beast Tamer 01',
  'dnd5e:npcs:goblin:cook-01': 'Cook 01',
  'dnd5e:npcs:goblin:prisoner-01': 'Prisoner 01',
  'dnd5e:npcs:goblin:prisoner-02': 'Prisoner 02',
  'dnd5e:npcs:goblin:prisoner-03': 'Prisoner 03',
  'dnd5e:npcs:goblin:ranger-01': 'Ranger 01',
  'dnd5e:npcs:goblin:wizard-01': 'Wizard 01',
};

const EXPECTED_HASHES: Readonly<Record<string, readonly [string, string]>> = {
  'dnd5e:npcs:goblin:warrior-male-01': [
    '2cb9c964d1b587b1a1a7115df65766ca32dbe86d00a80879dc8732a83f682c22',
    '617800a4c3b2d2aaa535b3c718154f953939accb74fdc07fa25b680d0ce1d843',
  ],
  'dnd5e:npcs:goblin:archer-male-01': [
    'f149b4a950cca28a37f452d88a63a627b4a4aa1f4c00a810d9035cba3c5c2614',
    'e621e035f365c41d478c91fbb6b008f02675be90e9d1012d28f027a7c08b2071',
  ],
  'dnd5e:npcs:goblin:archer-female-01': [
    '3d9263f5768cc57c2df42d0092535e7f012f8ba3adbc5792822374ee49c086a7',
    '1385fb00a17a5e3429ba4d039fc0c1ed52fc78a5a6fe9f07ea66580f663803eb',
  ],
  'dnd5e:npcs:goblin:knight-01': [
    'd8f31c9058322ad8e6682aa1e33ec1f34dea50d2b8918389dda0ad453075e372',
    '8bb6c4ba24eccb70092c4ab0e08ec024e173b375f788a9db63b069f73e80ddb8',
  ],
  'dnd5e:npcs:goblin:shaman-01': [
    '9aa2a48e0c152398c581f693f1d2a14c3d7edadcacdcfdeb62a0486c6b4f9f20',
    'b486c8143a653e34d10a35646eddad5317b93f943a673de6ae457de56ad8da27',
  ],
  'dnd5e:npcs:goblin:king-01': [
    '4c3517ca43d8add315c90d1a48879120b51d5a209f8c02ea6482761a8ab193f6',
    '035950254845fb224f5666e9609bca2060a2603ccc37818f2c4be9dec80bdb6a',
  ],
  'dnd5e:npcs:goblin:beast-tamer-01': [
    '886eaacbd6121ba955ef5ea9e924cda4a0de39385631e9484d1e32d1261a6064',
    'a028e1f558f2f718d7ab1746b304d745dcc5f47c5ba30ed7225e1ebfec34d017',
  ],
  'dnd5e:npcs:goblin:cook-01': [
    'b217624604a004e78ba7b3267edebd7e26d2b05de5bf9c215789b2419b853795',
    'ab4c86e1e1929621378e8f261997bff23f9e96a640b3ad90c6f612760aefd42c',
  ],
  'dnd5e:npcs:goblin:prisoner-01': [
    '0c5535d587009dfe0657d12ee6b9fd703f12d282e58c2799e628f965aa3885d6',
    'fbfc3e4dbe0a7643fdecd56ef1eb0259c46a8b6ceac5bf5659461bf83ec46356',
  ],
  'dnd5e:npcs:goblin:prisoner-02': [
    '758ce0e950044f6b90ea7e3c684f13813fa0b52014d81e6aead12060b6c69389',
    '5049bcd1c9be36b4125135c91faabec522f64635e313b54f17a825cdeb0d5147',
  ],
  'dnd5e:npcs:goblin:prisoner-03': [
    'a738215711177dad9e8cfbf2552d8b4b6128962d754055c7a10dabe6108a3c50',
    'edbf48297b1ce8d851013cfae5f57d687e21d110a0a6e3b499818b14ad800843',
  ],
  'dnd5e:npcs:goblin:ranger-01': [
    '27f03eb0f3ca1e9968b76a6baaea1472c420e160d496cc3c0df2e046d2311172',
    '7a658e8f37dac3e924736fae784752bae0f7197c5056de81d9b24488a34994bb',
  ],
  'dnd5e:npcs:goblin:wizard-01': [
    '1c7ade7d4eb1536ff85db8195d775eb308764493310070f716054f3878852285',
    '4a6042dd3237c30378db7b990d3c72c29128c818cac687d3163c19c7b99ac6bd',
  ],
};

describe('approved NPC appearance publication', () => {
  it('exports exactly the 13 approved unique identities and no provider extras', () => {
    expect(GENERATED_NPC_APPEARANCE_PROVIDER).toMatchObject({
      commit: '85fdf94bf55ac3cd40db0d79fa65dbfac4f98563',
      releases: ['goblin-war-camp-v1'],
    });
    expect(NPC_APPEARANCE_CATALOG).toHaveLength(13);
    expect(new Set(NPC_APPEARANCE_CATALOG)).toEqual(
      new Set(Object.values(GENERATED_NPC_APPEARANCES))
    );
    expect(
      new Set(NPC_APPEARANCE_CATALOG.map(({ assetRef }) => assetRef))
    ).toEqual(new Set(APPROVED_REFS));
    expect(Object.keys(GENERATED_NPC_APPEARANCES)).toHaveLength(13);
  });

  it('retains exact standing/downed hashes, URLs, null rules, and provider-declared rig/pose metadata', () => {
    const modelUrls = new Set<string>();
    for (const ref of APPROVED_REFS) {
      const appearance = resolveNpcAppearance(ref);
      expect(appearance).toBe(GENERATED_NPC_APPEARANCES[ref]);
      expect(appearance).toBeDefined();
      expect(appearance!.displayName).toBe(EXPECTED_LABELS[ref]);
      expect(appearance!.displayName).not.toContain('Goblin');
      expect(appearance!.rulesRef).toBeNull();
      expect(appearance!.jointCount).toBe(50);
      expect(appearance!.forwardAxis).toBe('+Z');
      expect(appearance!.sourceName).toMatch(/^SM_Chr_/);
      expect(appearance!.sourcePack).toBe('polygon-goblin-war-camp-v2');
      expect(appearance!.animationClips).toEqual([
        'Idle_Relaxed',
        'Walk_Forward',
      ]);
      expect(appearance!.pose).toContain('50-bone');
      expect(appearance!.rootWrapper).toContain('Armature');
      expect(appearance!.standingUrl).toMatch(
        /^\/models\/synty\/npcs\/.+\.glb$/
      );
      expect(appearance!.downedUrl).toMatch(
        /^\/models\/synty\/npcs\/.+-downed\.glb$/
      );
      expect([appearance!.standingSha256, appearance!.downedSha256]).toEqual(
        EXPECTED_HASHES[ref]
      );
      modelUrls.add(appearance!.standingUrl);
      modelUrls.add(appearance!.downedUrl);
    }
    expect(modelUrls.size).toBe(26);
  });

  it('fails exact lookup closed without inferring an NPC, rules default, or inherited object member', () => {
    const diagnostic = vi.fn();
    expect(resolveNpcAppearance('dnd5e:npcs:goblin')).toBeUndefined();

    for (const assetRef of [
      'dnd5e:npcs:not-selected:01',
      'constructor',
      'toString',
      '__proto__',
    ]) {
      expect(resolveNpcAppearance(assetRef, diagnostic)).toBeUndefined();
      expect(diagnostic).toHaveBeenCalledWith({
        assetRef,
        reason: 'unsupported-exact-asset-ref',
      });
    }
    expect(diagnostic).toHaveBeenCalledTimes(4);
  });
});
