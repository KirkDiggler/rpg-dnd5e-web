import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { create } from '@bufbuild/protobuf';
import {
  DeathSaveRolledSchema,
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { DeathSaveResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  DeathSaveContinuation,
  DeathSaveOutcome,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { localWorldDieReleaseEvent } from '../local-world-die/localWorldDieAuthority';
import {
  deathSaveResponseFact,
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentPresentation,
  selectVisibleStory,
} from './presentation';

const response = create(DeathSaveResponseSchema, {
  seq: 27n,
  roll: 12,
  outcome: DeathSaveOutcome.SUCCESS,
  successesAdded: 1,
  successes: 2,
  failures: 1,
  successesNeeded: 7,
  failuresRemaining: 9,
  continuation: DeathSaveContinuation.END_TURN,
  presentationId: 'presentation_opaque-token',
});
const event = create(EventSchema, {
  session: 'crypt-run',
  seq: 103n,
  recipient: 'wizard-1',
  kind: EventKind.DEATH_SAVE_ROLLED,
  body: {
    case: 'deathSaveRolled',
    value: create(DeathSaveRolledSchema, {
      actor: 'fighter-1',
      roll: response.roll,
      outcome: response.outcome,
      successesAdded: response.successesAdded,
      failuresAdded: response.failuresAdded,
      successes: response.successes,
      failures: response.failures,
      successesNeeded: response.successesNeeded,
      failuresRemaining: response.failuresRemaining,
      stabilized: response.stabilized,
      dead: response.dead,
      recovered: response.recovered,
      hpRestored: response.hpRestored,
      continuation: response.continuation,
      presentationId: response.presentationId,
    }),
  },
});
const metadata = { source: 'live' as const, deliveredAt: 1 } as never;

function configured(viewerMember = 'fighter-1') {
  return emptyPresentation({
    session: 'crypt-run',
    viewerMember,
    memberNames: { 'fighter-1': 'Aldric', 'wizard-1': 'Lyra' },
    rollerRoles: { 'fighter-1': 'player', 'wizard-1': 'player' },
  });
}

describe('shared Death Save d20 presentation', () => {
  it('keeps opaque presentation identity separate from actor recipient-local authority sequence', () => {
    const state = reduceCombatPresentation(
      configured(),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );
    const current = selectCurrentPresentation(state)!;

    expect(current.authority).toMatchObject({
      kind: 'death-save',
      roller: 'fighter-1',
      presentationId: 'presentation_opaque-token',
      authoritySeq: 27n,
    });
    expect(current.request).toMatchObject({
      presentationId: 'presentation_opaque-token',
      authoritySeq: 27n,
      roller: { entityId: 'fighter-1', role: 'player' },
      die: { authoritativeResult: 12 },
    });
  });

  it('matches a witness event by opaque token even when its local event sequence differs', () => {
    const responseFirst = reduceCombatPresentation(
      reduceCombatPresentation(
        configured(),
        deathSaveResponseFact({
          session: 'crypt-run',
          member: 'fighter-1',
          response,
        })
      ),
      { type: 'stream-event', event, metadata }
    );
    const eventFirst = reduceCombatPresentation(
      reduceCombatPresentation(configured(), {
        type: 'stream-event',
        event,
        metadata,
      }),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );

    expect(responseFirst.presentations).toHaveLength(1);
    expect(eventFirst.presentations).toHaveLength(1);
    expect(responseFirst.presentations[0]?.conflicted).toBe(false);
    expect(eventFirst.presentations[0]?.conflicted).toBe(false);
  });

  it('keeps witness narration hidden until that shared throw settles in bounds', () => {
    let state = reduceCombatPresentation(configured('wizard-1'), {
      type: 'stream-event',
      event,
      metadata,
    });
    expect(selectCurrentPresentation(state)).toMatchObject({
      presentationId: 'presentation_opaque-token',
      settlement: 'armed',
      authority: { seq: 103n },
    });
    expect(selectVisibleStory(state)).toEqual([]);

    state = reduceCombatPresentation(state, {
      type: 'witness-settlement',
      presentationId: 'presentation_opaque-token',
    });
    expect(selectVisibleStory(state)[0]?.headline).toBe(
      'Death save! 2 successes — 7 to stabilize.'
    );
  });

  it('reveals nothing until an in-bounds release and retains the same result/token for presentation retry', () => {
    let state = reduceCombatPresentation(
      configured(),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );
    state = reduceCombatPresentation(state, {
      type: 'stream-event',
      event,
      metadata,
    });
    const request = selectCurrentPresentation(state)!.request!;

    expect(selectVisibleStory(state)).toEqual([]);
    expect(selectCurrentPresentation(state)?.settlement).toBe('armed');
    expect(selectCurrentPresentation(state)?.request).toBe(request);

    state = reduceCombatPresentation(state, {
      type: 'local-release',
      event: localWorldDieReleaseEvent(
        request,
        createNeutralVisualThrowProfile(27)
      ),
    });
    expect(selectVisibleStory(state)[0]).toMatchObject({
      headline: 'Death save! 2 successes — 7 to stabilize.',
    });

    const duplicate = reduceCombatPresentation(state, {
      type: 'local-release',
      event: state.presentations[0]!.release!,
    });
    expect(duplicate).toBe(state);
  });
});
