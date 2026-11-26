/**
 * THE ITEM FORM IS DRAWN FROM THE ENGINE'S TABLE (rpg-project#1201): with the
 * recorded `GetItemWords` answer, every field, label, option and bound comes
 * from the table; a shape the studio has no control for is shown; a key the
 * table does not name is kept.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import siteYaml from './fixtures/cloak-and-ring-walk.yaml?raw';
import { itemWordsV237 } from './fixtures/engineReadBack';
import { WordsForm } from './WordsForm';
import { wordsAt, type FormWord } from './wordsForm';

const WORDS: FormWord[] = itemWordsV237().words;
interface Block {
  charges?: unknown;
  lets: unknown[];
  [key: string]: unknown;
}
const items = (parse(siteYaml) as { customItems: Record<string, Block> })
  .customItems;
const cloak = () => structuredClone(items['lieutenants-cloak']);
const ring = () => structuredClone(items['garrison-ring']);

const word = (place: string, name: string): FormWord =>
  WORDS.find((w) => w.place === place && w.word === name)!;
/** The words around a `{value}`, as one regex. */
const around = (label: string): RegExp =>
  new RegExp(
    label
      .split('{value}')
      .map((p) => p.trim())
      .join('\\s*')
  );

function draw(value: Record<string, unknown>, words: FormWord[] = WORDS) {
  const onChange = vi.fn();
  render(
    <WordsForm
      words={words}
      place="item"
      value={value}
      onChange={onChange}
      idPrefix="t"
    />
  );
  return onChange;
}

describe('WordsForm', () => {
  it('draws one field per word in the engine’s order with the engine’s labels', () => {
    draw(cloak());
    expect(
      (
        screen.getByRole('textbox', {
          name: word('item', 'name').label,
        }) as HTMLInputElement
      ).value
    ).toBe("Lieutenant's cloak");
    const slot = screen.getByRole('combobox', {
      name: word('item', 'slot').label,
    }) as HTMLSelectElement;
    expect(slot.value).toBe('cloak');
    expect([...slot.options].map((o) => o.textContent)).toEqual(
      word('item', 'slot').values.map((v) => v.label)
    );
    const max = screen.getByRole('spinbutton', {
      name: around(word('charges', 'max').label),
    }) as HTMLInputElement;
    expect(max.value).toBe('1');
    expect(max.min).toBe('1');
    expect(max.max).toBe('1000');
    for (const v of word('refills', 'on').values)
      expect((screen.getByLabelText(v.label) as HTMLInputElement).checked).toBe(
        true
      );
    const use = screen.getByRole('combobox', {
      name: around(word('lets entry', 'use').label),
    }) as HTMLSelectElement;
    expect(use.selectedOptions[0].textContent).toBe(
      word('lets entry', 'use').values[0].label
    );
    const level = screen.getByRole('spinbutton', {
      name: around(word('lets entry', 'use').values[0].with![0].label),
    }) as HTMLInputElement;
    expect(level.value).toBe('1');
    expect(level.max).toBe('');
    // the engine's order: name before slot before the lets list
    const order = wordsAt(WORDS, 'item').map((w) => w.label);
    const text = document.body.textContent ?? '';
    const at = order.map((l) => text.indexOf(l));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('each control writes its word', () => {
    const slotWord = word('item', 'slot');
    const onChange = draw(cloak());
    fireEvent.change(screen.getByRole('combobox', { name: slotWord.label }), {
      target: { value: 'amulet' },
    });
    let next = onChange.mock.calls[0][0];
    expect(next.slot).toBe('amulet');
    expect(Object.keys(next)).toEqual(Object.keys(cloak()));
    expect({ ...next, slot: 'cloak' }).toEqual(cloak());

    fireEvent.click(screen.getByLabelText('a long rest'));
    next = onChange.mock.calls[1][0];
    expect(next.charges.refills.on).toEqual(['short rest']);

    fireEvent.click(
      screen.getByRole('checkbox', { name: word('item', 'unique').label })
    );
    expect('unique' in onChange.mock.calls[2][0]).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(onChange.mock.calls[3][0].lets).toEqual([...cloak().lets, {}]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange.mock.calls[4][0].lets).toEqual([]);
  });

  it('an optional entries word can be set and unset', () => {
    const block = ring();
    delete block.charges;
    let onChange = draw(block);
    const entry = screen
      .getByText(word('item', 'charges').label)
      .closest('fieldset')!;
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'set' }));
    expect(onChange.mock.calls[0][0].charges).toEqual({});
    cleanup();
    onChange = draw(ring());
    const held = screen
      .getByText(word('item', 'charges').label)
      .closest('fieldset')!;
    fireEvent.click(within(held).getAllByRole('checkbox', { name: 'set' })[0]);
    expect('charges' in onChange.mock.calls[0][0]).toBe(false);
  });

  it('a word of a shape this studio does not know is shown, not hidden', () => {
    const odd: FormWord = {
      word: 'tint',
      place: 'item',
      shape: 'colour',
      values: [],
      label: 'its colour',
      holds: '',
      required: false,
    };
    draw({ tint: 'red' }, [odd]);
    const line = screen.getByText(/tint/);
    expect(line.textContent).toContain('colour');
    expect(line.textContent).toContain('"red"');
  });

  it('a key the table does not name is kept and shown', () => {
    const onChange = draw({ ...ring(), weight: 3 });
    expect(screen.getByText(/also written/).textContent).toContain('weight');
    fireEvent.change(
      screen.getByRole('textbox', { name: word('item', 'name').label }),
      { target: { value: 'Other' } }
    );
    expect(onChange.mock.calls[0][0].weight).toBe(3);
  });
});
