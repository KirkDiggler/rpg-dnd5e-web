/**
 * The row editor offers the new words where the engine takes them, and only
 * there (rpg-project#732): `dash` and its cell and route, the move words and
 * `threat`, `ally` on a walking word and never on `attack`, and `fell` with
 * the placed monster it waits on.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnswerEntryShape } from './answerTableShape';
import { PlacedMonstersContext } from './placedMonstersContext';
import { RoutePickContext, type RoutePicking } from './routePicking';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

afterEach(cleanup);

const MONSTERS = new Map([
  ['king', 'The Mad King'],
  ['captain', 'Guard Captain'],
]);

function mount(entry: AnswerEntryShape, picking?: RoutePicking) {
  const onChange = vi.fn();
  const panel = (
    <PlacedMonstersContext.Provider value={MONSTERS}>
      <TablesPanel
        scope={{ tables: { knight: { time: [entry] } } }}
        onChange={onChange}
      />
    </PlacedMonstersContext.Provider>
  );
  render(
    picking ? (
      <RoutePickContext.Provider value={picking}>
        {panel}
      </RoutePickContext.Provider>
    ) : (
      panel
    )
  );
  fireEvent.click(screen.getByLabelText('Table knight'));
  return () =>
    (onChange.mock.calls.at(-1)?.[0] as SiteScope | undefined)?.tables?.knight
      ?.time?.[0];
}

const options = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
    (option) => option.value
  );

describe('the row editor speaks the new words', () => {
  it('offers dash among the time words, with a cell and a route where the map can pick', () => {
    mount({ when: { enemy: 'far' }, dash: 'enemy' }, { arm: () => {} });
    expect(options('Do for time entry')).toContain('dash');
    expect(options('To for time entry')).toEqual([
      'enemy',
      'attacker',
      'ally',
      'at',
      'path',
    ]);
  });

  it('offers the move words and the three threats as conditions', () => {
    mount({ when: { enemy: 'far' }, dash: 'enemy' });
    const when = options('When for time entry');
    for (const word of ['enemy:walk', 'enemy:dash', 'enemy:far'])
      expect(when).toContain(word);
    for (const word of ['threat:none', 'threat:walk', 'threat:dash'])
      expect(when).toContain(word);
  });

  it('writes a threat condition', () => {
    const last = mount({ when: { enemy: 'dash' }, dash: 'enemy' });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'threat:none' },
    });
    expect(last()).toEqual({ when: { threat: 'none' }, dash: 'enemy' });
  });

  it('never offers ally on attack', () => {
    mount({ when: { enemy: 'reach' }, attack: 'enemy' });
    expect(options('To for time entry')).not.toContain('ally');
  });

  it('shows the knight’s fell row with who it waits on, and offers the placed monsters', () => {
    mount({
      when: { fell: { who: 'king', within: 3, on: 'ally' } },
      away: 'enemy',
      weight: 3,
    });
    expect(
      (screen.getByLabelText('When for time entry') as HTMLSelectElement).value
    ).toBe('deed:fell');
    expect(
      (screen.getByLabelText('Who fell for time entry') as HTMLSelectElement)
        .value
    ).toBe('king');
    expect(options('Who fell for time entry')).toEqual(['', 'king', 'captain']);
    expect(
      screen.getByText(
        'when an ally fell within 3 (king) · weight 3 · away enemy'
      )
    ).toBeTruthy();
  });

  it('writes who first, as the castle spells it', () => {
    const last = mount({
      when: { fell: { within: 3, on: 'ally' } },
      away: 'enemy',
    });
    fireEvent.change(screen.getByLabelText('Who fell for time entry'), {
      target: { value: 'captain' },
    });
    expect(JSON.stringify(last()?.when)).toBe(
      '{"fell":{"who":"captain","within":3,"on":"ally"}}'
    );
  });

  it('drops who when the deed is no longer a fall', () => {
    const last = mount({
      when: { fell: { who: 'king', within: 3, on: 'ally' } },
      away: 'enemy',
    });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'deed:attacked' },
    });
    expect(last()?.when).toEqual({ attacked: { within: 3, on: 'ally' } });
  });

  it('keeps a hand-written who the document does not place', () => {
    mount({ when: { fell: { who: 'ghost', within: 2 } }, hold: {} });
    expect(options('Who fell for time entry')).toEqual([
      '',
      'king',
      'captain',
      'ghost',
    ]);
  });
});
