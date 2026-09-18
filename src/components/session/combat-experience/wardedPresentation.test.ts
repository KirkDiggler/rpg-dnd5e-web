// @vitest-environment node
/**
 * A Sanctuary-style ward's own d20 reaching the table.
 *
 * `warded`/`castWarded` share `saved`'s carve-out (see presentation.ts's own
 * comment on `authorityFromEvent`): the beat IS the blocked attacker's or
 * caster's own failed save against the warding caster's DC, so it becomes
 * `kind: 'save'` authority the same way, under the same recipient-local
 * `session:seq` identity `savePresentation.test.ts` already covers for
 * `saved`.
 */
import { create } from '@bufbuild/protobuf';
import {
  CastWardedSchema,
  EventKind,
  EventSchema,
  WardedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';

function configured(session = 'crypt-run'): CombatPresentationState {
  return reduceCombatPresentation(emptyPresentation(), {
    type: 'configure',
    session,
    viewerMember: 'fighter-1',
    memberNames: { 'fighter-1': 'Vex', 'cleric-1': 'Alder' },
    rollerRoles: { 'fighter-1': 'player', 'cleric-1': 'player' },
  });
}

function wardedEvent(seq = 50n, session = 'crypt-run') {
  return create(EventSchema, {
    session,
    seq,
    at: 20n,
    recipient: 'fighter-1',
    kind: EventKind.WARDED,
    body: {
      case: 'warded',
      value: create(WardedSchema, {
        attacker: 'fighter-1',
        target: 'cleric-1',
        source: 'cleric-1',
        ability: 'wis',
        roll: 8,
        total: 10,
        dc: 15,
      }),
    },
  });
}

function castWardedEvent(seq = 51n, session = 'crypt-run') {
  return create(EventSchema, {
    session,
    seq,
    at: 21n,
    recipient: 'fighter-1',
    kind: EventKind.CAST_WARDED,
    body: {
      case: 'castWarded',
      value: create(CastWardedSchema, {
        actor: 'fighter-1',
        target: 'cleric-1',
        source: 'cleric-1',
        ability: 'wis',
        roll: 8,
        total: 10,
        dc: 15,
      }),
    },
  });
}

function accept(
  state: CombatPresentationState,
  event: ReturnType<typeof wardedEvent>,
  source: 'live' | 'catchup' = 'live'
): CombatPresentationState {
  return reduceCombatPresentation(state, {
    type: 'stream-event',
    event,
    metadata: { source },
  });
}

describe('a warded attack on the table', () => {
  it('rolls the attacker’s own save with a recipient-local identity', () => {
    const state = accept(configured(), wardedEvent());

    const [request] = selectCurrentDiceEvents(state);
    expect(request).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'session:crypt-run:50',
      authoritySeq: 50n,
      die: { kind: 'd20', authoritativeResult: 8 },
    });
  });

  it('never marks the beat conflicted', () => {
    const state = accept(configured(), wardedEvent());

    expect(state.diagnostics).toEqual([]);
    expect(state.presentations.every((record) => !record.conflicted)).toBe(
      true
    );
  });

  it('tells the story beside the roll', () => {
    const story = selectVisibleStory(accept(configured(), wardedEvent()));

    expect(story).toHaveLength(1);
    expect(story[0]?.headline).toBe("Alder's ward blocks Vex's attack");
  });

  it('arms the local player’s own die, as their own save would', () => {
    const state = accept(configured(), wardedEvent());

    // fighter-1 is both the viewer and the one whose save this is — the
    // same ownership rule an ordinary `saved` beat already gets.
    const record = state.presentations[0];
    expect(record?.localPlayerOwned).toBe(true);
  });
});

describe('a warded cast on the table', () => {
  it('rolls the caster’s own save the same way', () => {
    const state = accept(configured(), castWardedEvent());

    const [request] = selectCurrentDiceEvents(state);
    expect(request).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'session:crypt-run:51',
      die: { kind: 'd20', authoritativeResult: 8 },
    });
  });
});
