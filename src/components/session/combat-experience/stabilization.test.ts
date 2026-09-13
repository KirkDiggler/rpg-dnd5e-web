// @vitest-environment node
import { clone, create } from '@bufbuild/protobuf';
import {
  ActivationResultSchema,
  EventKind,
  EventSchema,
  StabilizedSchema,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { LifeState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { formatDebugLine } from '../debugLogLine';
import { refreshKeysFor } from '../sessionRefreshKeys';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectVisibleStory,
} from './presentation';

const context = {
  session: 'stabilization',
  viewerMember: 'cleric',
  memberNames: { cleric: 'Mercy', patient: 'Robin' },
};
function event(before = LifeState.DYING) {
  return create(EventSchema, {
    session: context.session,
    recipient: 'cleric',
    seq: 2n,
    kind: EventKind.ACTIVATION_RESULT,
    body: {
      case: 'activationResult',
      value: create(ActivationResultSchema, {
        actor: 'cleric',
        result: {
          case: 'stabilized',
          value: create(StabilizedSchema, {
            target: 'patient',
            sourceRef: 'dnd5e:spells:spare_the_dying',
            sourceName: 'Spare the Dying',
            before,
            after: LifeState.STABILIZED,
            hitPoints: 0,
            progress: {
              successes: 0,
              failures: 0,
              successesNeeded: 3,
              failuresRemaining: 3,
              stabilized: true,
              dead: false,
            },
          }),
        },
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
    emptyPresentation(context)
  );
}

describe('Spare the Dying stabilization', () => {
  it.each([LifeState.DYING, LifeState.STABILIZED])(
    'narrates before=%s once, without a die, in live and recovered Story',
    (before) => {
      const result = event(before);
      const cast = create(EventSchema, {
        session: context.session,
        recipient: 'cleric',
        seq: 1n,
        kind: EventKind.CAST,
        body: {
          case: 'cast',
          value: {
            actor: 'cleric',
            targets: ['patient'],
            spell: {
              ref: 'dnd5e:spells:spare_the_dying',
              name: 'Spare the Dying',
            },
          },
        },
      });
      const live = feed([cast, result]);
      const story = selectVisibleStory(live);
      expect(story).toHaveLength(2);
      expect(story[0].headline).toContain('casts Spare the Dying');
      expect(story[1].headline).toBe(
        `Robin ${before === LifeState.STABILIZED ? 'remains stable' : 'is stabilized'}`
      );
      expect(story[1].detail).toBe(
        'Spare the Dying by Mercy; 0 HP (unchanged).'
      );
      expect(story[1].detail).not.toMatch(/heals|recovers|roll|reviv/i);
      expect(live.presentations).toHaveLength(0);
      expect(selectVisibleStory(feed([cast, result], 'catchup'))).toEqual(
        story
      );
      const duplicate = reduceCombatPresentation(live, {
        type: 'stream-event',
        event: result,
        metadata: { source: 'catchup' },
      });
      expect(selectVisibleStory(duplicate)).toEqual(story);
      expect(refreshKeysFor(result, 'patient')).toEqual([
        'characterData',
        'afford',
        'turn',
        'view',
      ]);
      const debug = formatDebugLine(
        result,
        new Map(Object.entries(context.memberNames))
      ).text;
      expect(debug).toContain('result=stabilized target=Robin');
      for (const value of [
        '"successes":0',
        '"failures":0',
        '"successesNeeded":3',
        '"failuresRemaining":3',
        '"stabilized":true',
        '"dead":false',
      ])
        expect(debug).toContain(value);
    }
  );

  it.each([
    'target',
    'sourceRef',
    'sourceName',
    'before',
    'after',
    'hitPoints',
    'progress',
    'successes',
    'failures',
    'successesNeeded',
    'failuresRemaining',
    'stabilized',
    'dead',
  ])(
    'includes %s in conflict detection instead of silently dropping changed facts',
    (field) => {
      const original = event();
      const changed = clone(EventSchema, original);
      if (
        changed.body.case !== 'activationResult' ||
        changed.body.value.result.case !== 'stabilized'
      )
        throw Error('fixture');
      const result = changed.body.value.result.value;
      switch (field) {
        case 'target':
        case 'sourceRef':
        case 'sourceName':
          result[field] = 'different';
          break;
        case 'before':
        case 'after':
          result[field] = LifeState.CONSCIOUS;
          break;
        case 'hitPoints':
          result.hitPoints = 1;
          break;
        case 'progress':
          result.progress = undefined;
          break;
        case 'successes':
        case 'failures':
        case 'successesNeeded':
        case 'failuresRemaining':
          result.progress![field] = 7;
          break;
        case 'stabilized':
        case 'dead':
          result.progress![field] = !result.progress![field];
          break;
      }
      expect(selectVisibleStory(feed([original, changed]))).toEqual([]);
    }
  );
});
