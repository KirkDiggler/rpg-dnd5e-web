// @vitest-environment node
import { clone, create } from '@bufbuild/protobuf';
import {
  ActivationResultSchema,
  CastMissedSchema,
  CastSchema,
  ConditionAppliedSchema,
  ConditionRemovedSchema,
  EventKind,
  EventSchema,
  HealingAppliedSchema,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { SpellRefSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { refreshKeysFor } from '../sessionRefreshKeys';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectVisibleStory,
} from './presentation';

const bless = create(SpellRefSchema, {
  ref: 'dnd5e:spells:bless',
  name: 'Bless',
});
const context = {
  session: 'cleric-run',
  viewerMember: 'cleric',
  memberNames: { cleric: 'Mercy', ally: 'Ally', absent: 'Robin' },
  rollerRoles: { cleric: 'player' as const, ally: 'player' as const },
};

function cast() {
  return create(EventSchema, {
    session: context.session,
    seq: 1n,
    recipient: 'cleric',
    kind: EventKind.CAST,
    body: {
      case: 'cast',
      value: create(CastSchema, {
        actor: 'cleric',
        spell: bless,
        targets: ['ally', 'absent'],
      }),
    },
  });
}

function applied() {
  return create(EventSchema, {
    session: context.session,
    seq: 2n,
    recipient: 'cleric',
    kind: EventKind.ACTIVATION_RESULT,
    body: {
      case: 'activationResult',
      value: create(ActivationResultSchema, {
        actor: 'cleric',
        result: {
          case: 'conditionApplied',
          value: create(ConditionAppliedSchema, {
            target: 'ally',
            ref: 'dnd5e:conditions:blessed',
            name: 'Bless',
            sourceId: 'cleric',
          }),
        },
      }),
    },
  });
}

function missed() {
  return create(EventSchema, {
    session: context.session,
    seq: 3n,
    recipient: 'cleric',
    kind: EventKind.CAST_MISSED,
    body: {
      case: 'castMissed',
      value: create(CastMissedSchema, {
        actor: 'cleric',
        target: 'absent',
        spell: bless,
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
      ...context,
    })
  );
}

describe('Cleric cast outcomes in live and replay presentation', () => {
  it('keeps mixed Bless results in sequence with identical live and catch-up narration', () => {
    const events = [cast(), applied(), missed()];
    const live = feed(events);
    const replay = feed(events, 'catchup');
    expect(selectVisibleStory(live)).toEqual(selectVisibleStory(replay));
    expect(selectVisibleStory(live).map((entry) => entry.headline)).toEqual([
      'Mercy casts Bless',
      'Ally begins Bless',
      "Mercy's Bless missed Robin",
    ]);
    expect(selectVisibleStory(live)[0]?.detail).toBe(
      'Targets in order: Ally, Robin.'
    );
    expect(selectVisibleStory(live)[2]?.detail).toBe('');
    expect(live.presentations).toHaveLength(0);
    expect(live.diceEvents).toHaveLength(0);
    expect(live.diagnostics).toHaveLength(0);
  });

  it('deduplicates a replayed miss without dropping neighboring outcomes', () => {
    const live = feed([cast(), applied(), missed()]);
    const replayed = reduceCombatPresentation(live, {
      type: 'stream-event',
      event: missed(),
      metadata: { source: 'catchup' },
    });
    expect(selectVisibleStory(replayed)).toEqual(selectVisibleStory(live));
  });

  it('uses open spell references and member ids when names are absent', () => {
    const event = missed();
    if (event.body.case !== 'castMissed') throw new Error('fixture');
    event.body.value.actor = 'unknown-caster';
    event.body.value.target = 'unknown-target';
    event.body.value.spell = create(SpellRefSchema, {
      ref: 'expansion:spells:kindness',
    });
    expect(selectVisibleStory(feed([event]))[0]?.headline).toBe(
      "unknown-caster's expansion:spells:kindness missed unknown-target"
    );
  });

  it('rejects bodyless or mismatched missed-cast events', () => {
    const mismatch = missed();
    mismatch.kind = EventKind.MISSED;
    const bodyless = missed();
    bodyless.body = { case: undefined };
    expect(selectVisibleStory(feed([mismatch]))).toEqual([]);
    expect(selectVisibleStory(feed([bodyless]))).toEqual([]);
  });

  it.each(['actor', 'target', 'spell'] as const)(
    'rejects conflicting miss %s at the same sequence',
    (field) => {
      const changed = missed();
      if (changed.body.case !== 'castMissed') throw new Error('fixture');
      if (field === 'spell')
        changed.body.value.spell = create(SpellRefSchema, {
          ref: 'other:spell',
        });
      else changed.body.value[field] = 'somebody-else';
      const state = feed([missed(), changed]);
      expect(selectVisibleStory(state)).toEqual([]);
      expect(state.diagnostics.length).toBeGreaterThan(0);
    }
  );

  it('rejects conflicting ordered cast targets at the same sequence', () => {
    const changed = cast();
    if (changed.body.case !== 'cast') throw new Error('fixture');
    changed.body.value.targets.reverse();
    expect(selectVisibleStory(feed([cast(), changed]))).toEqual([]);
  });

  it.each(['conditionApplied', 'conditionRemoved'] as const)(
    'preserves %s source identity',
    (kind) => {
      const original = applied();
      if (kind === 'conditionRemoved') {
        original.body = {
          case: 'activationResult',
          value: create(ActivationResultSchema, {
            actor: 'cleric',
            result: {
              case: 'conditionRemoved',
              value: create(ConditionRemovedSchema, {
                target: 'ally',
                ref: 'dnd5e:conditions:blessed',
                name: 'Bless',
                sourceId: 'cleric',
                reason: 'recast',
              }),
            },
          }),
        };
      }
      const changed = clone(EventSchema, original);
      if (changed.body.case !== 'activationResult') throw new Error('fixture');
      const result = changed.body.value.result;
      if (result.case !== kind) throw new Error('fixture');
      result.value.sourceId = 'other-cleric';
      expect(selectVisibleStory(feed([original, changed]))).toEqual([]);
    }
  );

  it.each(['Cure Wounds', 'Healing Word'])(
    'renders authoritative %s healing in live and catch-up',
    (name) => {
      const event = create(EventSchema, {
        session: context.session,
        seq: 4n,
        recipient: 'cleric',
        kind: EventKind.ACTIVATION_RESULT,
        body: {
          case: 'activationResult',
          value: create(ActivationResultSchema, {
            actor: 'cleric',
            result: {
              case: 'healingApplied',
              value: create(HealingAppliedSchema, {
                target: 'ally',
                sourceName: name,
                sourceRef: `dnd5e:spells:${name.toLowerCase().replace(' ', '-')}`,
                amount: 2,
                requested: 7,
                roll: 4,
                modifier: 3,
                hpBefore: 8,
                hpAfter: 10,
              }),
            },
          }),
        },
      });
      const story = selectVisibleStory(feed([event]));
      expect(story).toEqual(selectVisibleStory(feed([event], 'catchup')));
      expect(story[0]?.headline).toBe('Ally recovers 2 HP');
      expect(story[0]?.detail).toBe(
        `${name} rolled 4 + 3 = 7; 2 applied (8 → 10 HP).`
      );
    }
  );

  it('refreshes authoritative snapshots after a paid miss without applying an effect locally', () => {
    expect(refreshKeysFor(missed(), 'cleric')).toEqual([
      'characterData',
      'afford',
      'view',
    ]);
  });
});
