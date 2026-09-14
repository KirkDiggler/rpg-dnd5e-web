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
      declaration.verb === Verb.CAST &&
      declaration.spell?.name !== 'Vicious Mockery'
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
  },
]);

/**
 * This metadata exists only because SpellRef exposes ref/name only. It does
 * not infer cantrips, level, or legality from generated facts.
 */
export const ORGANIZED_HUD_PRESENTATION = {
  // Stable two-offer capacity at phone widths. The omitted spell shortcuts
  // remain in Spells, and the extra weapon remains in All actions.
  quickDeclarationIds: ['offer:aldric:move', 'offer:aldric:longsword:action'],
  sectionByDeclarationId: {
    mockery: 'spells',
    bane: 'spells',
    'fire-bolt': 'spells',
    command: 'spells',
    guidance: 'spells',
  },
} as const;
