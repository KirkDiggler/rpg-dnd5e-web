/**
 * THE STATUS FORM IS DRAWN FROM THE ENGINE'S STATUS TABLE (rpg-project#1219):
 * a `list` entry holds one word and the words that narrow it, the `when`
 * words offered follow the change, and the form never writes over or hides
 * what it did not show.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { statusWordsV240 } from './fixtures/engineReadBack';
import { statusFormWords } from './statusWords';
import { WordsForm } from './WordsForm';

afterEach(cleanup);

const WORDS = statusFormWords(statusWordsV240().words);

const welcomed = () => ({
  name: 'Welcomed',
  changes: [{ advantage: 'checks', when: { ability: 'charisma' } }],
  maintenance: [{ ends_on: 'rest' }],
  again: 'ignored',
});

function draw(value: Record<string, unknown>) {
  const onChange = vi.fn();
  render(
    <WordsForm
      words={WORDS}
      place="status"
      value={value}
      onChange={onChange}
      idPrefix="s"
    />
  );
  return onChange;
}
const last = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;
const select = (name: string | RegExp) =>
  screen.getByRole('combobox', { name }) as HTMLSelectElement;

describe('WordsForm drawing a status', () => {
  it('draws the name, one change with its what, value and when, one maintenance rule, and again', () => {
    draw(welcomed());
    expect(
      (
        screen.getByRole('textbox', {
          name: /the name players see/,
        }) as HTMLInputElement
      ).value
    ).toBe('Welcomed');
    expect(select('What the change is').value).toBe('advantage');
    expect(select(/^advantage on/).value).toBe('checks');
    expect(select(/only when the ability is/).value).toBe('charisma');
    expect(select('What the maintenance rule is').value).toBe('ends_on');
    expect(select(/ends when/).value).toBe('rest');
    expect(select(/what a second giving does/).value).toBe('ignored');
  });

  it('changing the ability writes exactly that and keeps everything else', () => {
    const onChange = draw({ ...welcomed(), extra: 1 });
    fireEvent.change(select(/only when the ability is/), {
      target: { value: 'wisdom' },
    });
    expect(last(onChange)).toEqual({
      ...welcomed(),
      extra: 1,
      changes: [{ advantage: 'checks', when: { ability: 'wisdom' } }],
    });
  });

  it('the when words offered follow the advantage value', () => {
    const view = draw(welcomed());
    expect(
      screen.queryByRole('combobox', { name: /only for .* attacks/ })
    ).toBeNull();
    cleanup();
    draw({
      ...welcomed(),
      changes: [{ advantage: 'attacks', when: { ability: 'charisma' } }],
    });
    expect(select(/only for/)).toBeTruthy();
    void view;
  });

  it('choosing attacks as the value offers attack under when', () => {
    const onChange = draw(welcomed());
    fireEvent.change(select(/^advantage on/), { target: { value: 'attacks' } });
    expect(last(onChange).changes).toEqual([
      { advantage: 'attacks', when: { ability: 'charisma' } },
    ]);
  });

  it('changing WHAT to initiative drops advantage, keeps when shown, and writes initiative only with a number', () => {
    const onChange = draw(welcomed());
    fireEvent.change(select('What the change is'), {
      target: { value: 'initiative' },
    });
    expect(last(onChange).changes).toEqual([{ when: { ability: 'charisma' } }]);
    // the when is still shown (its inner word is no longer allowed), not hidden
    cleanup();
    const again = draw({
      ...welcomed(),
      changes: [{ when: { ability: 'charisma' } }],
    });
    expect(document.querySelector('[data-also-written="when"]')).not.toBeNull();
    expect(select('What the change is').value).toBe('');
    fireEvent.change(select('What the change is'), {
      target: { value: 'initiative' },
    });
    expect(again).not.toHaveBeenCalled();
    expect(select('What the change is').value).toBe('initiative');
    const box = screen.getByRole('spinbutton', { name: /adds/ });
    fireEvent.change(box, { target: { value: '2' } });
    fireEvent.blur(box);
    expect(last(again).changes).toEqual([
      { when: { ability: 'charisma' }, initiative: 2 },
    ]);
  });

  it('Add appends an empty entry; picking writes nothing; setting the value writes one key', () => {
    const value = { ...welcomed(), changes: [] };
    const onChange = draw(value);
    fireEvent.click(
      screen.getByRole('button', { name: /Add to what the status changes/ })
    );
    expect(last(onChange).changes).toEqual([{}]);
    cleanup();
    const next = vi.fn();
    render(
      <WordsForm
        words={WORDS}
        place="status"
        value={{ ...value, changes: [{}] }}
        onChange={next}
        idPrefix="s"
      />
    );
    fireEvent.change(select('What the change is'), {
      target: { value: 'max_hit_points' },
    });
    expect(next).not.toHaveBeenCalled();
    const box = screen.getByRole('spinbutton', { name: /raises/ });
    fireEvent.change(box, { target: { value: '5' } });
    fireEvent.blur(box);
    expect(last(next).changes).toEqual([{ max_hit_points: 5 }]);
  });

  it('an entry with two words is shown as written and a change elsewhere leaves it as it was', () => {
    const odd = { advantage: 'checks', initiative: 1 };
    const onChange = draw({
      ...welcomed(),
      changes: [odd, { advantage: 'saves' }],
    });
    expect(document.querySelectorAll('[data-not-plain]')).toHaveLength(1);
    const entries = document.querySelectorAll('.es-words-entry');
    expect(
      within(entries[0] as HTMLElement).getByRole('button', {
        name: /Remove 1/,
      })
    ).toBeTruthy();
    fireEvent.change(
      within(entries[1] as HTMLElement).getByRole('combobox', {
        name: /^advantage on/,
      }),
      { target: { value: 'checks' } }
    );
    const changes = last(onChange).changes as unknown[];
    expect(JSON.stringify(changes[0])).toBe(JSON.stringify(odd));
    expect(changes[1]).toEqual({ advantage: 'checks' });
  });

  it('an entry that is text is shown as written, with Remove', () => {
    const onChange = draw({ ...welcomed(), changes: ['oops'] });
    expect(document.querySelector('[data-not-an-object]')?.textContent).toBe(
      '"oops"'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /Remove 1 from what the status changes/,
      })
    );
    expect(last(onChange).changes).toEqual([]);
  });

  it('an inner word the table does not name is shown and kept after another change', () => {
    const onChange = draw({
      ...welcomed(),
      changes: [
        { advantage: 'checks', when: { ability: 'charisma', weather: 'rain' } },
      ],
    });
    expect(
      document.querySelector('[data-also-written="weather"]')
    ).not.toBeNull();
    fireEvent.change(select(/only when the ability is/), {
      target: { value: 'wisdom' },
    });
    expect(last(onChange).changes).toEqual([
      { advantage: 'checks', when: { ability: 'wisdom', weather: 'rain' } },
    ]);
  });

  it('a positive whole number draws a number field and writes a number', () => {
    const onChange = draw({
      ...welcomed(),
      changes: [{ max_hit_points: 3 }],
    });
    const box = screen.getByRole('spinbutton', {
      name: /raises/,
    }) as HTMLInputElement;
    expect(box.value).toBe('3');
    expect(box.min).toBe('1');
    expect(box.max).toBe('1000');
    fireEvent.change(box, { target: { value: '8' } });
    fireEvent.blur(box);
    expect(last(onChange).changes).toEqual([{ max_hit_points: 8 }]);
  });
});
