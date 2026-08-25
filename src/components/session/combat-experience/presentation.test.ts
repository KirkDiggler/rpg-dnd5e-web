import type {
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectLiveAnnouncement,
  selectVisibleResult,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';

const config = {
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
  const request = requestOf(state);
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

  it('keeps the first accepted roller, result, and AttackRef when a conflicting duplicate arrives', () => {
    const accepted = createAttackAuthorityFixture();
    const conflict = createAttackAuthorityFixture({
      attacker: 'mira',
      roll: 4,
      total: 9,
      hit: false,
      damage: 0,
      attackRef: 'dnd5e:weapons:dagger',
      attackName: 'Dagger',
    });
    let state = reduceCombatPresentation(
      emptyPresentation(config),
      accepted.streamFact()
    );
    state = reduceCombatPresentation(state, conflict.streamFact());
    state = reduceCombatPresentation(state, releaseFact(state));

    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0]).toContain('conflicting authority');
    expect(selectVisibleResult(state)).toMatchObject({
      actor: 'Aldric',
      d20: 12,
      hit: true,
      attackRef: 'dnd5e:weapons:longsword',
    });
    expect(selectVisibleResult(state)?.d20).not.toBe(4);
  });

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
    expect(selectVisibleStory(catchupCopy)).toEqual([]);
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

  it('uses a semantic fallback for an unsafe presentation ID without an early actor reveal or a stall', () => {
    const facts = createAttackAuthorityFixture({
      session: `unsafe-${'x'.repeat(140)}`,
    });
    const responseFirst = reduceCombatPresentation(
      emptyPresentation(config),
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
