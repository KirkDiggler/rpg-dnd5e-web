// @vitest-environment node
import { clone, create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  CastMissedSchema,
  CastWardedSchema,
  EventKind,
  EventSchema,
  RollCalculationSchema,
  WardedSchema,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { AttackResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { formatBeat } from '../combatBeat';
import { formatDebugLine } from '../debugLogLine';
import { refreshKeysFor } from '../sessionRefreshKeys';
import { wardedCastNotice } from '../wardBeat';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectVisibleStory,
} from './presentation';

const names = { aggressor: 'Robin', protected: 'Mercy', caster: 'Lyric' };
function ward(kind: 'warded' | 'castWarded' = 'warded'): Event {
  const common = {
    target: 'protected',
    source: 'caster',
    ability: 'wis',
    roll: 4,
    total: 6,
    dc: 13,
  };
  return create(EventSchema, {
    session: 'sanctuary',
    recipient: 'aggressor',
    seq: 41n,
    at: 9n,
    kind: kind === 'warded' ? EventKind.WARDED : EventKind.CAST_WARDED,
    body:
      kind === 'warded'
        ? {
            case: 'warded',
            value: create(WardedSchema, {
              ...common,
              attacker: 'aggressor',
              attack: { ref: 'weapon:mace', name: 'Mace' },
            }),
          }
        : {
            case: 'castWarded',
            value: create(CastWardedSchema, {
              ...common,
              actor: 'aggressor',
              spell: { ref: 'spell:sacred-flame', name: 'Sacred Flame' },
            }),
          },
  });
}
function feed(events: Event[], source: 'live' | 'catchup' = 'live') {
  return events.reduce(
    (state, event) =>
      reduceCombatPresentation(state, {
        type: 'stream-event',
        event,
        metadata: { source },
      }),
    reduceCombatPresentation(emptyPresentation(), {
      type: 'configure',
      session: 'sanctuary',
      viewerMember: 'aggressor',
      memberNames: names,
      rollerRoles: {
        aggressor: 'player',
        protected: 'player',
        caster: 'player',
      },
    })
  );
}

describe('Sanctuary ward results', () => {
  it('preserves the blocked weapon reference in Story', () => {
    expect(selectVisibleStory(feed([ward()]))[0]?.attack).toMatchObject({
      ref: 'weapon:mace',
      name: 'Mace',
    });
  });

  it('uses a possessive viewer label in the compact combat beat', () => {
    expect(
      formatBeat(ward(), 'protected', new Map(Object.entries(names)))
    ).toContain('Your ward blocks');
    expect(
      formatBeat(ward(), 'aggressor', new Map(Object.entries(names)))
    ).not.toContain("You's");
  });

  it('renders the sourced calculation and keeps the provider total without recomputing it', () => {
    const event = ward();
    if (event.body.case !== 'warded') throw Error('fixture');
    event.body.value.calculation = create(RollCalculationSchema, {
      components: [
        { source: { name: 'Wisdom', sourceId: 'aggressor' }, modifier: 0 },
      ],
      total: 17,
    });
    const live = feed([event]);
    expect(selectVisibleStory(live)[0]?.detail).toContain('= 17');
    expect(selectVisibleStory(live)[0]?.detail).toContain('Wisdom');
    expect(selectVisibleStory(live)[0]?.detail).toContain('failed');
    expect(selectVisibleStory(live)).toEqual(
      selectVisibleStory(
        feed([fromBinary(EventSchema, toBinary(EventSchema, event))], 'catchup')
      )
    );
    expect(formatDebugLine(event, new Map()).text).toContain('"modifier":0');
  });

  it.each(['warded', 'castWarded'] as const)(
    'renders %s in live and serialized Story replay with the aggressor saving',
    (kind) => {
      const event = ward(kind);
      const live = feed([event]);
      const replay = feed(
        [fromBinary(EventSchema, toBinary(EventSchema, event))],
        'catchup'
      );
      expect(selectVisibleStory(live)).toEqual(selectVisibleStory(replay));
      const [entry] = selectVisibleStory(live);
      expect(entry?.headline).toContain("Mercy's ward blocks Robin's");
      expect(entry?.detail).toBe(
        'Robin failed the wis save: d20 4 · total 6 against DC 13. Ward cast by Lyric.'
      );
      expect(live.diagnostics).toEqual([]);
      expect(live.presentations).toHaveLength(1);
      expect(live.presentations[0]?.authority).toMatchObject({
        kind: 'save',
        roller: 'aggressor',
        roll: 4,
      });
      expect(
        formatBeat(event, 'observer', new Map(Object.entries(names)))
      ).toContain(entry?.headline);
      expect(
        formatDebugLine(event, new Map(Object.entries(names)))
      ).toMatchObject({ seq: 41n, ids: ['aggressor', 'protected', 'caster'] });
      expect(
        formatDebugLine(event, new Map(Object.entries(names))).text
      ).toContain('ability=wis roll=4 total=6 dc=13');
      expect(refreshKeysFor(event, 'aggressor')).toEqual([
        'characterData',
        'afford',
        'turn',
        'view',
      ]);
    }
  );
  it('does not turn a warded attack response into a miss or an attack die, in either delivery order', () => {
    const fact = {
      type: 'attack-response' as const,
      session: 'sanctuary',
      attacker: 'aggressor',
      target: 'protected',
      response: create(AttackResponseSchema, {
        warded: true,
        wardedBy: 'caster',
      }),
    };
    const responseFirst = reduceCombatPresentation(feed([]), fact);
    expect(responseFirst.presentations).toEqual([]);
    expect(responseFirst.diagnostics).toEqual([]);
    const eventFirst = feed([ward()]);
    expect(reduceCombatPresentation(eventFirst, fact)).toEqual(eventFirst);
    expect(
      reduceCombatPresentation(responseFirst, {
        type: 'stream-event',
        event: ward(),
        metadata: { source: 'live' },
      })
    ).toEqual(eventFirst);
  });
  it.each(['warded', 'castWarded'] as const)(
    'deduplicates %s and detects changed provider facts',
    (kind) => {
      expect(selectVisibleStory(feed([ward(kind), ward(kind)]))).toHaveLength(
        1
      );
      for (const field of [
        'source',
        'target',
        'ability',
        'roll',
        'total',
        'dc',
        'calculation',
      ] as const) {
        const changed = clone(EventSchema, ward(kind));
        if (
          changed.body.case !== 'warded' &&
          changed.body.case !== 'castWarded'
        )
          throw Error('fixture');
        const b = changed.body.value;
        if (field === 'calculation')
          b.calculation = create(RollCalculationSchema);
        else if (field === 'roll' || field === 'total' || field === 'dc')
          b[field] = 0;
        else b[field] = 'different';
        expect(selectVisibleStory(feed([ward(kind), changed]))).toEqual([]);
      }
    }
  );
  it('retains neighboring targets and recipient-local ordering through mixed cast results', () => {
    const missed = create(EventSchema, {
      session: 'sanctuary',
      recipient: 'aggressor',
      seq: 42n,
      kind: EventKind.CAST_MISSED,
      body: {
        case: 'castMissed',
        value: create(CastMissedSchema, {
          actor: 'aggressor',
          target: 'absent',
          spell: { ref: 'spell:example', name: 'Example' },
        }),
      },
    });
    const state = feed([missed, ward('castWarded')]);
    expect(selectVisibleStory(state).map((e) => e.headline)).toEqual([
      "Mercy's ward blocks Robin's Sacred Flame",
      "Robin's Example missed absent",
    ]);
    expect(
      wardedCastNotice(
        ['protected', 'unknown'],
        (id) => names[id as keyof typeof names] ?? id
      )
    ).toBe('The spell was blocked by a ward for: Mercy, unknown.');
    expect(wardedCastNotice([], (id) => id)).toBeUndefined();
  });
  it.each(['warded', 'castWarded'] as const)(
    'rejects malformed %s and preserves zero-valued saves',
    (kind) => {
      const mismatch = ward(kind);
      mismatch.kind = EventKind.MISSED;
      const bodyless = ward(kind);
      bodyless.body = { case: undefined };
      expect(selectVisibleStory(feed([mismatch]))).toEqual([]);
      expect(selectVisibleStory(feed([bodyless]))).toEqual([]);
      const zero = ward(kind);
      if (zero.body.case !== 'warded' && zero.body.case !== 'castWarded')
        throw Error('fixture');
      zero.body.value.roll = 0;
      zero.body.value.total = 0;
      zero.body.value.dc = 0;
      expect(selectVisibleStory(feed([zero]))[0]?.detail).toContain(
        'd20 0 · total 0 against DC 0'
      );
    }
  );
});
