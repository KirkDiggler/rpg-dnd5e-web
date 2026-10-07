import type { ActionIconPresentation } from '@/components/session/combat-experience/organizedActionPresentation';
import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  AttackRefSchema,
  CastOptionSchema,
  CostComponentSchema,
  Currency,
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  SpellRefSchema,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  CharacterDataSchema,
  ResourceViewSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { ORGANIZED_HUD_PROFILES } from '../organized-hud/fixtures';
import type { HudConceptProfile } from '../organized-hud/OrganizedHudConcept';

const base = ORGANIZED_HUD_PROFILES[0].fixtures[0]!;
const refused = (text: string) =>
  create(ShortfallSchema, { reason: ShortfallReason.NO_BUDGET, text });
const candidates = (members: string[]) =>
  members.map((member) =>
    create(TargetCandidateSchema, { member, available: true })
  );
const enemies = candidates(['skeleton-guard', 'skeleton-archer']);
const allies = candidates(['aldric', 'mira']);
const spell = (
  id: string,
  name: string,
  targets: ReturnType<typeof candidates>,
  leveled: boolean,
  bonus = false
): Declaration =>
  create(DeclarationSchema, {
    id,
    verb: Verb.CAST,
    spell: create(SpellRefSchema, { ref: `dnd5e:spells:${id}`, name }),
    slot: bonus ? Slot.BONUS : Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: targets,
    minTargets: 1,
    maxTargets: 1,
    cost: leveled
      ? [
          create(CostComponentSchema, {
            currency: Currency.CHARGES,
            needed: 1,
            label: '1st-level Spell Slots',
          }),
        ]
      : [],
  });
const declarations = [
  ...base.declarations.filter(
    (offer) => offer.verb === Verb.MOVE || offer.verb === Verb.END_TURN
  ),
  create(DeclarationSchema, {
    id: 'mace',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: enemies,
    attack: create(AttackRefSchema, {
      ref: 'dnd5e:weapons:mace',
      name: 'Mace',
    }),
  }),
  spell('resistance', 'Resistance', allies, false),
  spell('toll-the-dead', 'Toll the Dead', enemies, false),
  create(DeclarationSchema, {
    ...spell('bane', 'Bane', enemies, true),
    maxTargets: 2,
  }),
  create(DeclarationSchema, {
    ...spell('bless', 'Bless', allies, true),
    maxTargets: 2,
  }),
  create(DeclarationSchema, {
    ...spell('command', 'Command', enemies, true),
    options: [
      create(CastOptionSchema, { id: 'grovel', label: 'Grovel' }),
      create(CastOptionSchema, { id: 'flee', label: 'Flee' }),
    ],
  }),
  spell('cure-wounds', 'Cure Wounds', allies, true),
  spell('healing-word', 'Healing Word', allies, true, true),
  ...['Dash', 'Dodge'].map((name) =>
    create(DeclarationSchema, {
      id: name.toLowerCase(),
      verb: Verb.ACTIVATE,
      slot: Slot.ACTION,
      available: true,
      targetKind: TargetKind.NONE,
      ability: create(AbilityRefSchema, {
        ref: `dnd5e:abilities:${name.toLowerCase()}`,
        name,
      }),
    })
  ),
];

// Visual proposals only. These keys cannot create an offer or decide a rule.
const art = (
  family: string,
  file: string,
  fallback: string,
  tone: ActionIconPresentation['tone']
): ActionIconPresentation => ({
  src: `/models/synty/interface-preview/ICON_DarkFantasy_${family}_${file}_Clean.png`,
  fallback,
  tone,
});
// Artificial density samples, not an expanded cleric spell list. The words
// describe the pictured glyph, not invented rules, legality, or class access.
const densityGlyphs = [
  ['Element', 'Fire_01', 'Ember', 'gold'],
  ['Element', 'Ice_01', 'Frost', 'blue'],
  ['Element', 'Air_02', 'Wind', 'blue'],
  ['Element', 'Earth_02', 'Stone', 'green'],
  ['Inventory', 'Spellbooks_01', 'Tome', 'violet'],
  ['Inventory', 'Magic_03', 'Rune', 'violet'],
  ['Inventory', 'Potions_01', 'Potion', 'green'],
  ['Inventory', 'Plants_01', 'Growth', 'green'],
  ['Inventory', 'Staves_01', 'Staff', 'gold'],
  ['Stat', 'Accuracy_01', 'Aim', 'gold'],
  ['Stat', 'Luck_01', 'Luck', 'green'],
  ['Stat', 'Spirit_01', 'Spirit', 'blue'],
  ['Stat', 'Strength_02', 'Might', 'gold'],
  ['Stat', 'Wisdom_01', 'Insight', 'blue'],
  ['Status', 'Blinded_01', 'Blindness', 'violet'],
  ['Status', 'Bleeding_01', 'Blood', 'violet'],
  ['Status', 'Charmed_01', 'Charm', 'violet'],
  ['Status', 'Entangled_01', 'Vines', 'green'],
  ['Status', 'Invisble_01', 'Veil', 'blue'],
  ['Status', 'Poisoned_01', 'Poison', 'green'],
  ['Status', 'Shocked_01', 'Spark', 'blue'],
  ['Status', 'Time_01', 'Time', 'gold'],
  ['Status', 'Wet_01', 'Water', 'blue'],
  ['Status', 'Vampiric_01', 'Fangs', 'violet'],
  ['Status', 'Stealthy_01', 'Stealth', 'blue'],
] as const;
const densityDeclarations = densityGlyphs.map((glyph, index) =>
  spell(
    `layout-sample-${index + 1}`,
    `Layout sample ${index + 1} — ${glyph[2]}`,
    enemies,
    false
  )
);

export const CLERIC_ICONS: Readonly<Record<string, ActionIconPresentation>> = {
  ...Object.fromEntries(
    densityGlyphs.map(([family, file, , tone], index) => [
      `layout-sample-${index + 1}`,
      art(family, file, String(index + 1), tone),
    ])
  ),
  'offer:aldric:move': art('Stat', 'Speed_02', 'Mv', 'blue'),
  mace: art('Inventory', 'Maces_01', 'Ma', 'gold'),
  resistance: art('Status', 'DefenseUp_03', 'Re', 'blue'),
  'toll-the-dead': art('Status', 'Dead_01', 'Td', 'violet'),
  bane: art('Status', 'Cursed_03', 'Ba', 'violet'),
  bless: art('Status', 'Fortified_01', 'Bl', 'gold'),
  command: art('Stat', 'Mind_01', 'Co', 'blue'),
  'cure-wounds': art('Status', 'Health_02', 'Cw', 'green'),
  'healing-word': art('Status', 'FortifiedHealth_01', 'Hw', 'green'),
  dash: art('Status', 'SpeedUp_01', 'Da', 'blue'),
  // Coverage gap: a stealth hood is NOT an evasion symbol. Keep an honest
  // labeled placeholder until Dodge has appropriate dedicated artwork.
  dodge: { src: '', fallback: 'Do', tone: 'blue' },
};
const martial = ORGANIZED_HUD_PROFILES[1];
export const DESKTOP_HOTBAR_PROFILES: readonly HudConceptProfile[] = [
  {
    id: 'cleric',
    label: 'Cleric',
    presentation: {
      quickDeclarationIds: [
        'mace',
        'offer:aldric:move',
        'resistance',
        'toll-the-dead',
      ],
      quickGroupByDeclarationId: {
        resistance: 'cantrips',
        'toll-the-dead': 'cantrips',
      },
      sectionByDeclarationId: { dash: 'abilities', dodge: 'abilities' },
    },
    desktopIcons: CLERIC_ICONS,
    fixtures: [
      'ready',
      'spent-action',
      'spent-slots',
      'crowded',
      'stale-authority',
      'spectator',
    ].map((id) => ({
      ...base,
      id,
      label: (
        {
          ready: 'Ready',
          'spent-action': 'Action spent',
          'spent-slots': 'Slots spent',
          crowded: '36 icons (layout only)',
          'stale-authority': 'Stale authority',
          spectator: 'Spectator',
        } as Record<string, string>
      )[id]!,
      description:
        'Cleric-style layout fixture. Browse spells directly; no live character or rules execution.',
      viewerName: 'Cleric fixture',
      viewerClassRefId: undefined,
      authorityFresh: id !== 'stale-authority',
      participants: base.participants.map((participant) => ({
        ...participant,
        active:
          id === 'spectator'
            ? participant.member === 'skeleton-archer'
            : participant.active,
      })),
      declarations: (id === 'crowded'
        ? [...declarations, ...densityDeclarations]
        : declarations
      ).map((offer) => {
        const reason =
          id === 'spent-action' && offer.slot === Slot.ACTION
            ? 'action: 1 needed, 0 left'
            : id === 'spent-slots' && offer.cost.length > 0
              ? '1st-level Spell Slots: 1 needed, 0 left'
              : null;
        return reason
          ? create(DeclarationSchema, {
              ...offer,
              available: false,
              why: refused(reason),
            })
          : offer;
      }),
      characterData: create(CharacterDataSchema, {
        ...base.characterData,
        features: [],
        conditions: [],
        classRef: undefined,
        resources: [
          create(ResourceViewSchema, {
            key: 'spell_slots_1',
            name: '1st-level Spell Slots',
            current: id === 'spent-slots' ? 0 : 2,
            maximum: 2,
          }),
        ],
      }),
    })),
  },
  {
    ...martial,
    desktopIcons: {
      'offer:aldric:move': CLERIC_ICONS['offer:aldric:move']!,
      'offer:aldric:longsword:action': art(
        'Inventory',
        'Swords_01',
        'Ls',
        'gold'
      ),
      shortbow: art('Inventory', 'Bows_01', 'Sb', 'gold'),
      'second-wind': art('Status', 'Health_01', 'Sw', 'green'),
      dash: CLERIC_ICONS.dash!,
      dodge: CLERIC_ICONS.dodge!,
    },
  },
];
