/**
 * The save's d20 reaching the table.
 *
 * THE GAP THIS CLOSES. Before the save had a fact category of its own, a
 * `SAVED` beat had nowhere to go: it is not an attack, so it never became
 * authority, and its body was not in the other-story table, so
 * `relevantOtherEvent` returned undefined and the beat was discarded as a
 * "typed event kind/body mismatch". Nothing rolled and nothing was logged.
 * Giving it a `'save'` kind is what makes the identity and the authority agree
 * (design rpg-project#405, folded presentation gap).
 */
import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  SavedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { SpellRefSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';

function configured(): CombatPresentationState {
  return reduceCombatPresentation(emptyPresentation(), {
    type: 'configure',
    session: 'crypt-run',
    viewerMember: 'bard-1',
    memberNames: { 'bard-1': 'Lyric', 'skeleton-1': 'Skeleton' },
    rollerRoles: { 'bard-1': 'player', 'skeleton-1': 'monster' },
  });
}

function savedEvent(seq = 41n) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 11n,
    recipient: 'bard-1',
    kind: EventKind.SAVED,
    body: {
      case: 'saved',
      value: create(SavedSchema, {
        saver: 'skeleton-1',
        ability: 'wis',
        roll: 7,
        total: 9,
        dc: 13,
        succeeded: false,
        source: create(SpellRefSchema, {
          ref: 'dnd5e:spells:vicious-mockery',
          name: 'Vicious Mockery',
        }),
      }),
    },
  });
}

function accept(
  state: CombatPresentationState,
  event: ReturnType<typeof savedEvent>,
  source: 'live' | 'catchup' = 'live'
): CombatPresentationState {
  return reduceCombatPresentation(state, {
    type: 'stream-event',
    event,
    metadata: { source },
  });
}

describe('a saving throw on the table', () => {
  it('rolls a d20 with the authoritative face', () => {
    const state = accept(configured(), savedEvent());

    const [request] = selectCurrentDiceEvents(state);
    expect(request?.type).toBe('dice-presentation-requested');
    expect(request && 'die' in request ? request.die.kind : undefined).toBe(
      'd20'
    );
    expect(
      request && 'die' in request ? request.die.authoritativeResult : undefined
    ).toBe(7);
  });

  it('records no diagnostic, and never marks the beat conflicted', () => {
    const state = accept(configured(), savedEvent());

    // THE WARNING THIS EXISTS TO PREVENT. A save registering as typed Story
    // while its d20 wanted authority is exactly the "dice response conflicts
    // with typed Story" refusal, and a conflicted record draws no dice.
    expect(state.diagnostics).toEqual([]);
    expect(state.presentations.every((record) => !record.conflicted)).toBe(
      true
    );
  });

  it('tells the story beside the roll', () => {
    const story = selectVisibleStory(accept(configured(), savedEvent()));

    expect(story).toHaveLength(1);
    expect(story[0]?.headline).toBe('Skeleton saves vs Vicious Mockery');
  });

  it('settles a monster’s save on its own, as a monster’s attack does', () => {
    const state = accept(configured(), savedEvent());

    // The skeleton is not the local player, so nothing waits on the viewer's
    // dice: the roll is shown and the record settles.
    const record = state.presentations[0];
    expect(record?.settlement).toBe('auto');
    expect(record?.localPlayerOwned).toBe(false);
  });

  it('accepts the same save twice without conflicting', () => {
    // A reconnect replays the beat. Identical facts under the same key are
    // the same beat, not a contradiction.
    const once = accept(configured(), savedEvent());
    const twice = accept(once, savedEvent(), 'catchup');

    expect(twice.diagnostics).toEqual([]);
    expect(twice.presentations).toHaveLength(1);
    expect(twice.presentations[0]?.conflicted).toBe(false);
  });

  it('refuses two different saves that claim the same beat', () => {
    const first = accept(configured(), savedEvent());
    const contradicting = savedEvent();
    contradicting.body = {
      case: 'saved',
      value: create(SavedSchema, {
        saver: 'skeleton-1',
        ability: 'wis',
        roll: 18,
        total: 20,
        dc: 13,
        succeeded: true,
      }),
    };

    const state = accept(first, contradicting);

    expect(state.presentations[0]?.conflicted).toBe(true);
  });
});
