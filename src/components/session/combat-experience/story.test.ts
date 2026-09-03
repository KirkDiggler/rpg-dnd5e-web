import { create } from '@bufbuild/protobuf';
import {
  ActivatedSchema,
  ActivationResultSchema,
  CapacityGrantedSchema,
  ConditionAppliedSchema,
  ConditionRemovedSchema,
  DownedSchema,
  EventKind,
  EventSchema,
  HealingAppliedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AbilityRefSchema,
  DamageType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import {
  buildCombatAttackOutcome,
  buildCombatStory,
  type CombatStoryFact,
} from './story';

const context = {
  viewerMember: 'aldric',
  memberNames: {
    aldric: 'Aldric',
    'skeleton-guard': 'Skeleton Guard',
  },
};

function visible(
  event: CombatStoryFact['event'],
  source: CombatStoryFact['source'] = 'live'
): CombatStoryFact {
  return { event, source, visible: true };
}

function activated(seq = 24n) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 10n,
    recipient: 'aldric',
    kind: EventKind.ACTIVATED,
    body: {
      case: 'activated',
      value: create(ActivatedSchema, {
        actor: 'aldric',
        ability: create(AbilityRefSchema, {
          ref: 'dnd5e:features:second_wind',
          name: 'Second Wind',
        }),
        target: '',
      }),
    },
  });
}

function healingResult(
  modifier: number,
  requested: number,
  seq = 25n,
  roll = 6,
  amount = 2,
  hpBefore = 8,
  hpAfter = 10
) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 10n,
    recipient: 'aldric',
    kind: EventKind.ACTIVATION_RESULT,
    body: {
      case: 'activationResult',
      value: create(ActivationResultSchema, {
        actor: 'aldric',
        result: {
          case: 'healingApplied',
          value: create(HealingAppliedSchema, {
            target: 'aldric',
            amount,
            requested,
            roll,
            modifier,
            sourceRef: 'dnd5e:features:second_wind',
            sourceName: 'Second Wind',
            hpBefore,
            hpAfter,
          }),
        },
      }),
    },
  });
}

describe('typed combat Story', () => {
  it('groups exactly one Struck/Missed by authoritative session and sequence', () => {
    const first = createAttackAuthorityFixture();
    const conflictingDuplicate = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 2,
      total: 7,
    });

    const story = buildCombatStory(
      [visible(first.event), visible(conflictingDuplicate.event)],
      context
    );

    expect(story).toHaveLength(1);
    expect(story[0]?.detail).toContain('12');
    expect(story[0]?.detail).not.toContain('2 →');
  });

  it('uses the provider full AttackRef, display name, and damage type without deriving HP', () => {
    const facts = createAttackAuthorityFixture({
      attackRef: 'dnd5e:weapons:longsword',
      attackName: 'Longsword',
      damageType: DamageType.SLASHING,
      damage: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry).toMatchObject({
      eyebrow: 'Aldric · Longsword',
      attack: {
        ref: 'dnd5e:weapons:longsword',
        name: 'Longsword',
        damageType: DamageType.SLASHING,
      },
    });
    expect(entry?.detail).toContain('8 slashing damage');
    expect(outcome).toMatchObject({
      action: 'Longsword',
      attackRef: 'dnd5e:weapons:longsword',
      damage: 8,
      damageType: 'slashing',
    });
    expect(outcome).not.toHaveProperty('bonus');
    expect(outcome).not.toHaveProperty('hpAfter');
  });

  it('renders a Missed event without inventing zero damage', () => {
    const facts = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 3,
      total: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry?.headline).toBe('Skeleton Guard evades Aldric');
    expect(entry?.detail).toBe('d20 3 · total 8 against AC 13 · Miss');
    expect(outcome).not.toHaveProperty('damage');
    expect(outcome?.hit).toBe(false);
  });

  it('renders Activated and each healing result as ordered separate entries with applied HP and positive arithmetic', () => {
    const activation = activated();
    const healing = healingResult(1, 7);
    activation.payload = new TextEncoder().encode('Use Parsed Ref Name');
    healing.payload = new TextEncoder().encode('Heal 999 HP');

    const story = buildCombatStory(
      [visible(activation), visible(healing)],
      context
    );

    expect(story.map((entry) => entry.headline)).toEqual([
      'Aldric uses Second Wind',
      'Aldric recovers 2 HP',
    ]);
    expect(story[0]?.detail).toBe('Story sequence 24.');
    expect(story[0]?.detail).not.toContain('target');
    expect(story[1]?.detail).toBe(
      'Second Wind rolled 6 + 1 = 7; 2 applied (8 → 10 HP).'
    );
    expect(JSON.stringify(story)).not.toMatch(/Parsed Ref|999/);
  });

  it.each([
    {
      label: 'negative',
      modifier: -1,
      requested: 5,
      detail: 'Second Wind rolled 6 - 1 = 5; 2 applied (8 → 10 HP).',
    },
    {
      label: 'zero',
      modifier: 0,
      requested: 6,
      detail: 'Second Wind rolled 6 = 6; 2 applied (8 → 10 HP).',
    },
  ])(
    'formats $label healing modifiers without invalid signed prose',
    (test) => {
      const [entry] = buildCombatStory(
        [visible(healingResult(test.modifier, test.requested))],
        context
      );

      expect(entry?.detail).toBe(test.detail);
      expect(entry?.detail).not.toContain('+ -');
    }
  );

  it('keeps nonzero roll arithmetic when authoritative clamping applies zero healing', () => {
    const [entry] = buildCombatStory(
      [visible(healingResult(1, 7, 25n, 6, 0, 10, 10))],
      context
    );

    expect(entry?.headline).toBe('Aldric recovers 0 HP');
    expect(entry?.detail).toBe(
      'Second Wind rolled 6 + 1 = 7; 0 applied (10 → 10 HP).'
    );
  });

  it('omits healing arithmetic only when both raw roll inputs are zero', () => {
    const [entry] = buildCombatStory(
      [visible(healingResult(0, 0, 25n, 0))],
      context
    );

    expect(entry?.detail).toBe('Second Wind; 2 applied (8 → 10 HP).');
  });

  it('renders every non-healing activation result from its typed provider fields', () => {
    const conditionApplied = create(EventSchema, {
      session: 'crypt-run',
      seq: 26n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'conditionApplied',
            value: create(ConditionAppliedSchema, {
              target: 'aldric',
              ref: 'dnd5e:conditions:raging',
              name: 'Raging',
            }),
          },
        }),
      },
    });
    const conditionRemoved = create(EventSchema, {
      session: 'crypt-run',
      seq: 27n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'conditionRemoved',
            value: create(ConditionRemovedSchema, {
              target: 'skeleton-guard',
              ref: 'module:condition:provider-slug',
              name: 'Provider Ward',
              reason: 'the ward expired',
            }),
          },
        }),
      },
    });
    const capacity = create(EventSchema, {
      session: 'crypt-run',
      seq: 28n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'capacityGranted',
            value: create(CapacityGrantedSchema, {
              member: 'aldric',
              description: '30ft movement',
            }),
          },
        }),
      },
    });

    const story = buildCombatStory(
      [visible(conditionApplied), visible(conditionRemoved), visible(capacity)],
      context
    );

    expect(story).toMatchObject([
      {
        headline: 'Aldric begins Raging',
      },
      {
        headline: 'Skeleton Guard is no longer Provider Ward',
        detail: 'the ward expired',
      },
      {
        headline: 'Aldric gains capacity',
        detail: '30ft movement',
      },
    ]);
    expect(JSON.stringify(story)).not.toContain('provider-slug');
  });

  it('omits a buffered actor event rather than falling back to payload prose', () => {
    const facts = createAttackAuthorityFixture();
    facts.event.payload = new TextEncoder().encode(
      'AUTHORED EARLY SPOILER: Aldric rolled twelve'
    );

    expect(
      buildCombatStory(
        [{ event: facts.event, source: 'live', visible: false }],
        context
      )
    ).toEqual([]);
  });

  it('keeps other Story entries sourced from typed bodies and ignores raw payload', () => {
    const event = create(EventSchema, {
      session: 'crypt-run',
      seq: 24n,
      at: 10n,
      recipient: 'aldric',
      kind: EventKind.DOWNED,
      payload: new TextEncoder().encode('fixture says a dragon explodes'),
      body: {
        case: 'downed',
        value: create(DownedSchema, { member: 'skeleton-guard' }),
      },
    });

    const [entry] = buildCombatStory([visible(event)], context);
    expect(entry?.headline).toBe('Skeleton Guard is downed');
    expect(JSON.stringify(entry)).not.toContain('dragon explodes');
  });
});
