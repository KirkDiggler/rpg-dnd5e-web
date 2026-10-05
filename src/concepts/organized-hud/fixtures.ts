import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
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
  TargetEffectSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  CharacterDataSchema,
  ResourceViewSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { SESSION_COMBAT_FIXTURES } from '../session-combat/fixtures';

const base = SESSION_COMBAT_FIXTURES[0]!;

/**
 * Afford-shaped effect rows (rpg-project#520) for the longsword, so the action
 * inspection and target panel can be looked at without a server. Every string
 * is fixture content standing in for what the toolkit authors; the shared UI
 * renders it verbatim and recognises none of it. One row per tone, and one
 * row whose answer changes per target.
 */
const LONGSWORD_ID = 'offer:aldric:longsword:action';
const longswordEffects = [
  create(EffectRowSchema, {
    id: 'dnd5e:features:sneak_attack',
    ref: 'dnd5e:features:sneak_attack',
    name: 'Sneak Attack',
    description:
      'Once per turn, deal extra damage to a creature you hit with a finesse or ranged weapon when you have advantage or another enemy of the target is within 5 feet of it.',
    state: EffectState.DEPENDS,
    reason: 'Depends on the target',
    participation: EffectParticipation.CONTRIBUTES_NOW,
  }),
  create(EffectRowSchema, {
    id: 'dnd5e:conditions:raging',
    ref: 'dnd5e:conditions:raging',
    name: 'Raging',
    description:
      'While raging, melee weapon attacks using Strength deal extra damage.',
    state: EffectState.APPLIES,
    reason: 'The melee weapon attack uses Strength',
    participation: EffectParticipation.CONTRIBUTES_NOW,
    benefit: '+2 damage',
  }),
  create(EffectRowSchema, {
    id: 'dnd5e:conditions:blessed@mira',
    ref: 'dnd5e:conditions:blessed',
    name: 'Bless',
    description: 'Add 1d4 to attack rolls and saving throws.',
    state: EffectState.APPLIES,
    reason: 'Adds to the attack roll',
    participation: EffectParticipation.CONTRIBUTES_NOW,
    benefit: '+1d4 to the attack roll',
  }),
  create(EffectRowSchema, {
    id: 'dnd5e:conditions:blessed@brother-ansel',
    ref: 'dnd5e:conditions:blessed',
    name: 'Bless',
    description: 'Add 1d4 to attack rolls and saving throws.',
    state: EffectState.DOES_NOT_APPLY,
    reason: 'Another Bless already adds to this roll',
    participation: EffectParticipation.CONTRIBUTES_NOW,
  }),
  create(EffectRowSchema, {
    id: 'dnd5e:conditions:inspired@lyra',
    ref: 'dnd5e:conditions:inspired',
    name: 'Bardic Inspiration',
    description:
      'Once, add the inspiration die to an attack roll, ability check or saving throw after seeing the roll.',
    state: EffectState.APPLIES,
    reason: 'The holder is making an attack roll',
    participation: EffectParticipation.LATER_CHOICE,
    benefit: 'May add 1d6 after seeing the roll',
  }),
  create(EffectRowSchema, {
    id: 'dnd5e:conditions:fighting_style_dueling',
    ref: 'dnd5e:conditions:fighting_style_dueling',
    name: 'Fighting Style: Dueling',
    description:
      'Wielding a melee weapon in one hand and no other weapon, gain +2 to damage rolls with it.',
    state: EffectState.UNAVAILABLE,
    reason: 'This effect cannot yet say whether it applies to this action',
    participation: EffectParticipation.CONTRIBUTES_NOW,
  }),
];
const targetAnswers: Record<string, ReturnType<typeof answer>[]> = {
  'skeleton-guard': [
    answer(
      EffectState.APPLIES,
      'Another enemy of the target is within 5 feet',
      '+1d6 damage'
    ),
  ],
  'skeleton-archer': [
    answer(
      EffectState.DEPENDS,
      'Needs advantage or another enemy of the target within 5 feet'
    ),
  ],
};
function answer(state: EffectState, reason: string, benefit = '') {
  return create(TargetEffectSchema, {
    id: 'dnd5e:features:sneak_attack',
    state,
    reason,
    benefit,
  });
}
const withEffectRows = (declaration: Declaration): Declaration =>
  declaration.id === LONGSWORD_ID
    ? create(DeclarationSchema, {
        ...declaration,
        effects: longswordEffects,
        candidates: declaration.candidates.map((candidate) =>
          create(TargetCandidateSchema, {
            ...candidate,
            effects: targetAnswers[candidate.member] ?? [],
          })
        ),
      })
    : declaration;
const baseDeclarations = base.declarations.map(withEffectRows);
const refused = (text: string) =>
  create(ShortfallSchema, { reason: ShortfallReason.NO_BUDGET, text });
const targets = [
  create(TargetCandidateSchema, { member: 'skeleton-guard', available: true }),
  create(TargetCandidateSchema, { member: 'skeleton-archer', available: true }),
  create(TargetCandidateSchema, {
    member: 'mira',
    available: false,
    why: refused('Mira is not a valid target for this declaration.'),
  }),
];
const spell = (id: string, name: string, available = true): Declaration =>
  create(DeclarationSchema, {
    id,
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available,
    why: available
      ? undefined
      : refused('Level 1 spell slot: 1 needed, 0 left.'),
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 1,
    candidates: targets,
    spell: create(SpellRefSchema, { ref: `dnd5e:spells:${id}`, name }),
  });
const ability = (id: string, name: string): Declaration =>
  create(DeclarationSchema, {
    id,
    verb: Verb.ACTIVATE,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.NONE,
    ability: create(AbilityRefSchema, { ref: `dnd5e:abilities:${id}`, name }),
  });
const secondWeapon = create(DeclarationSchema, {
  id: 'shortbow',
  verb: Verb.ATTACK,
  slot: Slot.ACTION,
  available: true,
  targetKind: TargetKind.MEMBER,
  candidates: targets,
  attack: create(AttackRefSchema, {
    ref: 'dnd5e:weapons:shortbow',
    name: 'Shortbow',
  }),
});
const bane = create(DeclarationSchema, {
  ...spell('bane', 'Bane'),
  minTargets: 1,
  maxTargets: 2,
  candidates: targets,
  cost: [
    create(CostComponentSchema, {
      currency: Currency.CHARGES,
      needed: 1,
      label: 'Level 1 spell slot',
    }),
  ],
});
const command = create(DeclarationSchema, {
  ...spell('command', 'Command'),
  options: [
    create(CastOptionSchema, { id: 'grovel', label: 'Grovel' }),
    create(CastOptionSchema, { id: 'flee', label: 'Flee' }),
  ],
});
const crowded = [
  ...baseDeclarations,
  secondWeapon,
  ability('dash', 'Dash'),
  ability('dodge', 'Dodge'),
  spell('mockery', 'Vicious Mockery'),
  bane,
  spell('fire-bolt', 'Fire Bolt'),
  command,
  spell('guidance', 'Guidance'),
];

/** Exact generated declaration fixtures plus separate, provisional display hints. */
export const ORGANIZED_HUD_FIXTURES = Object.freeze([
  {
    ...base,
    authorityFresh: true,
    id: 'full-slots',
    label: 'Full slots',
    description:
      'Fresh Afford offers with crowded spells, target cardinality, and server-authored cast options.',
    declarations: crowded,
  },
  {
    ...base,
    authorityFresh: true,
    id: 'spent-slots',
    label: 'Spent slots',
    description:
      'Spent spell offers remain visible with their provider-authored refusal; repeatables remain available.',
    declarations: crowded.map((declaration) =>
      ['bane', 'command'].includes(declaration.id)
        ? create(DeclarationSchema, {
            ...declaration,
            available: false,
            why: refused('Level 1 spell slot: 1 needed, 0 left.'),
          })
        : declaration
    ),
  },
  {
    ...base,
    authorityFresh: true,
    id: 'spectator',
    label: 'Spectator',
    description: 'The shell preserves its existing spectator gate.',
    declarations: crowded,
    participants: base.participants.map((participant) => ({
      ...participant,
      active: participant.member === 'skeleton-archer',
    })),
  },
  {
    ...base,
    id: 'stale-authority',
    label: 'Stale authority',
    description:
      'Current declarations are displayed but cannot dispatch until authority is fresh.',
    authorityFresh: false,
    declarations: crowded,
  },
]);

/**
 * This metadata exists only because SpellRef exposes ref/name only. It does
 * not infer cantrips, level, or legality from generated facts.
 */
export const ORGANIZED_HUD_PRESENTATION = {
  // Basic fixture shortcuts. Each profile adds its common actions; all frames
  // use the same candidates and measured width determines group overflow.
  quickDeclarationIds: ['offer:aldric:move', 'offer:aldric:longsword:action'],
  sectionByDeclarationId: {
    mockery: 'spells',
    bane: 'spells',
    'fire-bolt': 'spells',
    command: 'spells',
    guidance: 'spells',
  },
} as const;

// Archetype fixtures, not class detection or live recommendation rules.
const generalSections = { dash: 'actions', dodge: 'actions' } as const;
const secondWind = create(DeclarationSchema, {
  ...ability('second-wind', 'Second Wind'),
  slot: Slot.BONUS,
});
const martialDeclarations = [
  ...baseDeclarations,
  secondWeapon,
  ability('dash', 'Dash'),
  ability('dodge', 'Dodge'),
  secondWind,
];

export const ORGANIZED_HUD_PROFILES = [
  {
    id: 'caster',
    label: 'Caster',
    presentation: {
      quickDeclarationIds: [
        ...ORGANIZED_HUD_PRESENTATION.quickDeclarationIds,
        'mockery',
        'fire-bolt',
        'guidance',
      ],
      quickGroupByDeclarationId: {
        mockery: 'cantrips',
        'fire-bolt': 'cantrips',
        guidance: 'cantrips',
      },
      sectionByDeclarationId: {
        ...ORGANIZED_HUD_PRESENTATION.sectionByDeclarationId,
        ...generalSections,
      },
    },
    fixtures: ORGANIZED_HUD_FIXTURES.map((fixture) => ({
      ...fixture,
      viewerName: 'Caster fixture',
      viewerClassRefId: undefined,
      description:
        'Caster layout sample: repeatable shortcuts and limited-use spells. Mixed repertoire, not a legal character-build fixture.',
      characterData: create(CharacterDataSchema, {
        ...fixture.characterData,
        classRef: undefined,
        features: [],
        conditions: [],
        resources: [
          create(ResourceViewSchema, {
            key: 'spell_slots_1',
            name: '1st-level Spell Slots',
            current: fixture.id === 'spent-slots' ? 0 : 2,
            maximum: 2,
          }),
        ],
      }),
    })),
  },
  {
    id: 'martial',
    label: 'Martial',
    presentation: {
      quickDeclarationIds: [
        ...ORGANIZED_HUD_PRESENTATION.quickDeclarationIds,
        'second-wind',
      ],
      quickGroupByDeclarationId: { 'second-wind': 'features' },
      sectionByDeclarationId: generalSections,
    },
    fixtures: ORGANIZED_HUD_FIXTURES.map((fixture) => ({
      ...fixture,
      label:
        fixture.id === 'full-slots'
          ? 'Feature ready'
          : fixture.id === 'spent-slots'
            ? 'Feature spent'
            : fixture.label,
      description:
        'Martial layout sample: weapons, general actions, and a single active feature shown directly.',
      declarations: martialDeclarations.map((declaration) =>
        fixture.id === 'spent-slots' && declaration.id === 'second-wind'
          ? create(DeclarationSchema, {
              ...declaration,
              available: false,
              why: refused('Second Wind: no uses left.'),
            })
          : declaration
      ),
      characterData: create(CharacterDataSchema, {
        ...fixture.characterData,
        features: fixture.characterData?.features.filter(
          (feature) => feature.resourceKey === 'second_wind'
        ),
        resources: [
          create(ResourceViewSchema, {
            key: 'second_wind',
            name: 'Second Wind',
            current: fixture.id === 'spent-slots' ? 0 : 1,
            maximum: 1,
          }),
        ],
      }),
    })),
  },
] as const;
