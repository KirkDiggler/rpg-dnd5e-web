// @vitest-environment node
import { expect, it } from 'vitest';
import { AttackDieRequestTracker } from './attackDieRequestTracker';
it('attributes request identities by starts, retains repeated URLs and late completion', () => {
  const t = new AttackDieRequestTracker(),
    pre = {},
    one = {},
    two = {};
  t.start(pre, '/same', 5);
  t.start(one, '/same', 12);
  t.start(two, '/same', 15);
  t.settle(pre, { status: 200, bytes: 4, settledAt: 14 });
  t.settle(one, { status: 200, bytes: 5, settledAt: 30 });
  expect(t.sample(10, 20)).toEqual([
    expect.objectContaining({ id: 1, url: '/same', bytes: 5, settledAt: 30 }),
    expect.objectContaining({ id: 2, url: '/same', bytes: null }),
  ]);
});
