import { describe, expect, it } from 'vitest';
import { lineRefusals } from './rowRefusals';

describe('lineRefusals (R34)', () => {
  const line = 'room.room.monsterBindings.gate-1.options[0]';
  const own = { path: `${line}.do`, message: 'said or done' };
  const whole = { path: line, message: 'the whole line' };
  const verdictRow = { path: `${line}.success[0].say`, message: 'row' };
  const failureRow = { path: `${line}.failure[2]`, message: 'row 3' };
  const nextLine = {
    path: 'room.room.monsterBindings.gate-1.options[10].do',
    message: 'another line',
  };

  it("keeps the line's own refusals and leaves its verdict rows' to the rows", () => {
    expect(
      lineRefusals([own, verdictRow, whole, failureRow, nextLine], line)
    ).toEqual([own, whole]);
  });
});
