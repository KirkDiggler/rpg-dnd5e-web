/**
 * WHAT THE LOG SAYS WHEN A HELD SPELL LETS GO.
 *
 * The `concentrationEnded` arm on the Story switch is added BY HAND: that
 * switch is not exhaustiveness-enforced — its declared return type includes
 * `undefined`, there is no `assertNever`, and `noImplicitReturns` is off — so
 * a missing arm compiles clean and the beat simply never renders (design
 * rpg-project#407, web assumption 1). These tests are the only thing that
 * fails when the arm is gone.
 */
import { create } from '@bufbuild/protobuf';
import {
  ConcentrationEndedSchema,
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { SpellRefSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectVisibleStory,
} from './presentation';
import { buildCombatStory, type CombatStoryFact } from './story';

const context = {
  viewerMember: 'bard-1',
  memberNames: {
    'bard-1': 'Lyric',
    'skeleton-1': 'Skeleton',
  },
};

function visible(event: CombatStoryFact['event']): CombatStoryFact {
  return { event, source: 'live', visible: true };
}

function endedEvent({
  reason = 'damage',
  withSpell = true,
  kind = EventKind.CONCENTRATION_ENDED,
}: {
  reason?: string;
  withSpell?: boolean;
  kind?: EventKind;
} = {}) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq: 51n,
    at: 20n,
    recipient: 'bard-1',
    kind,
    body: {
      case: 'concentrationEnded',
      value: create(ConcentrationEndedSchema, {
        caster: 'bard-1',
        reason,
        ...(withSpell
          ? {
              spell: create(SpellRefSchema, {
                ref: 'dnd5e:spells:true-strike',
                name: 'True Strike',
              }),
            }
          : {}),
      }),
    },
  });
}

describe('the concentration-ended beat', () => {
  it('names the caster, the spell the server authored, and why it broke', () => {
    const [entry] = buildCombatStory([visible(endedEvent())], context);

    expect(entry?.eyebrow).toBe('Concentration');
    expect(entry?.headline).toBe('Lyric loses concentration on True Strike');
    expect(entry?.detail).toBe('the hit broke it.');
    expect(entry?.tone).toBe('danger');
  });

  it('phrases every reason the rulebook uses today', () => {
    const phrased = (reason: string) =>
      buildCombatStory([visible(endedEvent({ reason }))], context)[0]?.detail;

    expect(phrased('recast')).toBe(
      'another concentration spell took its place.'
    );
    expect(phrased('duration')).toBe('it ran out.');
    expect(phrased('combat_end')).toBe('the fight ended.');
    expect(phrased('spell_ended')).toBe('the spell was already spent.');
    expect(phrased('caster_down')).toBe('the caster went down.');
    expect(phrased('long rest')).toBe('a long rest.');
  });

  it('still shows a reason nobody has phrased yet, rather than hiding it', () => {
    // `reason` is an OPEN STRING, not a wire contract (R10). A reason this
    // client has never seen has to reach the log anyway, or the day the
    // rulebook grows a seventh the break reads as having no cause at all.
    const [entry] = buildCombatStory(
      [visible(endedEvent({ reason: 'dispel_magic' }))],
      context
    );

    expect(entry?.detail).toBe('dispel magic.');
  });

  it('narrates a break the server did not name a spell for', () => {
    const [entry] = buildCombatStory(
      [visible(endedEvent({ withSpell: false }))],
      context
    );

    expect(entry?.headline).toBe('Lyric loses concentration');
  });

  it('refuses a body whose kind disagrees with it', () => {
    // The same kind re-check every other arm makes: a beat that arrived as
    // EVENT_KIND_UNKNOWN with a populated body is a demoted mapping upstream,
    // and the client renders nothing rather than a sentence it cannot trust.
    const [entry] = buildCombatStory(
      [visible(endedEvent({ kind: EventKind.UNSPECIFIED }))],
      context
    );

    expect(entry).toBeUndefined();
  });
});

describe('the break beat surviving the reducer', () => {
  /**
   * THE GAP SLICE TWO FELL INTO, CLOSED AHEAD OF THE WALK. A body with no row
   * in `EXPECTED_OTHER_KIND` is not a compile error — `relevantOtherEvent`
   * discards it as a "typed event kind/body mismatch" and the beat is gone
   * before any story arm runs. The unit tests above pass in that world; only
   * this one does not.
   */
  function configured() {
    return reduceCombatPresentation(emptyPresentation(), {
      type: 'configure',
      session: 'crypt-run',
      viewerMember: 'bard-1',
      memberNames: { 'bard-1': 'Lyric', 'skeleton-1': 'Skeleton' },
      rollerRoles: { 'bard-1': 'player', 'skeleton-1': 'monster' },
    });
  }

  it('reaches the log through the real stream path, not just the builder', () => {
    const state = reduceCombatPresentation(configured(), {
      type: 'stream-event',
      event: endedEvent(),
      metadata: { source: 'live' },
    });

    const story = selectVisibleStory(state);

    expect(story).toHaveLength(1);
    expect(story[0]?.headline).toBe('Lyric loses concentration on True Strike');
    expect(story[0]?.detail).toBe('the hit broke it.');
  });
});
