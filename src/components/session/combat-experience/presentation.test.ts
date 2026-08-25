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
import { createAttackAuthorityFixture } from './presentation.test-fixtures';

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
  expect(selectCurrentPresentation(state)).toBeUndefined();
}

describe('combat presentation authority reconciliation', () => {
  it('response first arms once and hides Story, verdict, and live result until release', () => {
    const facts = createAttackAuthorityFixture();
    const armed = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    const reconciled = reduceCombatPresentation(armed, facts.streamFact());

    expect(requestCount(reconciled)).toBe(1);
    expect(requestOf(reconciled)).toMatchObject({
      presentationId: 'session:crypt-run:23',
      roller: { entityId: 'aldric', role: 'player' },
      die: {
        presetId: 'dice.original.carved.d20',
        authoritativeResult: 12,
      },
    });
    expect(selectVisibleStory(reconciled)).toEqual([]);
    expect(selectVisibleResult(reconciled)).toBeUndefined();
    expect(selectLiveAnnouncement(reconciled)).toBeNull();
    expect(reconciled.debug[0]).toContain('struck');

    const released = reduceCombatPresentation(
      reconciled,
      releaseFact(reconciled)
    );
    expect(selectVisibleStory(released)).toHaveLength(1);
    expect(selectVisibleResult(released)?.d20).toBe(12);
    expect(selectLiveAnnouncement(released)).toContain('Aldric');
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
      'session:crypt-run:23'
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

  it('makes missing role data spectator-safe and creates/removes unresolved controls on configure', () => {
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
    expect(responseOnly.pendingLocalKeys).toEqual([]);
    expect(selectCurrentDiceEvents(responseOnly)).toEqual([]);
    expect(responseOnly.presentations[0]?.semanticFallback).toBe(false);
  });

  it('creates and removes an unresolved unsafe-ID fallback as role facts become known', () => {
    const session = `unsafe-${'x'.repeat(140)}`;
    const facts = createAttackAuthorityFixture({ session });
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
    expect(state.presentations[0]?.semanticFallback).toBe(false);
    expect(state.pendingLocalKeys).toEqual([]);
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

  it('keeps a late-authorized player event settled after spectator fallback already revealed it', () => {
    const facts = createAttackAuthorityFixture();
    const noRole = { ...config, rollerRoles: {} };
    let state = reduceCombatPresentation(
      emptyPresentation(noRole),
      facts.streamFact()
    );
    expect(selectVisibleStory(state)).toHaveLength(1);

    state = reduceCombatPresentation(state, { type: 'configure', ...config });
    expect(state.pendingLocalKeys).toEqual([]);
    expect(state.presentations[0]?.settlement).toBe('auto');
    expect(selectCurrentDiceEvents(state).map((event) => event.type)).toEqual([
      'dice-presentation-requested',
      'dice-presentation-released',
    ]);
    expect(selectVisibleStory(state)).toHaveLength(1);
  });

  it('ignores release and semantic reveal attempts after authoritative player eligibility is removed', () => {
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
    expect(afterRelease.diagnostics.at(-1)).toContain('ineligible release');
    expect(afterRelease.diceEvents).toEqual([]);

    const unsafeSession = `unsafe-${'x'.repeat(140)}`;
    const unsafeConfig = { ...config, session: unsafeSession };
    const unsafe = createAttackAuthorityFixture({ session: unsafeSession });
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
    expect(afterSemantic.diagnostics.at(-1)).toContain(
      'ineligible semantic release'
    );
  });

  it('uses a semantic fallback for an unsafe presentation ID without an early actor reveal or a stall', () => {
    const session = `unsafe-${'x'.repeat(140)}`;
    const facts = createAttackAuthorityFixture({ session });
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
});
