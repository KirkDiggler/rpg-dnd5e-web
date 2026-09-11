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
  ReactionRefSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { AttackResponseFact, CombatStreamFact } from './presentation';

export function debugText(
  entry: import('../debugLogLine').DebugFeedEntry | undefined
): string | undefined {
  return typeof entry === 'string' ? entry : entry?.text;
}

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
  /** Set to record the strike as a reaction (rpg-toolkit#1548 populates it). */
  reactionRef?: string;
  reactionName?: string;
  /**
   * The opaque token the provider mints once per swing. The SAME value reaches
   * the attacker on AttackResponse and every recipient on Struck/Missed, and
   * it is the only thing two different clients can agree on for one roll.
   */
  presentationId?: string;
  /**
   * This recipient's OWN number for the beat, when it differs from the
   * attacker's — which, for anyone but the attacker, it always does.
   *
   * `seq` is per recipient. The attacker's response seq is the attacker's own
   * number and matches the attacker's own event, so it defaults to `seq` here.
   * A witness holds a different number for the very same beat, and a fixture
   * that gives both sides one seq quietly asserts the falsehood that broke
   * shared dice. Pass this to build an honest witness.
   */
  eventSeq?: bigint;
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
  // One token per swing, so two fixtures are two different rolls unless a test
  // deliberately says otherwise. Derived from the attacker's own numbers purely
  // to keep fixtures distinct and readable — the real token is opaque, and
  // nothing may parse it.
  const presentationId =
    options.presentationId ?? `presentation~${session}~${seq}`;
  const eventSeq = options.eventSeq ?? seq;
  const attack = create(AttackRefSchema, {
    ref: options.attackRef ?? 'dnd5e:weapons:longsword',
    name: options.attackName ?? 'Longsword',
    damageType: options.damageType ?? DamageType.SLASHING,
  });
  const reaction =
    options.reactionRef || options.reactionName
      ? create(ReactionRefSchema, {
          ref: options.reactionRef ?? '',
          name: options.reactionName ?? '',
        })
      : undefined;
  const response = create(AttackResponseSchema, {
    roll,
    total,
    against,
    hit,
    critical,
    damage,
    seq,
    attack,
    presentationId,
  });
  const event = create(EventSchema, {
    session,
    seq: eventSeq,
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
            reaction,
            presentationId,
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
            reaction,
            presentationId,
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
