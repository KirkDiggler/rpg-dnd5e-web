import { buildActStory } from '@/components/session/combat-experience/actStory';
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
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
    },
  }
);
