import type { ActionIconPresentation } from '@/components/session/combat-experience/organizedActionPresentation';
import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AbilityRefSchema,
  ActionInformationSchema,
  AttackRefSchema,
  CastOptionSchema,
  CostComponentSchema,
  Currency,
  DeclarationSchema,
  EffectParticipation,
  EffectRowSchema,
  EffectState,
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
    effects: [
      create(EffectRowSchema, {
        id: 'fixture:blessed',
        ref: 'dnd5e:conditions:blessed',
        name: 'Bless',
        description: 'Add 1d4 to attack rolls and saving throws.',
        state: EffectState.APPLIES,
        reason: 'Adds to this attack roll',
        benefit: '+1d4 to the attack roll',
        participation: EffectParticipation.CONTRIBUTES_NOW,
      }),
    ],
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
  create(DeclarationSchema, {
    id: 'unarmed-strike',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: enemies,
    attack: create(AttackRefSchema, {
      ref: 'fixture:unarmed-strike',
      name: 'Unarmed Strike',
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
// Keep the 36-offer stress profile: 12 ordinary offers and 24 artificial ones.
const densityDeclarations = densityGlyphs.flatMap((glyph, index) =>
  index === 23
    ? []
    : [
        spell(
          `layout-sample-${index + 1}`,
          `Layout sample ${index + 1} — ${glyph[2]}`,
          enemies,
          true
        ),
      ]
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
  'unarmed-strike': art('Stat', 'Strength_02', 'Us', 'gold'),
  resistance: art('Status', 'DefenseUp_03', 'Re', 'blue'),
  'toll-the-dead': art('Status', 'Dead_01', 'Td', 'violet'),
  bane: art('Status', 'Cursed_03', 'Ba', 'violet'),
  bless: art('Status', 'Fortified_01', 'Bl', 'gold'),
  command: art('Stat', 'Mind_01', 'Co', 'blue'),
  'cure-wounds': art('Status', 'Health_02', 'Cw', 'green'),
  'healing-word': art('Status', 'FortifiedHealth_01', 'Hw', 'green'),
  dash: art('Status', 'SpeedUp_01', 'Da', 'blue'),
  // Operator-proposed experiment: the same silhouette, distinguished by tint.
  // This is an explicit art choice, not a semantic fact inferred by the UI.
  dodge: art('Status', 'Stealthy_01', 'Do', 'gold'),
};
const EFFECT_ICONS: Readonly<Record<string, ActionIconPresentation>> = {
  'fixture:blessed': art('Status', 'Fortified_01', 'Bl', 'gold'),
  'dnd5e:features:sneak_attack': art('Inventory', 'Daggers_01', 'Sa', 'violet'),
  'dnd5e:conditions:raging': art('Stat', 'Strength_02', 'Ra', 'gold'),
  'dnd5e:conditions:blessed@mira': art('Status', 'Fortified_01', 'Bl', 'gold'),
  'dnd5e:conditions:blessed@brother-ansel': art(
    'Status',
    'Fortified_01',
    'Bl',
    'gold'
  ),
  'dnd5e:conditions:inspired@lyra': art('Stat', 'Spirit_01', 'Bi', 'blue'),
  'dnd5e:conditions:fighting_style_dueling': art(
    'Inventory',
    'Swords_01',
    'Du',
    'gold'
  ),
};
const STORY_SAMPLES: NonNullable<HudConceptProfile['storySamples']> = [
  {
    eyebrow: 'Skeleton Guard · Attack',
    headline: 'Skeleton Guard attacks Aldric',
    detail: 'Aldric turns the blow aside. Miss.',
    tone: 'neutral',
  },
  {
    eyebrow: 'Mira · Movement',
    headline: 'Mira moves into position',
    detail: 'Mira reaches the southern aisle.',
    tone: 'neutral',
  },
  {
    eyebrow: 'Aldric · Healing Word',
    headline: 'Aldric casts Healing Word on Mira',
    detail: 'Mira regains 5 hit points.',
    tone: 'success',
  },
];
const martial = ORGANIZED_HUD_PROFILES[1];
export const DESKTOP_HOTBAR_PROFILES: readonly HudConceptProfile[] = [
  {
    id: 'cleric',
    label: 'Cleric',
    storySamples: STORY_SAMPLES,
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
      desktopSectionByDeclarationId: { dash: 'actions', dodge: 'actions' },
      desktopSpellKindByDeclarationId: {
        resistance: 'cantrip',
        'toll-the-dead': 'cantrip',
        bane: 'leveled',
        bless: 'leveled',
        command: 'leveled',
        'cure-wounds': 'leveled',
        'healing-word': 'leveled',
        ...Object.fromEntries(
          densityDeclarations.map((offer) => [offer.id, 'leveled' as const])
        ),
      },
      desktopEffectIcons: EFFECT_ICONS,
    },
    desktopIcons: CLERIC_ICONS,
    fixtures: [
      'ready',
      'spent-action',
      'spent-slots',
      'crowded',
      'twelve-spells',
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
          'twelve-spells': '12-spell grid',
          'stale-authority': 'Stale authority',
          spectator: 'Spectator',
        } as Record<string, string>
      )[id]!,
      description:
        'Cleric-style layout fixture. Browse spells directly; no live character or rules execution.',
      viewerName: 'Cleric fixture',
      viewerClassRefId: undefined,
      authorityFresh: id !== 'stale-authority',
      debug: [
        {
          id: 1,
          summary: 'Fixture turn ended · inspect JSON',
          text: 'Fixture-only retained event; no live stream or game execution.',
          event: create(EventSchema, {
            seq: 1n,
            at: 40n,
            kind: EventKind.TURN_ENDED,
            body: {
              case: 'turnEnded',
              value: { member: 'aldric', next: 'skeleton-archer' },
            },
          }),
        },
      ],
      participants: base.participants.map((participant) => ({
        ...participant,
        active:
          id === 'spectator'
            ? participant.member === 'skeleton-archer'
            : participant.active,
      })),
      declarations: (id === 'crowded'
        ? [...declarations, ...densityDeclarations]
        : id === 'twelve-spells'
          ? [...declarations, ...densityDeclarations.slice(0, 7)]
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
    presentation: {
      ...martial.presentation,
      desktopSectionByDeclarationId: {
        'second-wind': 'features',
        dash: 'actions',
        dodge: 'actions',
      },
      desktopEffectIcons: EFFECT_ICONS,
    },
    fixtures: martial.fixtures.map((fixture) => ({
      ...fixture,
      declarations: [
        ...fixture.declarations.map((offer) =>
          offer.id === 'offer:aldric:longsword:action'
            ? create(DeclarationSchema, {
                ...offer,
                // Explicit example provider payload, not character-stat
                // inference or a production weapon-description lookup.
                information: create(ActionInformationSchema, {
                  description:
                    'Make a melee attack with the weapon you are wielding.',
                  details: [
                    {
                      label: 'Base damage',
                      value: '1d8 + STR modifier (+3) · Slashing',
                    },
                    { label: 'Grip', value: 'One-handed' },
                  ],
                }),
              })
            : offer
        ),
        declarations.find((offer) => offer.id === 'unarmed-strike')!,
      ],
    })),
    storySamples: STORY_SAMPLES,
    desktopIcons: {
      'offer:aldric:move': CLERIC_ICONS['offer:aldric:move']!,
      'offer:aldric:longsword:action': art(
        'Inventory',
        'Swords_01',
        'Ls',
        'gold'
      ),
      shortbow: art('Inventory', 'Bows_01', 'Sb', 'gold'),
      'unarmed-strike': CLERIC_ICONS['unarmed-strike']!,
      'second-wind': art('Status', 'Health_01', 'Sw', 'green'),
      dash: CLERIC_ICONS.dash!,
      dodge: CLERIC_ICONS.dodge!,
    },
  },
];
