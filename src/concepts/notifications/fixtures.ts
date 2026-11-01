import { buildActStory } from '@/components/session/combat-experience/actStory';
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  DamageComponentSchema,
  Family,
  PartyKind,
  Sense,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { RECENT_IDENTITY_SAMPLES } from '../desktop-hotbar/recentStoryFixtures';

const heard = buildActStory(
  [
    {
      act: create(ActSchema, {
        id: 'heard',
        session: 'fixture',
        family: Family.ACT,
        body: {
          case: 'perception',
          value: {
            observer: { kind: PartyKind.MEMBER, id: 'aldric' },
            sense: Sense.HEARING,
            heard: { kind: 'footsteps', hops: 3 },
          },
        },
      }),
      index: 0,
      seq: 1n,
      source: 'live',
      visible: true,
    },
  ],
  {
    viewerMember: 'aldric',
    memberNames: { aldric: 'Aldric' },
  }
)[0]!;

// Resolved sample facts, not client calculations or a claim about current live labels.
const attack = structuredClone(
  RECENT_IDENTITY_SAMPLES.find(
    (entry) =>
      entry.act?.body.case === 'attack' && entry.act.body.value.damage > 0
  )!
);
if (attack.act?.body.case === 'attack') {
  const component = attack.act.body.value.damageComponents[1];
  if (component) {
    component.source = 'ability';
    component.roll!.modifiers[0]!.source = 'Strength';
    component.roll!.modifiers[0]!.sourceRef = 'dnd5e:abilities:str';
  }
  attack.act.body.value.damage = 11;
  attack.act.body.value.damageComponents.push(
    create(
      // Clone a typed component; the values below are authored fixture facts.
      DamageComponentSchema,
      {
        source: 'Raging',
        damageType: attack.act.body.value.damageComponents[0]?.damageType,
        roll: {
          expression: '2',
          total: 2,
          modifiers: [
            {
              source: 'Raging',
              value: 2,
              sourceRef: 'dnd5e:conditions:raging',
            },
          ],
        },
      }
    )
  );
}
export const NOTIFICATION_SAMPLES = {
  attack,
  speech: RECENT_IDENTITY_SAMPLES.find(
    (entry) => entry.act?.body.case === 'speak'
  )!,
  sound: heard,
};
