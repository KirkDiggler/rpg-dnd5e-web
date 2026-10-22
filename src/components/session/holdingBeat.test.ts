// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  authoredWords,
  exitCarrierFromAct,
  holdingPhrase,
} from './holdingBeat';

function exited(
  member: string,
  init: { exit?: string; holding?: string[] } = {}
) {
  return create(ActSchema, {
    family: Family.CLOCK,
    body: {
      case: 'clock',
      value: {
        mark: ClockMark.EXITED,
        departure: {
          member: { kind: PartyKind.MEMBER, id: member },
          exit: init.exit ?? '',
          holding: init.holding ?? [],
        },
      },
    },
  });
}

describe('authoredWords / holdingPhrase', () => {
  it('spaces the author’s own separators and nothing else', () => {
    expect(authoredWords('heirloom')).toBe('heirloom');
    expect(authoredWords('vault-key')).toBe('vault key');
    expect(authoredWords('front_gate')).toBe('front gate');
    expect(authoredWords('')).toBe('');
  });

  it('reads a list of holdings as English', () => {
    expect(holdingPhrase([])).toBe('');
    expect(holdingPhrase(['heirloom'])).toBe('the heirloom');
    expect(holdingPhrase(['heirloom', 'crown'])).toBe(
      'the heirloom and the crown'
    );
    expect(holdingPhrase(['a', 'b', 'c'])).toBe('the a, the b and the c');
  });
});

describe('exitCarrierFromAct — who the ending overlay may name', () => {
  it('names a departure through an authored exit while holding', () => {
    expect(
      exitCarrierFromAct(
        exited('m1', { exit: 'entrance', holding: ['heirloom'] })
      )
    ).toEqual({ member: 'm1', exit: 'entrance', holding: ['heirloom'] });
  });

  it('is null for a departure carrying nothing — that ends nobody’s run', () => {
    expect(exitCarrierFromAct(exited('m1', { exit: 'entrance' }))).toBeNull();
  });

  it('is null for a departure from elsewhere — that one DROPS what it held (R9)', () => {
    expect(
      exitCarrierFromAct(exited('m1', { holding: ['heirloom'] }))
    ).toBeNull();
  });

  it('is null for any other clock entry', () => {
    const turn = create(ActSchema, {
      family: Family.CLOCK,
      body: { case: 'clock', value: { mark: ClockMark.TURN_ENDED } },
    });
    expect(exitCarrierFromAct(turn)).toBeNull();
  });
});
