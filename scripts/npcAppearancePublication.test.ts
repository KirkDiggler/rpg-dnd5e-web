// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  GENERATED_NPC_APPEARANCES,
  GENERATED_NPC_APPEARANCE_PROVIDER,
  NPC_APPEARANCE_CATALOG,
  NPC_WEAPON_SETS,
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

const KINGDOM_MODELS = [
  'blacksmith-female-01',
  'blacksmith-male-01',
  'hermit-01',
  'jester-01',
  'king-01',
  'mage-cape-01',
  'merchant-01',
  'monk-01',
  'nun-01',
  'peasant-female-01',
  'peasant-male-01',
  'priest-01',
  'prince-01',
  'princess-01',
  'rider-01',
  'soldier-female-01',
  'soldier-male-01',
] as const;

const selection = JSON.parse(
  readFileSync(
    new URL('./configs/npc-appearance-releases.json', import.meta.url),
    'utf8'
  )
) as {
  releases: {
    releaseId: string;
    appearances: {
      assetRef: string;
      displayName: string;
      standingSha256: string;
      downedSha256: string;
    }[];
  }[];
};

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
    '1518fca36d874ef31613d3adb1acf8b414332eca31692940a52d4ceeb9bfa444',
    '1b69eb82c8322f5b396dfb84caf22b80ab3de5cad9abe887a7d6bec5a7fbac0d',
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
    '345fac3cdcb4a834c8c375e111bdce96469afd1a93a6866612e2fa07c2d304df',
    '1930c99620ab1d139ff50576a2eac26190fe29489d8595edb067631b3a9a8211',
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
    '4da6ee6c5ca60612463e524a6e848daba9529329cd48cc875800cc8c71573482',
    'f966c83d0da90c4d5d33a43b7bd747f19e28664e2f6e67edb333ef24369e171a',
  ],
  'dnd5e:npcs:goblin:prisoner-02': [
    '0aece9cf96b50f4c10db03ac8c2376c571a13b0c76c38c24add486bc5b50b8c5',
    'b9897ac957b88c48820f766bd2ce8ce9a9a0126e5d983fb8e696d2e034ec35d5',
  ],
  'dnd5e:npcs:goblin:prisoner-03': [
    '46dbc9f460d844784c1946fcd402cdfe2768a67f59a6eb5c9dfad8a922ed8f6a',
    '3399d5e00847a22ee175c357a8192ec1df080d26ca6622ade9d410d0a2c9578e',
  ],
  'dnd5e:npcs:goblin:ranger-01': [
    '673756c0dbb33d09090cb713fea08545ac7d6672a16dd7c95ed372f2ce9408d2',
    'f03c555e0fd9b0f1a4c81ef8f3260a6af2e8dad350a6d360e1cfb301190642ab',
  ],
  'dnd5e:npcs:goblin:wizard-01': [
    '8d6c1b6cd7d3d7627b15a81069d7ec90e54a7ce348e5eb0582544c55009af163',
    'a74ec0c987b6f5f8d6d608a960ad255d2dd430dc0adecf470896e2b0f17aa410',
  ],
};

describe('approved NPC appearance publication', () => {
  it('exports 13 pack defaults, 66 human palettes and 204 Kingdom looks without provider extras', () => {
    expect(GENERATED_NPC_APPEARANCE_PROVIDER).toMatchObject({
      commit: 'fa590ed40f1aadedb6add6074f8dc6efa07dd457',
      releases: [
        'goblin-human-palettes-v2',
        'goblin-war-camp-v1',
        'kingdom-npcs-v1',
        'kingdom-palettes-v1',
      ],
    });
    expect(NPC_APPEARANCE_CATALOG).toHaveLength(283);
    expect(new Set(NPC_APPEARANCE_CATALOG)).toEqual(
      new Set(Object.values(GENERATED_NPC_APPEARANCES))
    );
    expect(
      new Set(NPC_APPEARANCE_CATALOG.map(({ assetRef }) => assetRef))
    ).toEqual(
      new Set(
        selection.releases.flatMap((release) =>
          release.appearances.map((appearance) => appearance.assetRef)
        )
      )
    );
    expect(Object.keys(GENERATED_NPC_APPEARANCES)).toHaveLength(283);
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
      expect(appearance!.pose).toMatch(/50-(?:bone|joint)/);
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

  it('adopts Kingdom refs without deriving filenames, rules, weapons or Castle aliases', () => {
    const declared = selection.releases.find(
      (release) => release.releaseId === 'kingdom-npcs-v1'
    )!.appearances;
    expect(declared).toHaveLength(17);
    for (const name of KINGDOM_MODELS) {
      const ref = `dnd5e:npcs:kingdom:${name}`;
      const appearance = resolveNpcAppearance(ref)!;
      const expected = declared.find((entry) => entry.assetRef === ref)!;
      expect(appearance).toMatchObject({
        releaseId: 'kingdom-npcs-v1',
        assetRef: ref,
        displayName: expected.displayName,
        rulesRef: null,
        sourcePack: 'polygon-fantasy-kingdom',
        jointCount: 55,
        forwardAxis: '+Z',
        animationClips: ['Idle_Relaxed', 'Walk_Forward'],
        standingUrl: `/models/synty/npcs/castle-${name}.glb`,
        downedUrl: `/models/synty/npcs/castle-${name}-downed.glb`,
        standingSha256: expected.standingSha256,
        downedSha256: expected.downedSha256,
      });
      expect(appearance.sourceName).toMatch(/^SK_Chr_/);
      expect(resolveNpcAppearance(`dnd5e:npcs:castle:${name}`)).toBeUndefined();
      expect(NPC_WEAPON_SETS.some((set) => set.appearanceRef === ref)).toBe(
        false
      );
    }
  });

  it('publishes only approved exact-body weapon sets without adding rules-bound bodies to the appearance palette', () => {
    expect(NPC_WEAPON_SETS.map((set) => set.appearanceRef)).toEqual([
      'dnd5e:npcs:goblin:warrior-male-01',
      'dnd5e:npcs:skeleton:soldier-01',
    ]);
    expect(
      NPC_WEAPON_SETS.map((set) =>
        set.weapons.map((weapon) => weapon.weaponRef)
      )
    ).toEqual([
      ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow'],
      ['dnd5e:weapons:shortsword', 'dnd5e:weapons:shortbow'],
    ]);
    expect(
      resolveNpcAppearance('dnd5e:npcs:skeleton:soldier-01')
    ).toBeUndefined();
    for (const set of NPC_WEAPON_SETS) {
      expect(set.bodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(set.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const weapon of set.weapons) {
        expect(weapon.itemRef).toBe(
          weapon.weaponRef.replace('dnd5e:weapons:', 'dnd5e:item:')
        );
        expect(weapon.weaponUrl).toMatch(
          /^\/models\/synty\/npcs\/weapons\/.+\.glb$/
        );
        expect(weapon.socket.bone).toBe('Hand_R');
      }
    }
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
