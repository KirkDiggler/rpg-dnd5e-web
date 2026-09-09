// @vitest-environment node
/**
 * What the log says about a cast, a save, and what the save cost.
 *
 * THREE BEATS, IN ORDER. The cast leaves the caster's hands, the save decides
 * whether anything lands, and the result beats say what did. Each is its own
 * arm on the Story switch, which is exhaustive over the body case — a new beat
 * kind is a compile error rather than a silent gap (design rpg-project#405,
 * assumption 3).
 */
import { create } from '@bufbuild/protobuf';
import {
  ActivationResultSchema,
  CastSchema,
  DamageAppliedSchema,
  DiceTraceSchema,
  EventKind,
  EventSchema,
  RollCalculationSchema,
  RollComponentSchema,
  RollSourceSchema,
  SavedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  SpellRefSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { buildCombatStory, type CombatStoryFact } from './story';

const context = {
  viewerMember: 'bard-1',
  memberNames: {
    'bard-1': 'Lyric',
    'skeleton-1': 'Skeleton',
  },
};

function visible(event: CombatStoryFact['event']): CombatStoryFact {
  return { event, source: 'live', visible: true };
}

const viciousMockery = () =>
  create(SpellRefSchema, {
    ref: 'dnd5e:spells:vicious-mockery',
    name: 'Vicious Mockery',
  });

function castEvent(seq = 40n) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 10n,
    recipient: 'bard-1',
    kind: EventKind.CAST,
    body: {
      case: 'cast',
      value: create(CastSchema, {
        actor: 'bard-1',
        spell: viciousMockery(),
        target: 'skeleton-1',
      }),
    },
  });
}

function savedEvent({
  seq = 41n,
  succeeded = false,
  roll = 7,
  total = 9,
  dc = 13,
  withSource = true,
}: {
  seq?: bigint;
  succeeded?: boolean;
  roll?: number;
  total?: number;
  dc?: number;
  withSource?: boolean;
} = {}) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 11n,
    recipient: 'bard-1',
    kind: EventKind.SAVED,
    body: {
      case: 'saved',
      value: create(SavedSchema, {
        saver: 'skeleton-1',
        ability: 'wis',
        roll,
        total,
        dc,
        succeeded,
        ...(withSource ? { source: viciousMockery() } : {}),
      }),
    },
  });
}

function damageAppliedEvent(seq = 42n) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 12n,
    recipient: 'bard-1',
    kind: EventKind.ACTIVATION_RESULT,
    body: {
      case: 'activationResult',
      value: create(ActivationResultSchema, {
        actor: 'bard-1',
        result: {
          case: 'damageApplied',
          value: create(DamageAppliedSchema, {
            target: 'skeleton-1',
            amount: 3,
            damageType: DamageType.PSYCHIC,
            sourceRef: 'dnd5e:spells:vicious-mockery',
            sourceName: 'Vicious Mockery',
            hpBefore: 13,
            hpAfter: 10,
            requested: 3,
            calculation: create(RollCalculationSchema, {
              total: 3,
              components: [
                create(RollComponentSchema, {
                  dice: create(DiceTraceSchema, {
                    notation: '1d4',
                    dieSize: 4,
                    originalRolls: [3],
                    finalRolls: [3],
                    subtotal: 3,
                  }),
                  source: create(RollSourceSchema, {
                    label: 'Vicious Mockery',
                  }),
                }),
              ],
            }),
          }),
        },
      }),
    },
  });
}

describe('the cast beat', () => {
  it('names the spell the server authored, and its target', () => {
    const [entry] = buildCombatStory([visible(castEvent())], context);

    expect(entry?.eyebrow).toBe('Spell');
    expect(entry?.headline).toBe('Lyric casts Vicious Mockery');
    expect(entry?.detail).toContain('Skeleton is the target');
  });

  it('narrates a cast that selects nobody without inventing a target', () => {
    const event = castEvent();
    event.body = {
      case: 'cast',
      value: create(CastSchema, {
        actor: 'bard-1',
        spell: create(SpellRefSchema, {
          ref: 'dnd5e:spells:true-strike',
          name: 'True Strike',
        }),
        target: '',
      }),
    };

    const [entry] = buildCombatStory([visible(event)], context);

    expect(entry?.headline).toBe('Lyric casts True Strike');
    expect(entry?.detail).not.toContain('target');
  });
});

describe('the save beat', () => {
  it('shows the roll, the arithmetic, the DC and the rulebook’s reading', () => {
    const [entry] = buildCombatStory([visible(savedEvent())], context);

    expect(entry?.eyebrow).toBe('Skeleton · Vicious Mockery');
    expect(entry?.headline).toBe('Skeleton saves vs Vicious Mockery');
    expect(entry?.detail).toBe('d20 7 + 2 = 9 against DC 13 · Failed');
    expect(entry?.tone).toBe('danger');
  });

  it('reads Succeeded off the beat rather than comparing the numbers', () => {
    // TOTAL BELOW DC, `succeeded` TRUE. A receiver that derived the outcome
    // from total-vs-dc would say Failed here; the provider classifies, and the
    // day a rule changes what beating a DC means every derived client is
    // wrong at once.
    const [entry] = buildCombatStory(
      [visible(savedEvent({ succeeded: true, total: 9, dc: 13 }))],
      context
    );

    expect(entry?.detail).toContain('Succeeded');
    expect(entry?.tone).toBe('success');
  });

  it('narrates a save nothing spell-shaped forced', () => {
    const [entry] = buildCombatStory(
      [visible(savedEvent({ withSource: false }))],
      context
    );

    expect(entry?.headline).toBe('Skeleton makes a saving throw');
    expect(entry?.eyebrow).toBe('Skeleton · Saving throw');
  });

  it('shows a negative modifier as a subtraction', () => {
    const [entry] = buildCombatStory(
      [visible(savedEvent({ roll: 12, total: 11 }))],
      context
    );

    expect(entry?.detail).toContain('d20 12 - 1 = 11');
  });
});

describe('the damage a cast delivered', () => {
  it('shows the 1d4 face from the calculation, and the HP it cost', () => {
    const [entry] = buildCombatStory([visible(damageAppliedEvent())], context);

    expect(entry?.eyebrow).toBe('Ability result');
    expect(entry?.headline).toBe('Skeleton takes 3 psychic damage');
    // THE FACE, NOT JUST THE NUMBER. `calculation` carries the rulebook's own
    // components so the d4 that was rolled reaches the player.
    expect(entry?.detail).toContain('1d4');
    expect(entry?.detail).toContain('13 → 10 HP');
  });
});

describe('the whole exchange, in order', () => {
  it('reads cast, then save, then damage', () => {
    const story = buildCombatStory(
      [
        visible(castEvent()),
        visible(savedEvent()),
        visible(damageAppliedEvent()),
      ],
      context
    );

    expect(story.map((entry) => entry.headline)).toEqual([
      'Lyric casts Vicious Mockery',
      'Skeleton saves vs Vicious Mockery',
      'Skeleton takes 3 psychic damage',
    ]);
  });
});
