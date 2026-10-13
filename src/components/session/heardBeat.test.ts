import { describe, expect, it } from 'vitest';
import {
  compassFrom,
  formatHeardLine,
  heardSentence,
  soundPhrase,
} from './heardBeat';

describe('heardBeat (rpg-project#569)', () => {
  it('reads the four sealed kinds as phrases and an unknown kind as its own word', () => {
    expect(soundPhrase('clang')).toBe('metal clanging');
    expect(soundPhrase('boom')).toBe('a boom');
    expect(soundPhrase('voice')).toBe('a voice');
    expect(soundPhrase('crash')).toBe('a crash');
    expect(soundPhrase('growl')).toBe('growl');
  });

  it('gives a compass word on the board’s own geometry — north is screen-up', () => {
    const at = { x: 0, y: 0 };
    // Each target is chosen so its world bearing sits squarely in a sector of
    // the pointy-top layout (+X east, +Z south).
    expect(compassFrom(at, { x: 2, y: 0 })).toBe('east');
    expect(compassFrom(at, { x: -2, y: 0 })).toBe('west');
    expect(compassFrom(at, { x: 1, y: -2 })).toBe('north');
    expect(compassFrom(at, { x: -1, y: 2 })).toBe('south');
    expect(compassFrom(at, { x: 2, y: -2 })).toBe('northeast');
    expect(compassFrom(at, { x: -1, y: -1 })).toBe('northwest');
    expect(compassFrom(at, { x: 1, y: 1 })).toBe('southeast');
    expect(compassFrom(at, { x: -2, y: 2 })).toBe('southwest');
    expect(compassFrom(at, at)).toBeUndefined();
  });

  it('says rooms only when the sound crossed some, and "right here" only on the same cell and room', () => {
    const position = { x: 1, y: -2 };
    expect(
      heardSentence({ kind: 'clang', position, hops: 2 } as never, {
        x: 0,
        y: 0,
      })
    ).toBe('You hear metal clanging, to the north, 2 rooms away.');
    expect(
      heardSentence({ kind: 'boom', position, hops: 0 } as never, {
        x: 0,
        y: 0,
      })
    ).toBe('You hear a boom, to the north.');
    expect(
      heardSentence({ kind: 'voice', position, hops: 0 } as never, position)
    ).toBe('You hear a voice, right here.');
    // The same cell across a region boundary is not "right here".
    expect(
      formatHeardLine({ kind: 'voice', position, hops: 1 } as never, position)
        .headline
    ).toBe('You hear a voice');
  });
});
