/**
 * A JOIN IN THE INSPECTOR (rpg-project#972): its own sentence, then its ways
 * under each bar they lift, every sentence the engine's, unaltered.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import { castlePlacesReadBack } from './fixtures/engineReadBack';
import { syntheticJoin } from './fixtures/placesSynthetic';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { EVERY_BAR_SENTENCE, JoinInspector } from './JoinInspector';
import { placesOf } from './placesView';

afterEach(cleanup);

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

const joinBy = (id: string, readBack = castlePlacesReadBack()) =>
  placesOf(readBack).joins.find((join) => join.id === id)!;
const GATE = 'door:region-courtyard:region-gatehouse:gate-wall-door';
const inspector = () => screen.getByRole('region', { name: 'Inspector' });
const section = (name: string | RegExp) =>
  within(inspector()).getByRole('region', { name });

function show(id: string, current = true, onJump = vi.fn()) {
  render(
    <JoinInspector
      join={joinBy(id)}
      document={castle}
      current={current}
      onJump={onJump}
      onOpenFact={vi.fn()}
    />
  );
  return onJump;
}

describe('JoinInspector', () => {
  it('the gate: its sentence, then seven named ways under the holders', () => {
    show(GATE);
    expect(inspector().textContent).toContain(
      'Courtyard (region-courtyard) and Gatehouse (region-gatehouse) join at the door `gate-wall-door`.'
    );
    const holders = section('To pass the holders, any of:');
    const ways = within(holders)
      .getAllByRole('listitem')
      .filter((item) => item.dataset.way !== undefined);
    expect(ways).toHaveLength(11);
    const said = ways.map((way) => way.querySelector('p')!.textContent ?? '');
    for (const line of [
      'troupe',
      'guest',
      'vouch',
      'straggler',
      'stand-aside',
      'turn',
    ])
      expect(said.some((text) => text.includes(`The line \`${line}\``))).toBe(
        true
      );
    expect(said.some((text) => text.startsWith('The fight lifts'))).toBe(true);
    const troupe = ways.find((way) =>
      way
        .querySelector('p')!
        .textContent!.startsWith('The line `troupe` of Guard (gate-1)')
    )!;
    expect(
      within(troupe)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent)
    ).toEqual(expect.arrayContaining(['Performance 13', 'Deception 15']));
    // One bar: no word about passing every bar.
    expect(inspector().textContent).not.toContain('Every bar');
  });

  it('the kitchen door shows two lock ways', () => {
    show('door:region-great-hall:region-kitchen:kitchen-wall-door');
    const lock = section('To pass the lock, any of:');
    expect(
      within(lock)
        .getAllByRole('listitem')
        .filter((item) => item.dataset.way !== undefined)
    ).toHaveLength(2);
  });

  it('the grate: search and told under the hidden bar, the passage way apart', () => {
    show('passage:region-kitchen:region-chapel:prop-grate');
    const hidden = section('To pass the hiding, any of:');
    const kinds = within(hidden)
      .getAllByRole('listitem')
      .filter((item) => item.dataset.way !== undefined)
      .map((item) => item.dataset.way);
    expect(kinds).toEqual(['place.way.search', 'place.way.told']);
    const other = section('Other ways');
    expect(other.textContent).toContain(
      'The line `to-chapel` of the prop `grate` carries the passage to Chapel'
    );
    expect(hidden.textContent).not.toContain('The line `to-chapel`');
    // The told way names who tells it: the record, a jump to Intel.
    expect(
      within(hidden).getByRole('button', { name: 'Open record kitchen-way' })
    ).toBeTruthy();
  });

  it('a way’s carrier is a jump that selects that creature', () => {
    const onJump = show(GATE);
    const turn = within(section('To pass the holders, any of:'))
      .getAllByRole('listitem')
      .find((way) =>
        way.querySelector('p')?.textContent?.startsWith('The line `turn`')
      )!;
    fireEvent.click(
      within(turn).getByRole('button', { name: 'Open creature captain' })
    );
    expect(onJump).toHaveBeenCalledWith({ kind: 'creature', id: 'captain' });
  });

  it('a way of an unknown kind renders its sentence plainly', () => {
    const readBack = castlePlacesReadBack();
    const group = readBack.sections[0]!.groups[0]!;
    const free = group.statements.find(
      (s) =>
        s.kind === 'place.way.free' &&
        s.connects.some((c) => c.id.endsWith('hall-wall-door'))
    )!;
    group.statements.push({
      ...free,
      kind: 'place.way.teleport',
      sentence: 'A brand new way, as the engine says it.',
    });
    render(
      <JoinInspector
        join={joinBy(
          'door:region-courtyard:region-great-hall:hall-wall-door',
          readBack
        )}
        document={castle}
        current
        onJump={vi.fn()}
        onOpenFact={vi.fn()}
      />
    );
    expect(section('Other ways').textContent).toContain(
      'A brand new way, as the engine says it.'
    );
  });

  it('with a stale read-back it says the join is from the last draft that compiled', () => {
    show(GATE, false);
    expect(within(inspector()).getByRole('status').textContent).toBe(
      'These sentences are from the last draft that compiled.'
    );
  });
});

describe('JoinInspector on the engine’s other shapes', () => {
  it('two bars: says every bar must be passed; partial and none stand apart', () => {
    const join = placesOf(
      syntheticJoin([
        {
          kind: 'place.way.lock',
          connects: [
            ['bar', 'lock', 'lifts'],
            ['method', 'ability:str', 'by'],
          ],
        },
        {
          kind: 'place.way.partial',
          connects: [
            ['bar', 'hold', 'lifts'],
            ['creature', 'x', 'still-holds'],
          ],
        },
        { kind: 'place.way.none', connects: [['bar', 'hold', 'unlifted']] },
      ])
    ).joins[0]!;
    render(
      <JoinInspector join={join} document={castle} current onJump={vi.fn()} />
    );
    expect(inspector().textContent).toContain(EVERY_BAR_SENTENCE);
    expect(section('To pass the lock, any of:').textContent).toContain(
      'Way 0 (place.way.lock).'
    );
    expect(
      within(inspector()).queryByRole('region', {
        name: 'To pass the holders, any of:',
      })
    ).toBeNull();
    expect(section('Helps, not enough alone').textContent).toContain(
      'Way 1 (place.way.partial).'
    );
    expect(section('Nothing lifts').textContent).toContain(
      'Way 2 (place.way.none).'
    );
  });

  it('one bar says nothing of every bar', () => {
    const join = placesOf(
      syntheticJoin([
        { kind: 'place.way.none', connects: [['bar', 'lock', 'unlifted']] },
      ])
    ).joins[0]!;
    render(<JoinInspector join={join} document={castle} current />);
    expect(inspector().textContent).not.toContain(EVERY_BAR_SENTENCE);
    expect(section('Nothing lifts').textContent).toContain(
      'Way 0 (place.way.none).'
    );
  });
});
