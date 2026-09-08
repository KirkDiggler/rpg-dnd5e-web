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
  ActivationResultSchema,
  CastSchema,
  ConcentrationEndedSchema,
  ConditionRemovedSchema,
  EventKind,
  EventSchema,
  SavedSchema,
  StruckSchema,
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

/**
 * THE RUN KIRK WALKED, END TO END.
 *
 * A skeleton hits the bard, the bard rolls a Constitution check to hold True
 * Strike, the check fails, the spell ends and its condition comes off. The
 * story showed the strike and then the break WITH NO CHECK BETWEEN — the one
 * card that says why the spell ended was missing, and the fade read "staniel
 * is no longer True Strike".
 */
describe('the whole break, as the story tells it', () => {
  const trueStrike = () =>
    create(SpellRefSchema, {
      ref: 'dnd5e:spells:true-strike',
      name: 'True Strike',
    });

  function configured() {
    return reduceCombatPresentation(emptyPresentation(), {
      type: 'configure',
      session: 'walk',
      viewerMember: 'staniel',
      memberNames: { staniel: 'staniel', 'skeleton-1': 'Skeleton' },
      // THE BARD IS THE LOCAL PLAYER, which is the whole reason the check
      // went missing: a roll attributed to the viewer was held for a dice
      // tray nothing ever arms for a save.
      rollerRoles: { staniel: 'player', 'skeleton-1': 'monster' },
    });
  }

  function feed(
    state: ReturnType<typeof configured>,
    event: ReturnType<typeof castBeat>
  ) {
    return reduceCombatPresentation(state, {
      type: 'stream-event',
      event,
      metadata: { source: 'live' as const },
    });
  }

  function castBeat() {
    return create(EventSchema, {
      session: 'walk',
      seq: 9n,
      at: 0n,
      recipient: 'staniel',
      kind: EventKind.CAST,
      body: {
        case: 'cast',
        value: create(CastSchema, {
          actor: 'staniel',
          spell: trueStrike(),
          target: 'skeleton-1',
        }),
      },
    });
  }

  function struckBeat() {
    return create(EventSchema, {
      session: 'walk',
      seq: 10n,
      at: 1n,
      recipient: 'staniel',
      kind: EventKind.STRUCK,
      body: {
        case: 'struck',
        value: create(StruckSchema, {
          attacker: 'skeleton-1',
          target: 'staniel',
          roll: 15,
          total: 17,
          against: 13,
          damage: 7,
          presentationId: 'p-strike-1',
        }),
      },
    });
  }

  function checkBeat({ succeeded = false, roll = 4, total = 5 } = {}) {
    return create(EventSchema, {
      session: 'walk',
      seq: 11n,
      at: 2n,
      recipient: 'staniel',
      kind: EventKind.SAVED,
      body: {
        case: 'saved',
        value: create(SavedSchema, {
          saver: 'staniel',
          ability: 'con',
          roll,
          total,
          dc: 10,
          succeeded,
          source: trueStrike(),
        }),
      },
    });
  }

  function brokeBeat() {
    return create(EventSchema, {
      session: 'walk',
      seq: 12n,
      at: 3n,
      recipient: 'staniel',
      kind: EventKind.CONCENTRATION_ENDED,
      body: {
        case: 'concentrationEnded',
        value: create(ConcentrationEndedSchema, {
          caster: 'staniel',
          spell: trueStrike(),
          reason: 'damage',
        }),
      },
    });
  }

  function fadeBeat(name = 'True Strike', reason = 'damage') {
    return create(EventSchema, {
      session: 'walk',
      seq: 13n,
      at: 4n,
      recipient: 'staniel',
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'staniel',
          result: {
            case: 'conditionRemoved',
            value: create(ConditionRemovedSchema, {
              target: 'staniel',
              ref: 'dnd5e:conditions:true_strike',
              name,
              reason,
            }),
          },
        }),
      },
    });
  }

  function run(beats: ReturnType<typeof castBeat>[]) {
    return selectVisibleStory(beats.reduce(feed, configured()));
  }

  it('reads as four cards in order after the cast: strike, check, break, fade', () => {
    const story = run([
      castBeat(),
      struckBeat(),
      checkBeat(),
      brokeBeat(),
      fadeBeat(),
    ]);

    expect(story.map((card) => card.headline)).toEqual([
      'staniel casts True Strike',
      'Skeleton strikes staniel',
      'staniel loses their grip on True Strike',
      'staniel loses concentration on True Strike',
      'True Strike fades from staniel',
    ]);
  });

  it('shows the check’s arithmetic, which is the whole reason it is a card', () => {
    const [, , check] = run([castBeat(), struckBeat(), checkBeat()]);

    expect(check?.eyebrow).toBe('staniel · Concentration check');
    expect(check?.detail).toBe('d20 4 + 1 = 5 against DC 10 · Failed');
    expect(check?.tone).toBe('danger');
  });

  it('ends the run at the made check, and says the spell held', () => {
    // NOTHING FOLLOWS A SUCCESS. The check is the last card, so if it does not
    // render the player is never told the roll happened at all.
    const story = run([
      castBeat(),
      struckBeat(),
      checkBeat({ succeeded: true, roll: 14, total: 15 }),
    ]);

    expect(story.map((card) => card.headline)).toEqual([
      'staniel casts True Strike',
      'Skeleton strikes staniel',
      'staniel holds True Strike',
    ]);
    expect(story[2]?.detail).toBe('d20 14 + 1 = 15 against DC 10 · Succeeded');
    expect(story[2]?.tone).toBe('success');
  });

  it('leaves a target’s save against a spell worded exactly as it was', () => {
    // The saver did not cast this spell, so it is being used against them.
    // Slice two's card, unchanged.
    const cast = castBeat();
    cast.body = {
      case: 'cast',
      value: create(CastSchema, {
        actor: 'staniel',
        spell: create(SpellRefSchema, {
          ref: 'dnd5e:spells:vicious-mockery',
          name: 'Vicious Mockery',
        }),
        target: 'skeleton-1',
      }),
    };
    const save = checkBeat();
    save.body = {
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
    };

    const [, card] = run([cast, save]);

    expect(card?.eyebrow).toBe('Skeleton · Vicious Mockery');
    expect(card?.headline).toBe('Skeleton saves vs Vicious Mockery');
  });

  it('says a plain save plainly when this run never watched the cast', () => {
    // THE WIRE CANNOT TELL THESE APART. `Saved` carries the same six fields
    // for a concentration check and for a target's save, so the log reads the
    // difference off a cast it witnessed. With no cast in the window the card
    // falls back to the weaker sentence rather than asserting a hold it
    // cannot support.
    const [, card] = run([struckBeat(), checkBeat()]);

    expect(card?.headline).toBe('staniel saves vs True Strike');
  });

  it('leaves a condition no spell was cast for on the generic template', () => {
    // Raging is a class feature, not a spell's residue. Its removal keeps the
    // wording it has always had.
    const story = run([fadeBeat('Raging', 'duration')]);

    expect(story[0]?.headline).toBe('staniel is no longer Raging');
    expect(story[0]?.detail).toBe('duration');
  });

  it('phrases the fade’s reason the way the break line phrases it', () => {
    const story = run([castBeat(), fadeBeat('True Strike', 'damage')]);

    expect(story[1]?.headline).toBe('True Strike fades from staniel');
    expect(story[1]?.detail).toBe('the hit broke it');
  });
});
