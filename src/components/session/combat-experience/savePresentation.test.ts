// @vitest-environment node
/**
 * The save's d20 reaching the table, from the act that forced it
 * (rpg-project#630). A cast's result carries its target's save; it becomes
 * `kind: 'save'` authority under a recipient-local identity built from the
 * act's own id and place, never anything another client shares.
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  CastOutcome,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';

const member = (id: string) => ({ kind: PartyKind.MEMBER, id });

function configured(session = 'crypt-run'): CombatPresentationState {
  return reduceCombatPresentation(emptyPresentation(), {
    type: 'configure',
    session,
    viewerMember: 'bard-1',
    memberNames: { 'bard-1': 'Lyric', 'skeleton-1': 'Skeleton' },
    rollerRoles: { 'bard-1': 'player', 'skeleton-1': 'monster' },
  });
}

function mockery(session = 'crypt-run', face = 7, total = 9, saved = false) {
  return create(ActSchema, {
    session,
    id: 'id-mock',
    act: 'cast:id-mock',
    verb: 'cast',
    family: Family.ACT,
    body: {
      case: 'cast',
      value: {
        by: member('bard-1'),
        spell: { ref: 'dnd5e:spells:vicious-mockery', name: 'Vicious Mockery' },
        targets: [member('skeleton-1')],
        results: [
          {
            target: member('skeleton-1'),
            outcome: saved ? CastOutcome.SAVED : CastOutcome.FAILED,
            ability: 'wis',
            save: { dice: [face], total, against: 13, beaten: saved },
          },
        ],
      },
    },
  });
}

function accept(
  state: CombatPresentationState,
  act: ReturnType<typeof mockery>,
  source: 'live' | 'catchup' = 'live'
): CombatPresentationState {
  return reduceCombatPresentation(state, {
    type: 'stream-act',
    act,
    index: 0,
    seq: 41n,
    metadata: { source, startIndex: 0 },
  });
}

describe('a saving throw on the table', () => {
  it('rolls a d20 with a recipient-local act identity', () => {
    const state = accept(configured(), mockery());
    const [request] = selectCurrentDiceEvents(state);
    expect(request).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'session:crypt-run:id-mock.0.0',
      authoritySeq: 41n,
      die: { kind: 'd20', authoritativeResult: 7 },
    });
    expect(state.presentations[0]?.authority.roller).toBe('skeleton-1');
  });

  it.each([
    ['empty session', ''],
    ['overlong identifier', `unsafe-${'x'.repeat(140)}`],
  ])('keeps an %s off the physical dice path', (_, session) => {
    const state = accept(configured(session), mockery(session));
    expect(selectCurrentDiceEvents(state)).toEqual([]);
    expect(state.presentations[0]?.authority.presentationId).toBe('');
    expect(state.presentations[0]?.semanticFallback).toBe(true);
  });

  it('records no diagnostic, and never marks the beat conflicted', () => {
    const state = accept(configured(), mockery());
    expect(state.diagnostics).toEqual([]);
    expect(state.presentations.every((record) => !record.conflicted)).toBe(
      true
    );
  });

  it('tells the story in the cast’s one line', () => {
    const story = selectVisibleStory(accept(configured(), mockery()));
    expect(story).toHaveLength(1);
    expect(story[0]?.headline).toBe('Lyric casts Vicious Mockery at Skeleton');
    expect(story[0]?.detail).toBe('Skeleton failed the save, 9 vs 13');
  });

  it('settles a monster’s save on its own, as a monster’s attack does', () => {
    const record = accept(configured(), mockery()).presentations[0];
    expect(record?.settlement).toBe('auto');
    expect(record?.localPlayerOwned).toBe(false);
  });

  it('accepts the same act twice without conflicting', () => {
    const once = accept(configured(), mockery());
    const twice = accept(once, mockery(), 'catchup');
    expect(twice.diagnostics).toEqual([]);
    expect(twice.presentations).toHaveLength(1);
    expect(twice.presentations[0]?.conflicted).toBe(false);
  });

  it('refuses two different saves that claim the same act', () => {
    const first = accept(configured(), mockery());
    const state = accept(first, mockery('crypt-run', 18, 20, true));
    expect(state.presentations[0]?.conflicted).toBe(true);
  });
});
