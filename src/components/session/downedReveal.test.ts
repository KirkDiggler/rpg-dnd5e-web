/**
 * The reveal order bug: a monster hit the floor while the d20 that felled it
 * was still tumbling, because `struck`/`downed` both refresh 'view' the
 * instant they arrive while only the Story projection was paced.
 *
 * These tests pin both halves — the pure hold, and the selector that decides
 * who is held — including the case that matters most: the hold must END.
 */
import type {
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectUnresolvedAttackTargets,
  selectVisibleResult,
  type CombatPresentationFact,
  type CombatPresentationState,
} from './combat-experience/presentation';
import { createAttackAuthorityFixture } from './combat-experience/presentation.test-fixtures';
import { holdDownedReveal } from './downedReveal';
import type { SightedMember } from './sightingEntities';

const config = {
  session: 'crypt-run',
  viewerMember: 'aldric',
  memberNames: { aldric: 'Aldric', 'skeleton-guard': 'Skeleton Guard' },
  rollerRoles: {
    aldric: 'player' as const,
    'skeleton-guard': 'monster' as const,
  },
};

/** Mirrors presentation.test.ts's own helper — a real release, built the way
 * the dice layer builds one, not a hand-shaped stub the reducer would
 * silently reject as ineligible. */
function releaseFact(state: CombatPresentationState): CombatPresentationFact {
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
  return { type: 'local-release', event };
}

function member(
  subject: string,
  standing: Standing = Standing.UP
): SightedMember {
  return {
    subject,
    name: subject,
    kind: MemberKind.MONSTER,
    monsterRefId: 'skeleton',
    position: { x: 0, y: 0, z: 0 },
    remembered: false,
    standing,
  };
}

describe('holdDownedReveal', () => {
  it('re-stands a downed subject whose roll has not been revealed', () => {
    const entities = [member('skeleton-guard', Standing.DOWNED)];
    const held = holdDownedReveal(entities, new Set(['skeleton-guard']));
    expect(held[0]?.standing).toBe(Standing.UP);
  });

  it('leaves a downed subject alone once nothing is unresolved', () => {
    const entities = [member('skeleton-guard', Standing.DOWNED)];
    expect(holdDownedReveal(entities, new Set())).toBe(entities);
  });

  it('holds only the unresolved subject, not every downed monster on the map', () => {
    const entities = [
      member('skeleton-guard', Standing.DOWNED),
      member('skeleton-archer', Standing.DOWNED),
    ];
    const held = holdDownedReveal(entities, new Set(['skeleton-guard']));
    expect(held[0]?.standing).toBe(Standing.UP);
    expect(held[1]?.standing).toBe(Standing.DOWNED);
  });

  it('never marks anyone downed — the hold only runs one direction', () => {
    // An UP subject that happens to be the target of an unresolved attack
    // must not be pre-emptively felled by the client.
    const entities = [member('skeleton-guard', Standing.UP)];
    const held = holdDownedReveal(entities, new Set(['skeleton-guard']));
    expect(held[0]?.standing).toBe(Standing.UP);
    expect(held).toBe(entities);
  });

  it('returns the same array when no entity actually changed', () => {
    // Referential stability matters: this feeds a memo that drives the canvas.
    const entities = [member('skeleton-guard', Standing.UP)];
    expect(holdDownedReveal(entities, new Set(['someone-else']))).toBe(
      entities
    );
  });
});

describe('selectUnresolvedAttackTargets', () => {
  it("holds the player's own live target until the dice release, then lets go", () => {
    const facts = createAttackAuthorityFixture();

    const armed = reduceCombatPresentation(
      emptyPresentation(config),
      facts.responseFact
    );
    const reconciled = reduceCombatPresentation(armed, facts.streamFact());

    // The roll has NOT been shown yet — the Story result is still hidden,
    // and the target is held. These two must agree; that is the whole point
    // of reusing isVisible rather than inventing a second rule.
    expect(selectVisibleResult(reconciled)).toBeUndefined();
    expect([...selectUnresolvedAttackTargets(reconciled)]).toEqual([
      'skeleton-guard',
    ]);

    const released = reduceCombatPresentation(
      reconciled,
      releaseFact(reconciled)
    );

    expect(selectVisibleResult(released)?.d20).toBe(12);
    expect(selectUnresolvedAttackTargets(released).size).toBe(0);
  });

  it('never holds a catch-up record, which settles auto and is visible at once', () => {
    const facts = createAttackAuthorityFixture();
    const historical = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact('catchup')
    );
    expect(selectUnresolvedAttackTargets(historical).size).toBe(0);
  });

  it("never holds a monster's attack on the player", () => {
    const facts = createAttackAuthorityFixture({
      attacker: 'skeleton-guard',
      target: 'aldric',
    });
    const state = reduceCombatPresentation(
      emptyPresentation(config),
      facts.streamFact()
    );
    expect(selectUnresolvedAttackTargets(state).size).toBe(0);
  });
});
