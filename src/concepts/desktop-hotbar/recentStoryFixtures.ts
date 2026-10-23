import { buildActStory } from '@/components/session/combat-experience/actStory';
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  DamageType,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
// Already-resolved authored examples; not commands or simulated rule outcomes.
export const RECENT_IDENTITY_SAMPLES = buildActStory(
  [
    create(ActSchema, {
      session: 'fixture',
      id: 'reminder-attack',
      family: Family.ACT,
      verb: 'attack',
      body: {
        case: 'attack',
        value: {
          by: member('skeleton-guard'),
          to: member('aldric'),
          attack: { ref: 'dnd5e:weapons:longsword', name: 'Longsword' },
          outcome: AttackOutcome.MISS,
          roll: { expression: '1d20 + 4', total: 13, against: 16 },
        },
      },
    }),
    create(ActSchema, {
      session: 'fixture',
      id: 'reminder-speak',
      family: Family.ACT,
      verb: 'speak',
      body: {
        case: 'speak',
        value: {
          by: member('mira'),
          to: member('aldric'),
          line: 'We are not alone.',
        },
      },
    }),
    create(ActSchema, {
      session: 'fixture',
      id: 'reminder-cast',
      family: Family.ACT,
      verb: 'cast',
      body: {
        case: 'cast',
        value: {
          by: member('mira'),
          spell: { ref: 'dnd5e:spells:bless', name: 'Bless' },
          targets: [member('aldric')],
        },
      },
    }),
    create(ActSchema, {
      session: 'fixture',
      id: 'reminder-hit',
      family: Family.ACT,
      verb: 'attack',
      body: {
        case: 'attack',
        value: {
          by: member('aldric'),
          to: member('zombie'),
          attack: {
            ref: 'dnd5e:weapons:rapier',
            name: 'Rapier',
            damageType: DamageType.PIERCING,
          },
          outcome: AttackOutcome.HIT,
          critical: true,
          damage: 9,
          roll: {
            expression: '1d20 + 4',
            total: 24,
            against: 16,
            terms: [{ count: 1, dieSize: 20, faces: [20] }],
            modifiers: [{ value: 4, source: 'Attack modifier' }],
          },
          damageComponents: [
            {
              source: 'weapon',
              damageType: DamageType.PIERCING,
              roll: {
                expression: '2d8',
                total: 7,
                dice: [3, 4],
                terms: [{ count: 2, dieSize: 8, faces: [3, 4] }],
              },
            },
            {
              source: 'ability',
              damageType: DamageType.PIERCING,
              roll: {
                expression: '2',
                total: 2,
                modifiers: [{ source: 'ability', value: 2 }],
              },
            },
          ],
        },
      },
    }),
    create(ActSchema, {
      session: 'fixture',
      id: 'reminder-incoming',
      family: Family.ACT,
      verb: 'attack',
      body: {
        case: 'attack',
        value: {
          by: member('zombie'),
          to: member('aldric'),
          attack: {
            ref: 'fixture:attacks:slam',
            name: 'Slam',
            damageType: DamageType.BLUDGEONING,
          },
          outcome: AttackOutcome.HIT,
          damage: 3,
          roll: { expression: '1d20 + 3', total: 17, against: 16 },
          damageComponents: [
            {
              source: 'Slam',
              damageType: DamageType.BLUDGEONING,
              roll: { expression: '1d6 + 1', total: 3 },
            },
          ],
        },
      },
    }),
  ].map((act) => ({
    act,
    index: 0,
    seq: 1n,
    source: 'live' as const,
    visible: true,
  })),
  {
    viewerMember: 'aldric',
    memberNames: {
      'skeleton-guard': 'Skeleton guard',
      aldric: 'Aldric',
      mira: 'Mira',
      zombie: 'Zombie',
    },
  }
);

export const HEALING_TOAST_SAMPLE = buildActStory(
  [
    {
      act: create(ActSchema, {
        session: 'fixture',
        id: 'toast-healing',
        family: Family.ACT,
        verb: 'activate',
        body: {
          case: 'activate',
          value: {
            by: member('aldric'),
            ability: { name: 'Healing' },
            results: [
              {
                kind: 'healed',
                target: member('aldric'),
                amount: 6,
                requested: 6,
                before: 4,
                after: 10,
                roll: {
                  expression: '1d8 + 2',
                  total: 6,
                  dice: [4],
                  modifiers: [{ source: 'bonus', value: 2 }],
                },
              },
            ],
          },
        },
      }),
      index: 0,
      seq: 1n,
      source: 'live',
      visible: true,
    },
  ],
  { viewerMember: 'aldric', memberNames: { aldric: 'Aldric' } }
)[0]!;
