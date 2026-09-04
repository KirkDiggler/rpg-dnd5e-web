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
  selectBlocksManualEndTurn,
  selectConcealsDeathSaveTruth,
  selectCurrentPresentation,
  selectVisibleStory,
} from './presentation';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';

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
function deathSaveValue(presentationId: string) {
  if (event.body.case !== 'deathSaveRolled') {
    throw new Error('expected Death Save event fixture');
  }
  return create(DeathSaveRolledSchema, {
    ...event.body.value,
    presentationId,
  });
}

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
  it('accepts provider dot/tilde presentation tokens for the physical request path', () => {
    const dotted = create(DeathSaveResponseSchema, {
      ...response,
      presentationId: 'presentation.death-save~v1',
    });
    const state = reduceCombatPresentation(
      configured(),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response: dotted,
      })
    );

    expect(selectCurrentPresentation(state)?.request).toMatchObject({
      presentationId: 'presentation.death-save~v1',
      authoritySeq: 27n,
    });
    expect(selectCurrentPresentation(state)?.semanticFallback).toBe(false);
  });

  it.each([
    'presentation/death-save',
    'presentation\u0000death-save',
    'p'.repeat(129),
  ])(
    'routes unsafe provider token %j to semantic fallback without early reveal',
    (presentationId) => {
      const unsafeResponse = create(DeathSaveResponseSchema, {
        ...response,
        presentationId,
      });
      const unsafeEvent = create(EventSchema, {
        session: 'crypt-run',
        seq: 109n,
        kind: EventKind.DEATH_SAVE_ROLLED,
        body: {
          case: 'deathSaveRolled',
          value: deathSaveValue(presentationId),
        },
      });
      let state = reduceCombatPresentation(
        reduceCombatPresentation(
          configured(),
          deathSaveResponseFact({
            session: 'crypt-run',
            member: 'fighter-1',
            response: unsafeResponse,
          })
        ),
        { type: 'stream-event', event: unsafeEvent, metadata }
      );
      const pending = selectCurrentPresentation(state)!;

      expect(pending.request).toBeUndefined();
      expect(pending.semanticFallback).toBe(true);
      expect(selectVisibleStory(state)).toEqual([]);

      state = reduceCombatPresentation(state, {
        type: 'semantic-release',
        presentationKey: pending.key,
      });
      expect(selectVisibleStory(state)[0]?.headline).toBe(
        'Death save! 2 successes — 7 to stabilize.'
      );
    }
  );

  it('settles the intended Death Save witness when an Attack shares its visible token', () => {
    const attack = createAttackAuthorityFixture({
      session: 'crypt-run',
      seq: 23n,
      attacker: 'fighter-1',
    });
    const collidingToken = 'session:crypt-run:23';
    const collidingDeathSave = create(EventSchema, {
      session: 'crypt-run',
      seq: 103n,
      kind: EventKind.DEATH_SAVE_ROLLED,
      body: {
        case: 'deathSaveRolled',
        value: deathSaveValue(collidingToken),
      },
    });
    let state = reduceCombatPresentation(
      reduceCombatPresentation(configured('wizard-1'), {
        type: 'stream-event',
        event: attack.event,
        metadata,
      }),
      { type: 'stream-event', event: collidingDeathSave, metadata }
    );
    const attackBefore = state.presentations.find(
      (record) => record.authority.kind === 'attack'
    );

    state = reduceCombatPresentation(state, {
      type: 'witness-settlement',
      presentationId: collidingToken,
    });

    expect(
      state.presentations.find(
        (record) => record.authority.kind === 'death-save'
      )?.settlement
    ).toBe('released');
    expect(
      state.presentations.find((record) => record.authority.kind === 'attack')
    ).toBe(attackBefore);
    expect(selectVisibleStory(state).at(-1)?.headline).toBe(
      'Death save! 2 successes — 7 to stabilize.'
    );
  });

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

  it('keeps witness narration and refreshed current-state truth hidden until that shared throw settles in bounds', () => {
    let state = reduceCombatPresentation(configured('wizard-1'), {
      type: 'stream-event',
      event,
      metadata,
    });
    const witnessRecord = selectCurrentPresentation(state)!;
    expect(witnessRecord).toMatchObject({
      presentationId: 'presentation_opaque-token',
      settlement: 'armed',
      authority: { seq: 103n },
    });
    expect(Object.hasOwn(witnessRecord.authority, 'authoritySeq')).toBe(false);
    expect(Object.hasOwn(witnessRecord.request!, 'authoritySeq')).toBe(false);
    expect(selectVisibleStory(state)).toEqual([]);
    expect(selectConcealsDeathSaveTruth(state)).toBe(true);

    state = reduceCombatPresentation(state, {
      type: 'witness-settlement',
      presentationId: 'presentation_opaque-token',
    });
    expect(selectConcealsDeathSaveTruth(state)).toBe(false);
    expect(selectVisibleStory(state)[0]?.headline).toBe(
      'Death save! 2 successes — 7 to stabilize.'
    );
  });

  it('upgrades event-first local authority from the actor response without parsing or borrowing the event sequence', () => {
    let state = reduceCombatPresentation(configured(), {
      type: 'stream-event',
      event,
      metadata,
    });
    let current = selectCurrentPresentation(state)!;
    expect(Object.hasOwn(current.authority, 'authoritySeq')).toBe(false);
    expect(Object.hasOwn(current.request!, 'authoritySeq')).toBe(false);
    expect(selectBlocksManualEndTurn(state)).toBe(true);

    state = reduceCombatPresentation(
      state,
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );
    current = selectCurrentPresentation(state)!;
    expect(current.authority.authoritySeq).toBe(27n);
    expect(current.request?.authoritySeq).toBe(27n);
    expect(current.authority.seq).toBe(103n);
  });

  it('converges event-before-release and release-before-event on one visible result', () => {
    const responseState = reduceCombatPresentation(
      configured(),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );
    const release = localWorldDieReleaseEvent(
      selectCurrentPresentation(responseState)!.request!,
      createNeutralVisualThrowProfile(27)
    );
    const eventBeforeRelease = reduceCombatPresentation(
      reduceCombatPresentation(responseState, {
        type: 'stream-event',
        event,
        metadata,
      }),
      { type: 'local-release', event: release }
    );
    const releaseBeforeEvent = reduceCombatPresentation(
      reduceCombatPresentation(responseState, {
        type: 'local-release',
        event: release,
      }),
      { type: 'stream-event', event, metadata }
    );

    expect(selectVisibleStory(eventBeforeRelease)).toEqual(
      selectVisibleStory(releaseBeforeEvent)
    );
    expect(selectCurrentPresentation(eventBeforeRelease)?.settlement).toBe(
      'released'
    );
    expect(selectCurrentPresentation(releaseBeforeEvent)?.settlement).toBe(
      'released'
    );
  });

  it('diagnoses a conflicting Death Save release without replacing the accepted release', () => {
    let state = reduceCombatPresentation(
      configured(),
      deathSaveResponseFact({
        session: 'crypt-run',
        member: 'fighter-1',
        response,
      })
    );
    const request = selectCurrentPresentation(state)!.request!;
    state = reduceCombatPresentation(state, {
      type: 'local-release',
      event: localWorldDieReleaseEvent(
        request,
        createNeutralVisualThrowProfile(27)
      ),
    });
    const accepted = selectCurrentPresentation(state)!.release;

    const conflict = reduceCombatPresentation(state, {
      type: 'local-release',
      event: localWorldDieReleaseEvent(
        request,
        createNeutralVisualThrowProfile(99)
      ),
    });

    expect(selectCurrentPresentation(conflict)?.release).toBe(accepted);
    expect(conflict.diagnostics.at(-1)).toContain('conflicting release');
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
    expect(selectConcealsDeathSaveTruth(state)).toBe(true);
    expect(selectCurrentPresentation(state)?.settlement).toBe('armed');
    expect(selectCurrentPresentation(state)?.request).toBe(request);

    state = reduceCombatPresentation(state, {
      type: 'local-release',
      event: localWorldDieReleaseEvent(
        request,
        createNeutralVisualThrowProfile(27)
      ),
    });
    expect(selectConcealsDeathSaveTruth(state)).toBe(false);
    expect(selectVisibleStory(state)[0]).toMatchObject({
      headline: 'Death save! 2 successes — 7 to stabilize.',
    });

    const duplicate = reduceCombatPresentation(state, {
      type: 'local-release',
      event: state.presentations[0]!.release!,
    });
    expect(duplicate).toBe(state);
  });

  it('keeps catch-up Death Saves current and never applies concealment to Attack', () => {
    const historical = reduceCombatPresentation(configured('wizard-1'), {
      type: 'stream-event',
      event,
      metadata: { source: 'catchup', deliveredAt: 1 } as never,
    });
    const attack = createAttackAuthorityFixture({
      session: 'crypt-run',
      attacker: 'fighter-1',
    });
    const liveAttack = reduceCombatPresentation(configured(), {
      type: 'stream-event',
      event: attack.event,
      metadata,
    });

    expect(selectConcealsDeathSaveTruth(historical)).toBe(false);
    expect(selectConcealsDeathSaveTruth(liveAttack)).toBe(false);
  });
});
