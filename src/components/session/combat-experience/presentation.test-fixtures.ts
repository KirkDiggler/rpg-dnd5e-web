import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  MissedSchema,
  StruckSchema,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AttackResponseSchema,
  type AttackResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AttackRefSchema,
  DamageType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { AttackResponseFact, CombatStreamFact } from './presentation';

export interface AttackAuthorityFixtureOptions {
  session?: string;
  seq?: bigint;
  at?: bigint;
  attacker?: string;
  target?: string;
  recipient?: string;
  roll?: number;
  total?: number;
  against?: number;
  hit?: boolean;
  critical?: boolean;
  damage?: number;
  attackRef?: string;
  attackName?: string;
  damageType?: DamageType;
}

export interface AttackAuthorityFixture {
  response: AttackResponse;
  event: Event;
  responseFact: AttackResponseFact;
  streamFact: (source?: 'live' | 'catchup') => CombatStreamFact;
}

/**
 * One source for response and stream facts. A mismatch test creates a second
 * fixture with an explicit override instead of letting two hand-authored
 * messages drift accidentally.
 */
export function createAttackAuthorityFixture(
  options: AttackAuthorityFixtureOptions = {}
): AttackAuthorityFixture {
  const session = options.session ?? 'crypt-run';
  const seq = options.seq ?? 23n;
  const at = options.at ?? 9n;
  const attacker = options.attacker ?? 'aldric';
  const target = options.target ?? 'skeleton-guard';
  const recipient = options.recipient ?? 'aldric';
  const roll = options.roll ?? 12;
  const total = options.total ?? 17;
  const against = options.against ?? 13;
  const hit = options.hit ?? true;
  const critical = options.critical ?? false;
  const damage = options.damage ?? (hit ? 8 : 0);
  const attack = create(AttackRefSchema, {
    ref: options.attackRef ?? 'dnd5e:weapons:longsword',
    name: options.attackName ?? 'Longsword',
    damageType: options.damageType ?? DamageType.SLASHING,
  });
  const response = create(AttackResponseSchema, {
    roll,
    total,
    against,
    hit,
    critical,
    damage,
    seq,
    attack,
  });
  const event = create(EventSchema, {
    session,
    seq,
    at,
    recipient,
    kind: hit ? EventKind.STRUCK : EventKind.MISSED,
    body: hit
      ? {
          case: 'struck',
          value: create(StruckSchema, {
            attacker,
            target,
            roll,
            total,
            against,
            damage,
            attack,
            critical,
          }),
        }
      : {
          case: 'missed',
          value: create(MissedSchema, {
            attacker,
            target,
            roll,
            total,
            against,
            attack,
          }),
        },
  });

  return {
    response,
    event,
    responseFact: {
      type: 'attack-response',
      session,
      attacker,
      target,
      response,
    },
    streamFact: (source = 'live') => ({
      type: 'stream-event',
      event,
      metadata: { source },
    }),
  };
}
