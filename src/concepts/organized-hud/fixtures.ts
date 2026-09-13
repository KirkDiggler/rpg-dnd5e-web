import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  SpellRefSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { SESSION_COMBAT_FIXTURES } from '../session-combat/fixtures';

const base = SESSION_COMBAT_FIXTURES[0]!;
const refused = (text: string) =>
  create(ShortfallSchema, { reason: ShortfallReason.NO_BUDGET, text });
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

const crowded = [
  ...base.declarations,
  ability('dash', 'Dash'),
  ability('dodge', 'Dodge'),
  spell('mockery', 'Vicious Mockery'),
  spell('bane', 'Bane'),
  spell('fire-bolt', 'Fire Bolt'),
  spell('command', 'Command', false),
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
      'Fresh Afford offers with crowded spells and repeatable shortcuts.',
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
  quickDeclarationIds: [
    'offer:aldric:move',
    'offer:aldric:longsword:action',
    'mockery',
    'guidance',
  ],
  sectionByDeclarationId: {
    mockery: 'spells',
    bane: 'spells',
    'fire-bolt': 'spells',
    command: 'spells',
    guidance: 'spells',
  },
} as const;
