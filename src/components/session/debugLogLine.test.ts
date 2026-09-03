import {
  EventKind,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DissolveKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { formatDebugLine } from './debugLogLine';

const names = new Map([
  ['char-1', 'Toolkit Sandbox Fighter'],
  ['skeleton-1', 'Skeleton'],
  ['skeleton-2', 'Skeleton'],
  ['helper-1', 'Helper'],
]);

// `overrides` is deliberately untyped against the real `Event`/`Event['body']`
// shape (`Record<string, unknown>`, not `Partial<Event>`) — every call site
// below overrides `body` with a nested typed value (`Moved`, `Struck`, ...),
// and the real generated types require `$typeName` on every nested message,
// which a plain test literal has no reason to carry. The single `as Event`
// cast on the return is the ONE place this file steps around that.
function baseEvent(overrides: Record<string, unknown> = {}): Event {
  return {
    session: 'enc-1',
    seq: 7n,
    at: 42n,
    correlation: '',
    recipient: 'char-1',
    kind: EventKind.UNSPECIFIED,
    payload: new Uint8Array(),
    body: { case: undefined },
    ...overrides,
  } as Event;
}

describe('formatDebugLine', () => {
  it('moved — member, resolved name, and raw coordinates', () => {
    const event = baseEvent({
      kind: EventKind.MOVED,
      body: {
        case: 'moved',
        value: { member: 'skeleton-1', to: { x: 3, y: -2 } },
      },
    });
    const line = formatDebugLine(event, names);
    expect(line.seq).toBe(7n);
    expect(line.ids).toEqual(['skeleton-1']);
    expect(line.text).toBe('seq=7 clock=42 moved member=Skeleton to=(3,-2)');
  });

  it('moved — missing `to` still renders a line rather than throwing', () => {
    const event = baseEvent({
      kind: EventKind.MOVED,
      body: { case: 'moved', value: { member: 'skeleton-1', to: undefined } },
    });
    const line = formatDebugLine(event, names);
    expect(line.text).toContain('to=(?,?)');
  });

  it('struck — every raw field verbatim, attack ref and name untouched', () => {
    const event = baseEvent({
      kind: EventKind.STRUCK,
      body: {
        case: 'struck',
        value: {
          attacker: 'char-1',
          target: 'skeleton-1',
          roll: 17,
          total: 20,
          against: 13,
          damage: 6,
          critical: false,
          attack: {
            ref: 'dnd5e:weapon:longsword',
            name: 'Longsword',
            damageType: DamageType.SLASHING,
          },
        },
      },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['char-1', 'skeleton-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 struck attacker=Toolkit Sandbox Fighter target=Skeleton ' +
        'roll=17 total=20 against=13 damage=6 crit=false ' +
        'attack.ref=dnd5e:weapon:longsword attack.name="Longsword" type=SLASHING'
    );
  });

  it('struck — ordered components and modifier attribution append without arithmetic', () => {
    const event = baseEvent({
      kind: EventKind.STRUCK,
      body: {
        case: 'struck',
        value: {
          attacker: 'char-1',
          target: 'skeleton-1',
          roll: 17,
          total: 20,
          against: 13,
          damage: 6,
          critical: false,
          attack: {
            ref: 'dnd5e:weapon:longsword',
            name: 'Longsword',
            damageType: DamageType.SLASHING,
          },
          damageComponents: [
            {
              source: 'weapon',
              sourceRef: 'dnd5e:weapons:longsword',
              dice: '1d8',
              finalRolls: [4],
              flatBonus: 0,
              damageType: DamageType.SLASHING,
            },
            {
              source: 'ability',
              sourceRef: 'dnd5e:abilities:strength',
              dice: '',
              finalRolls: [],
              flatBonus: 3,
              damageType: DamageType.SLASHING,
            },
            {
              source: 'monster_trait',
              sourceRef: 'dnd5e:monster_traits:immunity',
              dice: '',
              finalRolls: [],
              flatBonus: 0,
              damageType: DamageType.SLASHING,
              multiplier: 0,
            },
          ],
          advantageSources: [
            {
              sourceRef: 'dnd5e:conditions:hidden',
              sourceId: 'helper-1',
            },
          ],
          disadvantageSources: [],
        },
      },
    });

    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['char-1', 'skeleton-1', 'helper-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 struck attacker=Toolkit Sandbox Fighter target=Skeleton ' +
        'roll=17 total=20 against=13 damage=6 crit=false ' +
        'attack.ref=dnd5e:weapon:longsword attack.name="Longsword" type=SLASHING ' +
        'components=[{source=weapon ref=dnd5e:weapons:longsword dice=1d8 final_rolls=[4] flat=0 type=SLASHING}, ' +
        '{source=ability ref=dnd5e:abilities:strength final_rolls=[] flat=3 type=SLASHING}, ' +
        '{source=monster_trait ref=dnd5e:monster_traits:immunity final_rolls=[] flat=0 type=SLASHING multiplier=0}] ' +
        'advantage=[{ref=dnd5e:conditions:hidden source=Helper}]'
    );
  });

  it('missed — no damage/crit fields on the wire, none rendered', () => {
    const event = baseEvent({
      kind: EventKind.MISSED,
      body: {
        case: 'missed',
        value: {
          attacker: 'skeleton-1',
          target: 'char-1',
          roll: 4,
          total: 7,
          against: 14,
          attack: {
            ref: 'dnd5e:weapon:unarmed-strike',
            name: 'Unarmed strike',
            damageType: DamageType.BLUDGEONING,
          },
        },
      },
    });
    const line = formatDebugLine(event, names);
    expect(line.text).toBe(
      'seq=7 clock=42 missed attacker=Skeleton target=Toolkit Sandbox Fighter ' +
        'roll=4 total=7 against=14 ' +
        'attack.ref=dnd5e:weapon:unarmed-strike attack.name="Unarmed strike" type=BLUDGEONING'
    );
    expect(line.text).not.toContain('damage=');
    expect(line.text).not.toContain('crit=');
  });

  it('activated — actor, provider ability identity, and target are complete', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATED,
      body: {
        case: 'activated',
        value: {
          actor: 'char-1',
          ability: {
            ref: 'dnd5e:features:second-wind',
            name: 'Second Wind',
          },
          target: 'char-1',
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1', 'char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activated actor=Toolkit Sandbox Fighter ' +
        'ability.ref=dnd5e:features:second-wind ability.name="Second Wind" ' +
        'target=Toolkit Sandbox Fighter'
    );
  });

  it('activation healing result — every raw applied/requested/roll/HP/source field is complete', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: {
          actor: 'char-1',
          result: {
            case: 'healingApplied',
            value: {
              target: 'char-1',
              amount: 2,
              requested: 7,
              roll: 6,
              modifier: 1,
              sourceRef: 'dnd5e:features:second-wind',
              sourceName: 'Second Wind',
              hpBefore: 8,
              hpAfter: 10,
            },
          },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1', 'char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter ' +
        'result=healing_applied target=Toolkit Sandbox Fighter amount=2 requested=7 ' +
        'roll=6 modifier=1 hp.before=8 hp.after=10 ' +
        'source.ref=dnd5e:features:second-wind source.name="Second Wind"'
    );
  });

  it('activation condition-applied result — canonical condition ref and provider name stay raw', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: {
          actor: 'char-1',
          result: {
            case: 'conditionApplied',
            value: {
              target: 'char-1',
              ref: 'dnd5e:conditions:raging',
              name: 'Raging',
            },
          },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1', 'char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter ' +
        'result=condition_applied target=Toolkit Sandbox Fighter ' +
        'condition.ref=dnd5e:conditions:raging condition.name="Raging"'
    );
  });

  it('activation condition-removed result — canonical identity and provider reason stay raw', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: {
          actor: 'char-1',
          result: {
            case: 'conditionRemoved',
            value: {
              target: 'skeleton-1',
              ref: 'dnd5e:conditions:raging',
              name: 'Raging',
              reason: 'expired',
            },
          },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1', 'skeleton-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter ' +
        'result=condition_removed target=Skeleton ' +
        'condition.ref=dnd5e:conditions:raging condition.name="Raging" reason="expired"'
    );
  });

  it('activation capacity result — member and provider description stay raw', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: {
          actor: 'char-1',
          result: {
            case: 'capacityGranted',
            value: {
              member: 'char-1',
              description: '30ft movement',
            },
          },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1', 'char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter ' +
        'result=capacity_granted member=Toolkit Sandbox Fighter description="30ft movement"'
    );
  });

  it('downed — member only, per the wire (no hit points on this beat)', () => {
    const event = baseEvent({
      kind: EventKind.DOWNED,
      body: { case: 'downed', value: { member: 'skeleton-1' } },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['skeleton-1']);
    expect(line.text).toBe('seq=7 clock=42 downed member=Skeleton');
  });

  it('joined — member, resolved name (rpg-project#260)', () => {
    const event = baseEvent({
      kind: EventKind.JOINED,
      body: { case: 'joined', value: { member: 'char-1' } },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 joined member=Toolkit Sandbox Fighter'
    );
  });

  it('exited — member, resolved name, the mirror of joined', () => {
    const event = baseEvent({
      kind: EventKind.EXITED,
      body: { case: 'exited', value: { member: 'skeleton-1' } },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['skeleton-1']);
    expect(line.text).toBe('seq=7 clock=42 exited member=Skeleton');
  });

  it('turn_ended — member and next, both resolved', () => {
    const event = baseEvent({
      kind: EventKind.TURN_ENDED,
      body: {
        case: 'turnEnded',
        value: { member: 'char-1', next: 'skeleton-1' },
      },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['char-1', 'skeleton-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 turn_ended member=Toolkit Sandbox Fighter next=Skeleton'
    );
  });

  it('fight_started — the full initiative order, verbatim', () => {
    const event = baseEvent({
      kind: EventKind.FIGHT_STARTED,
      body: {
        case: 'fightStarted',
        value: { members: ['char-1', 'skeleton-1', 'skeleton-2'] },
      },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual(['char-1', 'skeleton-1', 'skeleton-2']);
    expect(line.text).toBe(
      'seq=7 clock=42 fight_started order=[Toolkit Sandbox Fighter, Skeleton, Skeleton]'
    );
  });

  it('fight_ended — the raw DissolveKind name, not a client-invented sentence', () => {
    const event = baseEvent({
      kind: EventKind.FIGHT_ENDED,
      body: { case: 'fightEnded', value: { cause: DissolveKind.BY_DEFEAT } },
    });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual([]);
    expect(line.text).toBe('seq=7 clock=42 fight_ended cause=BY_DEFEAT');
  });

  it('unknown body (no typed body member, e.g. SCENE_OPENED) renders kind + JSON null', () => {
    const event = baseEvent({ kind: EventKind.SCENE_OPENED });
    const line = formatDebugLine(event, names);
    expect(line.ids).toEqual([]);
    expect(line.text).toBe('seq=7 clock=42 kind=SCENE_OPENED body=null');
  });

  it('an UNKNOWN-kind event renders honestly, never decoding payload (a genuine wire signal since v0.1.135, not a catch-up artifact)', () => {
    const event = baseEvent({
      kind: EventKind.UNKNOWN,
      payload: new Uint8Array([1, 2, 3]),
    });
    const line = formatDebugLine(event, names);
    expect(line.text).toBe('seq=7 clock=42 kind=UNKNOWN body=null');
  });

  it('an id with no roster entry falls back to the raw id, never throws', () => {
    const event = baseEvent({
      kind: EventKind.DOWNED,
      body: { case: 'downed', value: { member: 'unrostered-42' } },
    });
    const line = formatDebugLine(event, names);
    expect(line.text).toBe('seq=7 clock=42 downed member=unrostered-42');
  });
});
