import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DamageType,
  DeclarationSchema,
  EffectParticipation,
  EffectState,
  ParticipantSchema,
  Slot,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** Generated-message consumer fixtures only. Never imported by live data adapters. */
export function actionInformationOffers(
  unavailable: boolean,
  longText: boolean
): Declaration[] {
  const description = (text: string) =>
    longText ? Array(16).fill(text).join('\n\n') : text;
  const common = {
    available: !unavailable,
    slot: Slot.ACTION,
    why: unavailable
      ? { text: 'Provider says the action is spent.' }
      : undefined,
    targetKind: TargetKind.MEMBER,
    candidates: [
      { member: 'target-a', available: true },
      { member: 'target-b', available: true },
    ],
  };
  return [
    create(DeclarationSchema, {
      ...common,
      id: 'info-warhammer',
      verb: Verb.ATTACK,
      attack: {
        ref: 'dnd5e:weapons:warhammer',
        name: 'Warhammer',
        damageType: DamageType.BLUDGEONING,
      },
      information: {
        description: description(
          'Make a melee attack against a creature in reach.'
        ),
        details: [
          {
            label: 'Base damage',
            value: '1d8 + STR modifier (+3) · Bludgeoning',
          },
          { label: 'Reach', value: '5 ft' },
        ],
      },
      effects: [
        {
          id: 'rage',
          ref: 'dnd5e:conditions:raging',
          name: 'Rage',
          description:
            'Rage can add damage to Strength-based melee weapon attacks.',
          state: EffectState.APPLIES,
          participation: EffectParticipation.CONTRIBUTES_NOW,
          reason: 'This is a Strength-based melee weapon attack.',
          benefit: '+2 damage',
        },
      ],
    }),
    create(DeclarationSchema, {
      ...common,
      id: 'info-bane',
      verb: Verb.CAST,
      spell: { ref: 'dnd5e:spells:bane', name: 'Bane' },
      minTargets: 1,
      maxTargets: 3,
      cost: [{ needed: 1, label: '1st-level Spell Slots' }],
      information: {
        description: description(
          'Use an action to choose up to three creatures within 30 feet. Each makes a Charisma save. On a failure, it subtracts 1d4 from its attack rolls and saving throws while you concentrate; a successful save avoids the curse. The penalty is rerolled for each affected roll, not applied to damage. Requires concentration, up to 1 minute.'
        ),
      },
    }),
    create(DeclarationSchema, {
      ...common,
      id: 'info-dodge',
      verb: Verb.ACTIVATE,
      ability: { ref: 'dnd5e:combat_abilities:dodge', name: 'Dodge' },
      targetKind: TargetKind.NONE,
      candidates: [],
      information: {
        description: description(
          'Attackers have disadvantage against you until your next turn.'
        ),
      },
    }),
    create(DeclarationSchema, {
      ...common,
      id: 'info-command',
      verb: Verb.CAST,
      spell: { ref: 'dnd5e:spells:command', name: 'Command' },
      cost: [{ needed: 1, label: '1st-level Spell Slots' }],
      minTargets: 1,
      maxTargets: 1,
      information: {
        description: description(
          'Give a creature a one-word command. It must obey on its next turn if it fails its saving throw.'
        ),
      },
      options: [
        {
          id: 'approach',
          label: 'Approach',
          description: description(
            'The creature moves toward you on its next turn, then ends its turn.'
          ),
        },
        {
          id: 'flee',
          label: 'Flee',
          description: description(
            'The creature moves away from you on its next turn, then ends its turn.'
          ),
        },
        {
          id: 'grovel',
          label: 'Grovel',
          description: description(
            'The creature falls prone and ends its next turn.'
          ),
        },
      ],
    }),
  ];
}

export const INFORMATION_PARTICIPANTS = [
  create(ParticipantSchema, { member: 'viewer', name: 'Viewer', active: true }),
];
export const INFORMATION_CLOCK = ClockKind.TURN;
