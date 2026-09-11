// @vitest-environment node
import type {
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { create } from '@bufbuild/protobuf';
import {
  DownedSchema,
  EventKind,
  EventSchema,
  RollWindowOpenedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectCurrentPresentation,
  selectLiveAnnouncement,
  selectVisibleResult,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';
import {
  createAttackAuthorityFixture,
  debugText,
} from './presentation.test-fixtures';

/** Longer than the 128-byte presentation-id cap, so it fails validation. */
const UNSAFE_PRESENTATION_ID = 'x'.repeat(129);

const config = {
  session: 'crypt-run',
  viewerMember: 'aldric',
  memberNames: {
    aldric: 'Aldric',
    'skeleton-guard': 'Skeleton Guard',
    mira: 'Mira',
  },
  rollerRoles: {
    aldric: 'player' as const,
    'skeleton-guard': 'monster' as const,
    mira: 'player' as const,
  },
};

function requestOf(
  state: CombatPresentationState
): DicePresentationRequestedEvent {
  const request = state.diceEvents.find(
    (event): event is DicePresentationRequestedEvent =>
      event.type === 'dice-presentation-requested'
  );
  if (!request) throw new Error('expected a dice request');
  return request;
}

function releaseFact(state: CombatPresentationState) {
  const request = selectCurrentDiceEvents(state).find(
    (event): event is DicePresentationRequestedEvent =>
      event.type === 'dice-presentation-requested'
  );
  if (!request) throw new Error('expected a current dice request');
  const event: DicePresentationReleasedEvent = {
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: `${request.presentationId}:release`,
    presentationId: request.presentationId,
    release: createDicePresentationRelease({
      presentationId: request.presentationId,
      presetId: request.die.presetId,
      throwProfile: createNeutralVisualThrowProfile(101),
    }),
  };
  return { type: 'local-release' as const, event };
}

function requestCount(state: CombatPresentationState) {
  return state.diceEvents.filter(
    (event) => event.type === 'dice-presentation-requested'
  ).length;
}

function releaseCount(state: CombatPresentationState) {
  return state.diceEvents.filter(
    (event) => event.type === 'dice-presentation-released'
  ).length;
}

function downedFact(member: string, source: 'live' | 'catchup' = 'live') {
  return {
    type: 'stream-event' as const,
    event: create(EventSchema, {
      session: 'crypt-run',
      seq: 23n,
      kind: EventKind.DOWNED,
      recipient: 'aldric',
      body: {
        case: 'downed' as const,
        value: create(DownedSchema, { member }),
      },
    }),
    metadata: { source },
  };
}

function expectConflictClosed(state: CombatPresentationState) {
  expect(state.identities).toHaveLength(1);
  expect(state.identities[0]?.conflicted).toBe(true);
  expect(
    state.presentations[0]?.conflicted ?? state.otherStory[0]?.conflicted
  ).toBe(true);
  expect(selectVisibleStory(state)).toEqual([]);
  expect(selectVisibleResult(state)).toBeUndefined();
  expect(selectLiveAnnouncement(state)).toBeNull();
  expect(selectCurrentDiceEvents(state)).toEqual([]);
  expect(selectCurrentPresentation(state)).toBe(state.presentations[0]);
}

function identifiedWindowFact() {
  return {
    type: 'stream-event' as const,
    event: create(EventSchema, {
      session: 'crypt-run',
      seq: 23n,
      kind: EventKind.ROLL_WINDOW_OPENED,
      body: {
        case: 'rollWindowOpened' as const,
        value: create(RollWindowOpenedSchema, {
          presentationId: 'shared-window-roll',
          audience: 'aldric',
          roll: 9,
          total: 13,
          offer: {
            ref: 'dnd5e:conditions:inspired',
            name: 'Bardic Inspiration',
          },
        }),
      },
    }),
    metadata: { source: 'live' as const },
  };
}

describe('combat presentation authority reconciliation', () => {
  it('supplies the spectator die from the existing identified window before an outcome', () => {
    const state = reduceCombatPresentation(
      emptyPresentation({ ...config, viewerMember: 'mira' }),
      identifiedWindowFact()
    );
    expect(selectCurrentDiceEvents(state)[0]).toMatchObject({
      presentationId: 'shared-window-roll',
      roller: { entityId: 'aldric', role: 'player' },
      die: { authoritativeResult: 9 },
    });
    expect(selectVisibleResult(state)).toBeUndefined();
    expect(selectCurrentPresentation(state)?.authority.target).toBeUndefined();
    expect(selectCurrentPresentation(state)?.authority.hit).toBeUndefined();
  });

  it.each(['event-first', 'response-first'])(
    'reconciles the owner window %s without another die',
    (order) => {
      const response = createAttackAuthorityFixture({
        presentationId: 'shared-window-roll',
        roll: 9,
        total: 13,
        against: 0,
        hit: false,
        damage: 0,
      }).responseFact;
      const facts =
        order === 'event-first'
          ? [identifiedWindowFact(), response]
          : [response, identifiedWindowFact()];
      let state = emptyPresentation(config);
      for (const fact of facts) state = reduceCombatPresentation(state, fact);
      expect(state.presentations).toHaveLength(1);
      expect(selectCurrentPresentation(state)?.conflicted).toBe(false);
      expect(selectCurrentPresentation(state)?.authority.target).toBe(
        'skeleton-guard'
      );
      expect(requestCount(state)).toBe(1);
      state = reduceCombatPresentation(state, releaseFact(state));
      const outcome = createAttackAuthorityFixture({
        seq: 24n,
        presentationId: 'shared-window-roll',
        roll: 9,
        total: 17,
      });
      state = reduceCombatPresentation(state, outcome.streamFact());
      expect(selectVisibleResult(state)).toMatchObject({ d20: 9, total: 17 });
      expect(selectCurrentPresentation(state)?.settlement).toBe('released');
      expect(requestCount(state)).toBe(1);
    }
  );

  it('does not re-arm a settled post-roll d20 when its outcome arrives at a later sequence', () => {
    const paused = createAttackAuthorityFixture({
      seq: 23n,
      roll: 9,
      total: 13,
      against: 0,
      hit: false,
      damage: 0,
      presentationId: 'paused-swing',
    });
    const outcome = createAttackAuthorityFixture({
      seq: 24n,
      roll: 9,
      total: 16,
      against: 15,
      hit: true,
      damage: 5,
      presentationId: 'paused-swing',
    });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      paused.responseFact
    );
    state = reduceCombatPresentation(state, releaseFact(state));
    state = reduceCombatPresentation(state, outcome.streamFact());
    expect(selectCurrentPresentation(state)?.settlement).toBe('released');
    expect(selectVisibleResult(state)).toMatchObject({ total: 16, hit: true });

    const next = createAttackAuthorityFixture({
      seq: 25n,
      presentationId: 'next-swing',
    });
    state = reduceCombatPresentation(state, next.responseFact);
    expect(selectCurrentPresentation(state)?.presentationId).toBe('next-swing');
    expect(selectCurrentDiceEvents(state)[0]?.presentationId).toBe(
      'next-swing'
    );
  });

  it('keeps the roll-window beat beside its same-sequence paused response without treating them as a conflict', () => {
    const facts = createAttackAuthorityFixture({ roll: 9, total: 13 });
    const rollWindow = {
      type: 'stream-event' as const,
      event: create(EventSchema, {
        session: 'crypt-run',
        seq: 23n,
        kind: EventKind.ROLL_WINDOW_OPENED,
        body: {
          case: 'rollWindowOpened' as const,
          value: create(RollWindowOpenedSchema, {
            audience: 'aldric',
            offer: {
              ref: 'dnd5e:conditions:inspired',
              name: 'Bardic Inspiration',
            },
            roll: 9,
            total: 13,
          }),
        },
      }),
      metadata: { source: 'live' as const },
    };

    let state = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    state = reduceCombatPresentation(state, rollWindow);

    expect(state.presentations).toHaveLength(1);
    expect(state.presentations[0]?.conflicted).toBe(false);
    expect(state.otherStory).toHaveLength(1);
    expect(selectCurrentDiceEvents(state)).toHaveLength(1);
    expect(selectVisibleStory(state)[0]?.headline).toBe(
      'Aldric rolled d20 9 + 4 = 13'
    );
  });

  it('response first arms once and hides Story, verdict, and live result until release', () => {
    const facts = createAttackAuthorityFixture();
    const armed = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    const reconciled = reduceCombatPresentation(armed, facts.streamFact());

    expect(requestCount(reconciled)).toBe(1);
    expect(requestOf(reconciled)).toMatchObject({
      presentationId: 'presentation~crypt-run~23',
      roller: { entityId: 'aldric', role: 'player' },
      die: {
        presetId: 'dice.original.carved.d20',
        authoritativeResult: 12,
      },
    });
    expect(selectVisibleStory(reconciled)).toEqual([]);
    expect(selectVisibleResult(reconciled)).toBeUndefined();
    expect(selectLiveAnnouncement(reconciled)).toBeNull();
    expect(debugText(reconciled.debug[0])).toContain('struck');

    const released = reduceCombatPresentation(
      reconciled,
      releaseFact(reconciled)
    );
    expect(selectVisibleStory(released)).toHaveLength(1);
    expect(selectVisibleResult(released)?.d20).toBe(12);
    expect(selectLiveAnnouncement(released)).toContain('Aldric');
  });

  // The attacker and a witness are two different clients holding two different
  // numbers for one swing — seq is per recipient, and comparing seqs across
  // recipients is meaningless. They must still name ONE roll, because the
  // shared physical die is replayed by identity: a witness only plays the
  // roller's throw when the plan's presentation id equals its own expectation.
  // Deriving that id from a seq made the two sides permanently unequal.
  it('the attacker and a witness name one roll, though their own seqs differ', () => {
    const attackerSide = createAttackAuthorityFixture();
    const witnessSide = createAttackAuthorityFixture({
      recipient: 'mira',
      eventSeq: 7n,
    });

    const attacker = reduceCombatPresentation(
      emptyPresentation(config),
      attackerSide.responseFact
    );
    const witness = reduceCombatPresentation(
      emptyPresentation({ ...config, viewerMember: 'mira' }),
      witnessSide.streamFact()
    );

    expect(requestOf(attacker).presentationId).toBe(
      'presentation~crypt-run~23'
    );
    expect(requestOf(witness).presentationId).toBe(
      requestOf(attacker).presentationId
    );
  });

  it('event first arms the same presentation and waits for release regardless of response timing', () => {
    const facts = createAttackAuthorityFixture();
    const eventFirst = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact()
    );
    const reconciled = reduceCombatPresentation(eventFirst, facts.responseFact);

    expect(requestCount(reconciled)).toBe(1);
    expect(reconciled.presentations).toHaveLength(1);
    expect(selectVisibleStory(reconciled)).toEqual([]);

    const released = reduceCombatPresentation(
      reconciled,
      releaseFact(reconciled)
    );
    expect(selectVisibleStory(released)).toHaveLength(1);
    expect(selectVisibleResult(released)?.attackRef).toBe(
      'dnd5e:weapons:longsword'
    );
  });

  it('accepts a release before the typed event but waits for that event before revealing Story', () => {
    const facts = createAttackAuthorityFixture();
    const armed = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    const releasedBeforeEvent = reduceCombatPresentation(
      armed,
      releaseFact(armed)
    );

    expect(selectVisibleStory(releasedBeforeEvent)).toEqual([]);
    expect(selectVisibleResult(releasedBeforeEvent)).toBeUndefined();

    const eventArrives = reduceCombatPresentation(
      releasedBeforeEvent,
      facts.streamFact()
    );
    expect(selectVisibleStory(eventArrives)).toHaveLength(1);
    expect(selectVisibleResult(eventArrives)?.d20).toBe(12);
  });

  it('deduplicates repeated response/event delivery and groups one attack Story by sequence', () => {
    const facts = createAttackAuthorityFixture();
    let state = emptyPresentation(config);
    state = reduceCombatPresentation(state, facts.responseFact);
    state = reduceCombatPresentation(state, facts.responseFact);
    state = reduceCombatPresentation(state, facts.streamFact());
    state = reduceCombatPresentation(state, facts.streamFact());
    state = reduceCombatPresentation(state, releaseFact(state));

    expect(requestCount(state)).toBe(1);
    expect(releaseCount(state)).toBe(1);
    expect(state.presentations).toHaveLength(1);
    expect(selectVisibleStory(state)).toHaveLength(1);
  });

  it.each([
    ['hit/miss', { hit: false, damage: 0 }],
    ['roller', { attacker: 'mira' }],
    ['target', { target: 'mira' }],
    ['result', { roll: 4, total: 9 }],
    [
      'AttackRef',
      {
        attackRef: 'dnd5e:weapons:dagger',
        attackName: 'Dagger',
      },
    ],
    ['damage', { damage: 3 }],
  ] as const)(
    'fails closed for a conflicting %s in response-first and event-first order',
    (_, mismatch) => {
      const accepted = createAttackAuthorityFixture();
      const conflict = createAttackAuthorityFixture(mismatch);

      let responseFirst = reduceCombatPresentation(
        emptyPresentation(config),
        accepted.responseFact
      );
      responseFirst = reduceCombatPresentation(
        responseFirst,
        conflict.streamFact()
      );

      let eventFirst = reduceCombatPresentation(
        emptyPresentation(config),
        conflict.streamFact()
      );
      eventFirst = reduceCombatPresentation(eventFirst, accepted.responseFact);

      expectConflictClosed(responseFirst);
      expectConflictClosed(eventFirst);
      expect(responseFirst.diagnostics.at(-1)).toContain(
        'conflicting authority'
      );
      expect(eventFirst.debug.at(-1)).toContain('conflicting authority');
    }
  );

  it('does not keep announcing an older result while a newer actor result is concealed', () => {
    const witness = createAttackAuthorityFixture({
      seq: 22n,
      attacker: 'skeleton-guard',
    });
    const actor = createAttackAuthorityFixture({ seq: 23n });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      witness.streamFact()
    );
    expect(selectLiveAnnouncement(state)).not.toBeNull();

    state = reduceCombatPresentation(state, actor.streamFact());
    expect(selectLiveAnnouncement(state)).toBeNull();
    expect(selectVisibleResult(state)).toBeUndefined();
  });

  it.each([
    ['result', { roll: 4, total: 9 }],
    ['roller', { attacker: 'mira' }],
  ] as const)(
    'keeps settled Story but makes a newer conflicting %s authoritative-current in both arrival orders',
    (_, mismatch) => {
      const settled = createAttackAuthorityFixture({
        seq: 22n,
        attacker: 'skeleton-guard',
      });
      const accepted = createAttackAuthorityFixture({ seq: 23n });
      const conflict = createAttackAuthorityFixture({
        seq: 23n,
        ...mismatch,
      });

      for (const facts of [
        [accepted.responseFact, conflict.streamFact()],
        [conflict.streamFact(), accepted.responseFact],
      ] as const) {
        let state = reduceCombatPresentation(
          emptyPresentation(config),
          settled.streamFact()
        );
        expect(selectVisibleResult(state)?.seq).toBe(22n);
        expect(selectLiveAnnouncement(state)).not.toBeNull();

        state = reduceCombatPresentation(state, facts[0]);
        state = reduceCombatPresentation(state, facts[1]);

        expect(selectVisibleStory(state)).toHaveLength(1);
        expect(selectVisibleStory(state)[0]?.id).toContain(':22');
        expect(selectCurrentPresentation(state)).toMatchObject({
          seq: 23n,
          conflicted: true,
        });
        expect(selectVisibleResult(state)).toBeUndefined();
        expect(selectLiveAnnouncement(state)).toBeNull();
        expect(selectCurrentDiceEvents(state)).toEqual([]);
      }
    }
  );

  it('makes a newer conflict current over an older pending local attack', () => {
    const pending = createAttackAuthorityFixture({ seq: 22n });
    const accepted = createAttackAuthorityFixture({ seq: 23n });
    const conflict = createAttackAuthorityFixture({
      seq: 23n,
      roll: 4,
      total: 9,
    });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      pending.streamFact()
    );
    state = reduceCombatPresentation(state, accepted.responseFact);
    state = reduceCombatPresentation(state, conflict.streamFact());

    expect(state.pendingLocalKeys).toEqual([state.presentations[0]?.key]);
    expect(selectCurrentPresentation(state)).toMatchObject({
      seq: 23n,
      conflicted: true,
    });
    expect(selectCurrentDiceEvents(state)).toEqual([]);
    expect(selectVisibleResult(state)).toBeUndefined();
    expect(selectLiveAnnouncement(state)).toBeNull();
  });

  it('keeps a newer pending local attack current over an older conflict', () => {
    const accepted = createAttackAuthorityFixture({ seq: 22n });
    const conflict = createAttackAuthorityFixture({
      seq: 22n,
      roll: 4,
      total: 9,
    });
    const pending = createAttackAuthorityFixture({ seq: 23n });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      accepted.responseFact
    );
    state = reduceCombatPresentation(state, conflict.streamFact());
    state = reduceCombatPresentation(state, pending.streamFact());

    expect(selectCurrentPresentation(state)).toMatchObject({
      seq: 23n,
      conflicted: false,
      settlement: 'armed',
    });
    expect(selectCurrentDiceEvents(state)[0]?.presentationId).toBe(
      'presentation~crypt-run~23'
    );
  });

  it('keeps an older pending local attack current over a newer settled witness', () => {
    const pending = createAttackAuthorityFixture({ seq: 22n });
    const witness = createAttackAuthorityFixture({
      seq: 23n,
      attacker: 'skeleton-guard',
    });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      pending.streamFact()
    );
    state = reduceCombatPresentation(state, witness.streamFact());

    expect(selectCurrentPresentation(state)).toMatchObject({
      seq: 22n,
      settlement: 'armed',
    });
    expect(selectCurrentDiceEvents(state)[0]?.presentationId).toBe(
      'presentation~crypt-run~22'
    );
  });

  it('orders Story by authoritative sequence rather than event arrival', () => {
    const earlier = createAttackAuthorityFixture({ seq: 22n, roll: 4 });
    const later = createAttackAuthorityFixture({ seq: 23n, roll: 12 });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      later.streamFact('catchup')
    );
    state = reduceCombatPresentation(state, earlier.streamFact('catchup'));

    expect(selectVisibleStory(state).map((entry) => entry.detail)).toEqual([
      expect.stringContaining('d20 4'),
      expect.stringContaining('d20 12'),
    ]);
  });

  it('does not reconcile a response with an adjacent but different authoritative sequence', () => {
    const response = createAttackAuthorityFixture({ seq: 23n });
    const laterEvent = createAttackAuthorityFixture({ seq: 24n });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      response.responseFact
    );
    state = reduceCombatPresentation(state, laterEvent.streamFact());

    expect(state.presentations).toHaveLength(2);
    expect(requestCount(state)).toBe(2);
    expect(selectVisibleStory(state)).toEqual([]);
  });

  it('uses one identity registry and fails closed when attack and other Story collide in either order', () => {
    const attack = createAttackAuthorityFixture();

    let attackFirst = reduceCombatPresentation(
      emptyPresentation(config),
      attack.responseFact
    );
    attackFirst = reduceCombatPresentation(
      attackFirst,
      downedFact('skeleton-guard')
    );

    let otherFirst = reduceCombatPresentation(
      emptyPresentation(config),
      downedFact('skeleton-guard')
    );
    otherFirst = reduceCombatPresentation(otherFirst, attack.responseFact);

    expectConflictClosed(attackFirst);
    expectConflictClosed(otherFirst);
    expect(attackFirst.presentations).toHaveLength(1);
    expect(attackFirst.otherStory).toHaveLength(0);
    expect(otherFirst.presentations).toHaveLength(0);
    expect(otherFirst.otherStory).toHaveLength(1);
  });

  it('compares exact typed Story facts and marks differing same-key facts conflicted in both orders', () => {
    let firstOrder = reduceCombatPresentation(
      emptyPresentation(config),
      downedFact('skeleton-guard')
    );
    firstOrder = reduceCombatPresentation(firstOrder, downedFact('mira'));

    let mirrorOrder = reduceCombatPresentation(
      emptyPresentation(config),
      downedFact('mira')
    );
    mirrorOrder = reduceCombatPresentation(
      mirrorOrder,
      downedFact('skeleton-guard')
    );

    expectConflictClosed(firstOrder);
    expectConflictClosed(mirrorOrder);
  });

  it('deduplicates an exactly matching typed Story event without a conflict', () => {
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      downedFact('skeleton-guard')
    );
    state = reduceCombatPresentation(state, downedFact('skeleton-guard'));

    expect(state.identities).toHaveLength(1);
    expect(state.identities[0]?.conflicted).toBe(false);
    expect(selectVisibleStory(state)).toHaveLength(1);
  });
});

describe('combat presentation settlement policy', () => {
  it('auto-settles recovered history with a deterministic neutral release that carries no result', () => {
    const facts = createAttackAuthorityFixture();
    const first = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact('catchup')
    );
    const second = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact('catchup')
    );
    const release = first.diceEvents.find(
      (event) => event.type === 'dice-presentation-released'
    );

    expect(requestCount(first)).toBe(1);
    expect(releaseCount(first)).toBe(1);
    expect(selectVisibleStory(first)).toHaveLength(1);
    expect(first.diceEvents).toEqual(second.diceEvents);
    expect(JSON.stringify(release)).not.toContain('authoritativeResult');
    expect(JSON.stringify(release)).not.toMatch(/"result"\s*:/);
    expect(selectLiveAnnouncement(first)).toBeNull();
  });

  it('keeps a currently armed local response armed when its matching copy arrives through catchup', () => {
    const facts = createAttackAuthorityFixture();
    const armed = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    const catchupCopy = reduceCombatPresentation(
      armed,
      facts.streamFact('catchup')
    );

    expect(requestCount(catchupCopy)).toBe(1);
    expect(releaseCount(catchupCopy)).toBe(0);
    expect(catchupCopy.pendingLocalKeys).toEqual([
      catchupCopy.presentations[0]?.key,
    ]);
    expect(selectVisibleStory(catchupCopy)).toEqual([]);
  });

  it('keeps an event-first live local attack pending when an already-accepted catchup duplicate arrives', () => {
    const facts = createAttackAuthorityFixture();
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact('live')
    );
    state = reduceCombatPresentation(state, facts.streamFact('catchup'));

    expect(state.pendingLocalKeys).toEqual([state.presentations[0]?.key]);
    expect(selectCurrentPresentation(state)?.seq).toBe(23n);
    expect(selectCurrentDiceEvents(state)).toHaveLength(1);
    expect(selectVisibleStory(state)).toEqual([]);
  });

  it('runs catchup duplicate settlement for an accepted ordinary spectator record', () => {
    const facts = createAttackAuthorityFixture();
    const noAuthoritativeRole = { ...config, rollerRoles: {} };
    let state = reduceCombatPresentation(
      emptyPresentation(noAuthoritativeRole),
      facts.streamFact('live')
    );
    state = reduceCombatPresentation(state, facts.streamFact('catchup'));

    expect(state.pendingLocalKeys).toEqual([]);
    expect(state.presentations[0]?.settlement).toBe('auto');
    expect(selectVisibleStory(state)).toHaveLength(1);
    expect(selectCurrentDiceEvents(state)).toEqual([]);
  });

  it.each([
    ['other player', 'mira', 'player' as const],
    ['monster', 'skeleton-guard', 'monster' as const],
  ])(
    'auto-settles a live %s witness from typed event facts',
    (_, attacker, role) => {
      const facts = createAttackAuthorityFixture({
        attacker,
        recipient: 'aldric',
      });
      const witnessed = reduceCombatPresentation(
        emptyPresentation(config),
        facts.streamFact()
      );

      expect(requestCount(witnessed)).toBe(1);
      expect(releaseCount(witnessed)).toBe(1);
      expect(requestOf(witnessed).roller.role).toBe(role);
      expect(selectVisibleStory(witnessed)).toHaveLength(1);
      expect(selectLiveAnnouncement(witnessed)).not.toBeNull();
    }
  );

  it('presents multiple local attacks FIFO and never lets newer witness/history hide the oldest pending result', () => {
    const first = createAttackAuthorityFixture({ seq: 23n, roll: 11 });
    const second = createAttackAuthorityFixture({ seq: 24n, roll: 12 });
    const witness = createAttackAuthorityFixture({
      seq: 25n,
      attacker: 'skeleton-guard',
      roll: 13,
    });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      first.streamFact()
    );
    state = reduceCombatPresentation(state, second.streamFact());
    state = reduceCombatPresentation(state, witness.streamFact('catchup'));

    expect(state.pendingLocalKeys).toHaveLength(2);
    expect(selectCurrentPresentation(state)?.seq).toBe(23n);
    expect(selectCurrentDiceEvents(state)[0]?.presentationId).toBe(
      'presentation~crypt-run~23'
    );
    expect(selectVisibleStory(state).map((entry) => entry.id)).toEqual([
      expect.stringContaining(':25'),
    ]);
    expect(selectVisibleResult(state)).toBeUndefined();

    const spoofedLaterRelease = releaseFact({
      ...state,
      pendingLocalKeys: [state.pendingLocalKeys[1]!],
    });
    const afterSpoof = reduceCombatPresentation(state, spoofedLaterRelease);
    expect(afterSpoof.pendingLocalKeys).toEqual(state.pendingLocalKeys);
    expect(afterSpoof.diagnostics.at(-1)).toContain('ineligible release');

    state = reduceCombatPresentation(state, releaseFact(state));
    expect(selectVisibleStory(state).map((entry) => entry.id)).toEqual([
      expect.stringContaining(':23'),
      expect.stringContaining(':25'),
    ]);
    expect(selectCurrentPresentation(state)?.seq).toBe(24n);
    expect(selectVisibleResult(state)).toBeUndefined();

    state = reduceCombatPresentation(state, releaseFact(state));
    expect(state.pendingLocalKeys).toEqual([]);
    expect(selectVisibleStory(state).map((entry) => entry.id)).toEqual([
      expect.stringContaining(':23'),
      expect.stringContaining(':24'),
      expect.stringContaining(':25'),
    ]);
  });

  it('makes missing role data unresolved, then keeps local ownership sticky once public roster authorizes it', () => {
    const facts = createAttackAuthorityFixture();
    const noRole = { ...config, rollerRoles: {} };
    let responseOnly = reduceCombatPresentation(
      emptyPresentation(noRole),
      facts.responseFact
    );

    expect(responseOnly.pendingLocalKeys).toEqual([]);
    expect(responseOnly.diceEvents).toEqual([]);
    expect(responseOnly.presentations[0]?.semanticFallback).toBe(false);
    const firstAuthority = responseOnly.presentations[0]?.authority;

    responseOnly = reduceCombatPresentation(responseOnly, {
      type: 'configure',
      ...config,
    });
    expect(responseOnly.presentations[0]?.authority).toBe(firstAuthority);
    expect(responseOnly.pendingLocalKeys).toEqual([
      responseOnly.presentations[0]?.key,
    ]);
    expect(selectCurrentDiceEvents(responseOnly)).toHaveLength(1);

    responseOnly = reduceCombatPresentation(responseOnly, {
      type: 'configure',
      ...noRole,
    });
    expect(responseOnly.pendingLocalKeys).toEqual([
      responseOnly.presentations[0]?.key,
    ]);
    expect(selectCurrentDiceEvents(responseOnly)).toHaveLength(1);
    expect(responseOnly.presentations[0]?.semanticFallback).toBe(false);
  });

  it('creates and preserves an unresolved unsafe-ID fallback once public roster authorizes it', () => {
    const session = `unsafe-${'x'.repeat(140)}`;
    // The id is the provider's opaque token now, so THAT is what has to be
    // unsafe — a long session no longer leaks into it. Over the 128-byte cap.
    const presentationId = UNSAFE_PRESENTATION_ID;
    const facts = createAttackAuthorityFixture({ session, presentationId });
    const noRole = {
      ...config,
      session,
      rollerRoles: {},
    };
    let state = reduceCombatPresentation(
      emptyPresentation(noRole),
      facts.responseFact
    );
    expect(state.presentations[0]?.semanticFallback).toBe(false);
    expect(state.pendingLocalKeys).toEqual([]);

    state = reduceCombatPresentation(state, {
      type: 'configure',
      ...config,
      session,
    });
    expect(state.presentations[0]?.semanticFallback).toBe(true);
    expect(state.pendingLocalKeys).toEqual([state.presentations[0]?.key]);

    state = reduceCombatPresentation(state, {
      type: 'configure',
      ...noRole,
    });
    expect(state.presentations[0]?.semanticFallback).toBe(true);
    expect(state.pendingLocalKeys).toEqual([state.presentations[0]?.key]);
  });

  it('updates late authoritative names on accepted Story without changing outcome authority', () => {
    const facts = createAttackAuthorityFixture({ attacker: 'skeleton-guard' });
    let state = reduceCombatPresentation(
      emptyPresentation({
        ...config,
        memberNames: {},
      }),
      facts.streamFact()
    );
    const firstAuthority = state.presentations[0]?.authority;
    expect(selectVisibleStory(state)[0]?.headline).toContain('skeleton-guard');

    state = reduceCombatPresentation(state, { type: 'configure', ...config });
    expect(state.presentations[0]?.authority).toBe(firstAuthority);
    expect(selectVisibleStory(state)[0]?.headline).toContain('Skeleton Guard');
  });

  it('keeps a missing-role live event concealed so late public roster can authorize its local release', () => {
    const facts = createAttackAuthorityFixture();
    const noRole = { ...config, rollerRoles: {} };
    let state = reduceCombatPresentation(
      emptyPresentation(noRole),
      facts.streamFact()
    );
    expect(selectVisibleStory(state)).toEqual([]);
    expect(state.presentations[0]?.settlement).toBe('unresolved');

    state = reduceCombatPresentation(state, { type: 'configure', ...config });
    expect(state.pendingLocalKeys).toEqual([state.presentations[0]?.key]);
    expect(state.presentations[0]?.settlement).toBe('armed');
    expect(selectCurrentDiceEvents(state).map((event) => event.type)).toEqual([
      'dice-presentation-requested',
    ]);
    expect(selectVisibleStory(state)).toEqual([]);
  });

  it('keeps release and semantic reveal eligibility after a transient empty roster once local ownership was authoritative', () => {
    const safe = createAttackAuthorityFixture();
    let safeState = reduceCombatPresentation(
      emptyPresentation(config),
      safe.streamFact()
    );
    const staleRelease = releaseFact(safeState);
    const afterMalformed = reduceCombatPresentation(safeState, {
      type: 'local-release',
      event: { ...staleRelease.event, eventId: 'not a valid event id' },
    });
    expect(afterMalformed.pendingLocalKeys).toEqual(safeState.pendingLocalKeys);
    expect(afterMalformed.diagnostics.at(-1)).toContain('malformed');

    safeState = reduceCombatPresentation(safeState, {
      type: 'configure',
      ...config,
      rollerRoles: {},
    });
    const afterRelease = reduceCombatPresentation(safeState, staleRelease);
    expect(afterRelease.presentations[0]?.settlement).toBe('released');
    expect(afterRelease.pendingLocalKeys).toEqual([]);
    expect(releaseCount(afterRelease)).toBe(1);

    const unsafeSession = `unsafe-${'x'.repeat(140)}`;
    const unsafeConfig = { ...config, session: unsafeSession };
    const unsafe = createAttackAuthorityFixture({
      session: unsafeSession,
      presentationId: UNSAFE_PRESENTATION_ID,
    });
    let unsafeState = reduceCombatPresentation(
      emptyPresentation(unsafeConfig),
      unsafe.streamFact()
    );
    const unsafeKey = unsafeState.presentations[0]!.key;
    unsafeState = reduceCombatPresentation(unsafeState, {
      type: 'configure',
      ...unsafeConfig,
      rollerRoles: {},
    });
    const afterSemantic = reduceCombatPresentation(unsafeState, {
      type: 'semantic-release',
      presentationKey: unsafeKey,
    });
    expect(afterSemantic.presentations[0]?.settlement).toBe('released');
    expect(afterSemantic.pendingLocalKeys).toEqual([]);
  });

  it('uses a semantic fallback for an unsafe presentation ID without an early actor reveal or a stall', () => {
    const session = `unsafe-${'x'.repeat(140)}`;
    // The id is the provider's opaque token now, so THAT is what has to be
    // unsafe — a long session no longer leaks into it. Over the 128-byte cap.
    const presentationId = UNSAFE_PRESENTATION_ID;
    const facts = createAttackAuthorityFixture({ session, presentationId });
    const responseFirst = reduceCombatPresentation(
      emptyPresentation({ ...config, session }),
      facts.responseFact
    );

    expect(responseFirst.diceEvents).toEqual([]);
    expect(responseFirst.presentations[0]?.semanticFallback).toBe(true);
    expect(selectVisibleStory(responseFirst)).toEqual([]);

    const eventArrives = reduceCombatPresentation(
      responseFirst,
      facts.streamFact()
    );
    expect(selectVisibleStory(eventArrives)).toEqual([]);

    const released = reduceCombatPresentation(eventArrives, {
      type: 'semantic-release',
      presentationKey: eventArrives.presentations[0]!.key,
    });
    expect(selectVisibleStory(released)).toHaveLength(1);
    expect(selectVisibleResult(released)?.d20).toBe(12);
  });

  it('consumes a semantic release before its event and makes repeated release intent idempotent', () => {
    const session = `unsafe-${'x'.repeat(140)}`;
    // The id is the provider's opaque token now, so THAT is what has to be
    // unsafe — a long session no longer leaks into it. Over the 128-byte cap.
    const presentationId = UNSAFE_PRESENTATION_ID;
    const facts = createAttackAuthorityFixture({ session, presentationId });
    const armed = reduceCombatPresentation(
      emptyPresentation({ ...config, session }),
      facts.responseFact
    );
    const release = {
      type: 'semantic-release' as const,
      presentationKey: armed.presentations[0]!.key,
    };

    const waiting = reduceCombatPresentation(armed, release);
    expect(waiting.presentations[0]).toMatchObject({
      eventAccepted: false,
      settlement: 'released',
      semanticFallback: true,
    });
    expect(waiting.pendingLocalKeys).toEqual([]);
    expect(selectVisibleStory(waiting)).toEqual([]);
    expect(selectVisibleResult(waiting)).toBeUndefined();
    expect(reduceCombatPresentation(waiting, release)).toBe(waiting);

    let revealed = reduceCombatPresentation(waiting, facts.streamFact());
    expect(selectVisibleStory(revealed)).toHaveLength(1);
    expect(selectVisibleResult(revealed)?.d20).toBe(12);

    revealed = reduceCombatPresentation(revealed, facts.streamFact());
    expect(selectVisibleStory(revealed)).toHaveLength(1);
  });
});
