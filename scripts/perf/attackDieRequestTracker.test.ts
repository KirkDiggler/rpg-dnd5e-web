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

it('finalizes immutable nonoverlapping ranges after late/pending request settlement', async () => {
  const t = new AttackDieRequestTracker(),
    pre = {},
    late1 = {},
    late2 = {},
    never = {};
  t.start(pre, '/same', 1);
  t.start(late1, '/same', 11);
  t.start(late2, '/same', 12);
  t.start(never, '/never', 21);
  const first = t.closeRange('first');
  const secondStart = t.boundary();
  const second = t.closeRange('second', secondStart);
  t.settle(pre, { status: 200, bytes: 1, settledAt: 15 });
  t.settle(late1, { status: 200, bytes: 5, settledAt: 30 });
  t.settle(late2, { status: 200, bytes: 6, settledAt: 31 });
  await t.awaitSettlements(1);
  expect(t.materialize(first).map((x) => x.id)).toEqual([0, 1, 2, 3]);
  expect(t.materialize(first).at(-1)).toMatchObject({
    status: null,
    bytes: null,
    settledAt: null,
  });
  expect(t.materialize(second)).toEqual([]);
});
