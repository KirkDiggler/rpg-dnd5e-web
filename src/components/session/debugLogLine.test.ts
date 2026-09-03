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
        'components=[{source="weapon" legacy.ref="dnd5e:weapons:longsword" legacy.dice="1d8" legacy.final_rolls=[4] legacy.flat=0 type=SLASHING multiplier.present=false multiplier=unset roll=unset}, ' +
        '{source="ability" legacy.ref="dnd5e:abilities:strength" legacy.dice="" legacy.final_rolls=[] legacy.flat=3 type=SLASHING multiplier.present=false multiplier=unset roll=unset}, ' +
        '{source="monster_trait" legacy.ref="dnd5e:monster_traits:immunity" legacy.dice="" legacy.final_rolls=[] legacy.flat=0 type=SLASHING multiplier.present=true multiplier=0 roll=unset}] ' +
        'advantage=[{ref=dnd5e:conditions:hidden source=Helper}]'
    );
  });

  it('struck — new traces render every nested field and presence without breaking one-line framing', () => {
    const event = baseEvent({
      kind: EventKind.STRUCK,
      body: {
        case: 'struck',
        value: {
          attacker: 'char-1',
          target: 'skeleton-1',
          roll: 15,
          total: 20,
          against: 13,
          damage: 12,
          critical: false,
          attack: {
            ref: 'provider:weapon:greatsword',
            name: 'Greatsword',
            damageType: DamageType.SLASHING,
          },
          damageComponents: [
            {
              source: 'weapon',
              sourceRef: '',
              dice: '',
              finalRolls: [],
              flatBonus: 0,
              damageType: DamageType.SLASHING,
              roll: {
                source: {
                  ref: 'provider:weapon:greatsword',
                  name: 'Great "Sword"\nline\\tail',
                  label: '',
                },
                dice: {
                  notation: '2d6',
                  dieSize: 6,
                  originalRolls: [1, 5],
                  rerolls: [
                    {
                      dieIndex: 0,
                      before: 1,
                      after: 4,
                      source: {
                        ref: 'provider:condition:gwf',
                        name: 'Great Weapon Fighting',
                        label: 'GWF "reroll"\nline\\tail',
                      },
                    },
                  ],
                  finalRolls: [4, 5],
                  keptIndices: [0, 1],
                  subtotal: 9,
                },
              },
            },
            {
              source: 'ability',
              sourceRef: '',
              dice: '',
              finalRolls: [],
              flatBonus: 0,
              damageType: DamageType.SLASHING,
              roll: {
                source: {
                  ref: 'provider:ability:strength',
                  name: 'Strength',
                  label: 'Strength modifier',
                },
                modifier: 0,
              },
            },
            {
              source: 'monster_trait',
              sourceRef: '',
              dice: '',
              finalRolls: [],
              flatBonus: 0,
              damageType: DamageType.SLASHING,
              multiplier: 0,
              roll: {
                source: {
                  ref: 'provider:trait:immunity',
                  name: 'Immunity',
                  label: '',
                },
              },
            },
          ],
          advantageSources: [],
          disadvantageSources: [],
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.text).toBe(
      String.raw`seq=7 clock=42 struck attacker=Toolkit Sandbox Fighter target=Skeleton roll=15 total=20 against=13 damage=12 crit=false attack.ref=provider:weapon:greatsword attack.name="Greatsword" type=SLASHING components=[{source="weapon" legacy.ref="" legacy.dice="" legacy.final_rolls=[] legacy.flat=0 type=SLASHING multiplier.present=false multiplier=unset roll={source={ref="provider:weapon:greatsword" name="Great \"Sword\"\nline\\tail" label=""} dice={notation="2d6" die_size=6 original_rolls=[1,5] rerolls=[{index=0 before=1 after=4 source={ref="provider:condition:gwf" name="Great Weapon Fighting" label="GWF \"reroll\"\nline\\tail"}}] final_rolls=[4,5] kept_indices=[0,1] subtotal=9} modifier.present=false modifier=unset}}, {source="ability" legacy.ref="" legacy.dice="" legacy.final_rolls=[] legacy.flat=0 type=SLASHING multiplier.present=false multiplier=unset roll={source={ref="provider:ability:strength" name="Strength" label="Strength modifier"} dice=unset modifier.present=true modifier=0}}, {source="monster_trait" legacy.ref="" legacy.dice="" legacy.final_rolls=[] legacy.flat=0 type=SLASHING multiplier.present=true multiplier=0 roll={source={ref="provider:trait:immunity" name="Immunity" label=""} dice=unset modifier.present=false modifier=unset}}]`
    );
    expect(line.text).not.toContain('\n');
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
            ref: 'dnd5e:features:second_wind',
            name: 'Second Wind',
          },
          target: '',
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activated actor=Toolkit Sandbox Fighter ' +
        'ability.ref=dnd5e:features:second_wind ability.name="Second Wind" ' +
        'target='
    );
  });

  it('activated with ability unset pins the existing unknown ability fallback', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATED,
      body: {
        case: 'activated',
        value: {
          actor: 'char-1',
          target: '',
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activated actor=Toolkit Sandbox Fighter ' +
        'ability.ref=? ability.name=? target='
    );
  });

  it('JSON-quotes every provider-authored activation/result string without breaking Debug line framing', () => {
    const activation = formatDebugLine(
      baseEvent({
        kind: EventKind.ACTIVATED,
        body: {
          case: 'activated',
          value: {
            actor: 'char-1',
            ability: {
              ref: 'dnd5e:features:second_wind',
              name: 'Second "Wind"\nline\\tail',
            },
            target: '',
          },
        },
      }),
      names
    );
    const healing = formatDebugLine(
      baseEvent({
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
                sourceRef: 'dnd5e:features:second_wind',
                sourceName: 'Second "Wind"\nline\\tail',
                hpBefore: 8,
                hpAfter: 10,
              },
            },
          },
        },
      }),
      names
    );
    const conditionApplied = formatDebugLine(
      baseEvent({
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
                name: 'Raging "Now"\nline\\tail',
              },
            },
          },
        },
      }),
      names
    );
    const conditionRemoved = formatDebugLine(
      baseEvent({
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
                name: 'Raging "Ends"\nline\\tail',
                reason: 'timer "done"\nturn\\end',
              },
            },
          },
        },
      }),
      names
    );
    const capacity = formatDebugLine(
      baseEvent({
        kind: EventKind.ACTIVATION_RESULT,
        body: {
          case: 'activationResult',
          value: {
            actor: 'char-1',
            result: {
              case: 'capacityGranted',
              value: {
                member: 'char-1',
                description: '30ft "movement"\nline\\tail',
              },
            },
          },
        },
      }),
      names
    );

    expect(activation.text).toBe(
      String.raw`seq=7 clock=42 activated actor=Toolkit Sandbox Fighter ability.ref=dnd5e:features:second_wind ability.name="Second \"Wind\"\nline\\tail" target=`
    );
    expect(healing.text).toBe(
      String.raw`seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=healing_applied target=Toolkit Sandbox Fighter amount=2 requested=7 roll=6 modifier=1 hp.before=8 hp.after=10 source.ref=dnd5e:features:second_wind source.name="Second \"Wind\"\nline\\tail" calculation=unset`
    );
    expect(conditionApplied.text).toBe(
      String.raw`seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=condition_applied target=Toolkit Sandbox Fighter condition.ref=dnd5e:conditions:raging condition.name="Raging \"Now\"\nline\\tail"`
    );
    expect(conditionRemoved.text).toBe(
      String.raw`seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=condition_removed target=Skeleton condition.ref=dnd5e:conditions:raging condition.name="Raging \"Ends\"\nline\\tail" reason="timer \"done\"\nturn\\end"`
    );
    expect(capacity.text).toBe(
      String.raw`seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=capacity_granted member=Toolkit Sandbox Fighter description="30ft \"movement\"\nline\\tail"`
    );
    for (const line of [
      activation,
      healing,
      conditionApplied,
      conditionRemoved,
      capacity,
    ]) {
      expect(line.text).not.toContain('\n');
    }
  });

  it('activation result with result oneof unset pins the existing none fallback', () => {
    const event = baseEvent({
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: {
          actor: 'char-1',
          result: { case: undefined },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.ids).toEqual(['char-1']);
    expect(line.text).toBe(
      'seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=none'
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
              sourceRef: 'dnd5e:features:second_wind',
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
        'source.ref=dnd5e:features:second_wind source.name="Second Wind" ' +
        'calculation=unset'
    );
  });

  it('activation healing result — calculation is lossless, including nested sources, presence, subtotal, and total', () => {
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
              roll: 0,
              modifier: 0,
              sourceRef: 'provider:feature:wind',
              sourceName: 'Second Wind',
              hpBefore: 8,
              hpAfter: 10,
              calculation: {
                components: [
                  {
                    source: {
                      ref: 'provider:feature:wind',
                      name: 'Second "Wind"\nline\\tail',
                      label: '',
                    },
                    dice: {
                      notation: '1d10',
                      dieSize: 10,
                      originalRolls: [6],
                      rerolls: [],
                      finalRolls: [6],
                      keptIndices: [],
                      subtotal: 6,
                    },
                  },
                  {
                    source: {
                      ref: 'provider:class:fighter',
                      name: 'Fighter',
                      label: 'Fighter "level"\nline\\tail',
                    },
                    modifier: 0,
                  },
                ],
                total: 7,
              },
            },
          },
        },
      },
    });

    const line = formatDebugLine(event, names);

    expect(line.text).toBe(
      String.raw`seq=7 clock=42 activation_result actor=Toolkit Sandbox Fighter result=healing_applied target=Toolkit Sandbox Fighter amount=2 requested=7 roll=0 modifier=0 hp.before=8 hp.after=10 source.ref=provider:feature:wind source.name="Second Wind" calculation={components=[{source={ref="provider:feature:wind" name="Second \"Wind\"\nline\\tail" label=""} dice={notation="1d10" die_size=10 original_rolls=[6] rerolls=[] final_rolls=[6] kept_indices=[] subtotal=6} modifier.present=false modifier=unset}, {source={ref="provider:class:fighter" name="Fighter" label="Fighter \"level\"\nline\\tail"} dice=unset modifier.present=true modifier=0}] total=7}`
    );
    expect(line.text).not.toContain('\n');
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
