import { create } from '@bufbuild/protobuf';
import {
  DeathSaveRolledSchema,
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DeathSaveContinuation,
  DeathSaveOutcome,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { buildCombatStory } from './story';

function narration(outcome: DeathSaveOutcome) {
  const event = create(EventSchema, {
    session: 'crypt-run',
    seq: 5n,
    kind: EventKind.DEATH_SAVE_ROLLED,
    body: {
      case: 'deathSaveRolled',
      value: create(DeathSaveRolledSchema, {
        actor: 'fighter-1',
        roll: 8,
        outcome,
        successes: 8,
        failures: 6,
        successesNeeded: 7,
        failuresRemaining: 9,
        hpRestored: 4,
        continuation: DeathSaveContinuation.KEEP_TURN,
        presentationId: 'opaque',
      }),
    },
  });
  return buildCombatStory([{ event, source: 'live', visible: true }], {
    viewerMember: 'wizard-1',
    memberNames: { 'fighter-1': 'Aldric' },
  })[0];
}

describe('Death Save table narration', () => {
  it.each([
    [DeathSaveOutcome.SUCCESS, 'Death save! 8 successes — 7 to stabilize.'],
    [DeathSaveOutcome.FAILURE, 'Failure. 6 down — 9 remaining.'],
    [DeathSaveOutcome.CRITICAL_FAILURE, 'Natural 1. Two failures.'],
    [DeathSaveOutcome.RECOVERED, 'Natural 20! Back on your feet with 4 HP.'],
    [DeathSaveOutcome.STABILIZED, '8 successes — stabilized.'],
    [DeathSaveOutcome.DEAD, '6 failures — dead.'],
  ])('branches on typed provider outcome %s', (outcome, headline) => {
    expect(narration(outcome)?.headline).toBe(headline);
  });

  it('does not narrate an unspecified provider outcome', () => {
    expect(narration(DeathSaveOutcome.UNSPECIFIED)).toBeUndefined();
  });
});
