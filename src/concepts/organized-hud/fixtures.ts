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
import { SESSION_COMBAT_FIXTURES } from '../session-combat/fixtures';

const base = SESSION_COMBAT_FIXTURES[0]!;
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
  ...base.declarations,
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
  ...base.declarations,
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
