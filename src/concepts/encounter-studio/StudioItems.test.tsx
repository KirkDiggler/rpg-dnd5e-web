/**
 * THE ITEM FORM WRITES EACH CHANGE AS IT IS MADE (rpg-project#1213): no Save,
 * no Discard, no local draft to lose.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import siteYaml from './fixtures/cloak-and-ring-walk.yaml?raw';
import { itemWordsV237 } from './fixtures/engineReadBack';
import { StudioItems } from './StudioItems';

afterEach(cleanup);

const words = itemWordsV237();
const label = (word: string): string =>
  words.words.find((w) => w.place === 'item' && w.word === word)!.label;

type Edit = (item: Record<string, unknown>) => Record<string, unknown>;

function start(): RoomDraftDocument {
  const read = readDraftYaml(siteYaml);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope } as RoomDraftDocument;
}

const itemsOf = (document: RoomDraftDocument): Record<string, unknown> =>
  (document.scope.unread as { customItems: Record<string, unknown> })
    .customItems;

/** A fake owner: applies each commit to `written`, or refuses when told. */
function mount(refuse = false) {
  const commits: { id: string; block: Record<string, unknown> }[] = [];
  const onCommitItem = vi.fn((id: string, edit: Edit): boolean => {
    commits.push({
      id,
      block: edit(structuredClone(itemsOf(current)[id]) as never),
    });
    return !refuse;
  });
  let current = start();
  function Harness() {
    const [document, setDocument] = useState(current);
    current = document;
    return (
      <StudioItems
        document={document}
        readBack={{
          readBack: null,
          readBackIsCurrent: false,
          unavailable: null,
        }}
        focus="garrison-ring"
        onSelect={() => undefined}
        itemWords={words}
        onCommitItem={(id, edit) => {
          const ok = onCommitItem(id, edit);
          if (ok) {
            const items = itemsOf(document);
            const next = edit(items[id] as Record<string, unknown>);
            setDocument({
              ...document,
              scope: {
                ...document.scope,
                unread: {
                  ...document.scope.unread,
                  customItems: { ...items, [id]: next },
                },
              },
            } as RoomDraftDocument);
          }
          return ok;
        }}
      />
    );
  }
  render(<Harness />);
  return { commits, onCommitItem };
}

describe('StudioItems: the item form writes as you go', () => {
  it('has no Save and no Discard, and says each change is written', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Discard$/ })).toBeNull();
    expect(
      screen.getByText(
        'Each change is written as you make it. Undo takes it back.'
      )
    ).toBeTruthy();
  });

  it('one tick commits once, with the block carrying that tick', () => {
    const { commits, onCommitItem } = mount();
    fireEvent.click(screen.getByRole('checkbox', { name: label('unique') }));
    expect(onCommitItem).toHaveBeenCalledTimes(1);
    expect(commits[0].id).toBe('garrison-ring');
    expect(commits[0].block.unique).toBe(true);
  });

  it('two changes in a row: the second commit still holds the first', () => {
    const { commits } = mount();
    fireEvent.click(screen.getByRole('checkbox', { name: label('unique') }));
    fireEvent.change(screen.getByRole('combobox', { name: label('slot') }), {
      target: { value: 'amulet' },
    });
    expect(commits).toHaveLength(2);
    expect(commits[1].block.slot).toBe('amulet');
    expect(commits[1].block.unique).toBe(true);
  });

  it('a refused commit leaves the field showing the file’s value', () => {
    const { onCommitItem } = mount(true);
    const name = screen.getByRole('textbox', { name: label('name') });
    const before = (name as HTMLInputElement).value;
    fireEvent.change(name, { target: { value: 'Something else' } });
    fireEvent.blur(name);
    expect(onCommitItem).toHaveBeenCalledTimes(1);
    expect((name as HTMLInputElement).value).toBe(before);
  });
});

describe('StudioItems: what a change is built from', () => {
  const plain = {
    readBack: null,
    readBackIsCurrent: false,
    unavailable: null,
  };

  it('the edit is built from the live item, not the block drawn', () => {
    const onCommitItem = vi.fn<(id: string, edit: Edit) => boolean>(() => true);
    render(
      <StudioItems
        document={start()}
        readBack={plain}
        focus="garrison-ring"
        onSelect={() => undefined}
        itemWords={words}
        onCommitItem={onCommitItem}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: label('unique') }));
    const edit = onCommitItem.mock.calls[0][1];
    const live = { ...(itemsOf(start())['garrison-ring'] as object), extra: 1 };
    const result = edit(live as Record<string, unknown>);
    expect(result.extra).toBe(1);
    expect(result.unique).toBe(true);
  });

  it('text typed in one item is not written into another', () => {
    const onCommitItem = vi.fn<(id: string, edit: Edit) => boolean>(() => true);
    const doc = start();
    const view = (focus: string) => (
      <StudioItems
        document={doc}
        readBack={plain}
        focus={focus}
        onSelect={() => undefined}
        itemWords={words}
        onCommitItem={onCommitItem}
      />
    );
    const { rerender } = render(view('garrison-ring'));
    fireEvent.change(screen.getByRole('textbox', { name: label('name') }), {
      target: { value: 'half typed' },
    });
    rerender(view('lieutenants-cloak'));
    const name = screen.getByRole('textbox', {
      name: label('name'),
    }) as HTMLInputElement;
    expect(name.value).toBe('Lieutenant’s cloak'.replace('’', "'"));
    fireEvent.blur(name);
    expect(onCommitItem).toHaveBeenCalledTimes(0);
  });

  it('the help line is absent when the form is not editable', () => {
    render(
      <StudioItems
        document={start()}
        readBack={plain}
        focus="garrison-ring"
        onSelect={() => undefined}
        itemWords={null}
        onCommitItem={() => true}
      />
    );
    expect(screen.queryByText(/Each change is written/)).toBeNull();
    cleanup();
    const doc = start();
    (itemsOf(doc) as Record<string, unknown>)['garrison-ring'] = 'text';
    render(
      <StudioItems
        document={doc}
        readBack={plain}
        focus="garrison-ring"
        onSelect={() => undefined}
        itemWords={words}
        onCommitItem={() => true}
      />
    );
    expect(screen.queryByText(/Each change is written/)).toBeNull();
  });
});

describe('a customItems that is not a mapping (rpg-project#1218)', () => {
  // catches: content hidden behind the empty sentence
  it('shows the value as written and does not say the site has no items', () => {
    const document = start();
    render(
      <StudioItems
        document={{
          ...document,
          scope: {
            ...document.scope,
            unread: { ...document.scope.unread, customItems: 'oops' },
          },
        }}
        readBack={{
          readBack: null,
          readBackIsCurrent: false,
          unavailable: null,
        }}
        focus={null}
        onSelect={() => undefined}
      />
    );
    const notice = screen
      .getAllByRole('status')
      .find((n) => n.textContent?.includes('is not a list of items'))!;
    expect(notice.querySelector('pre')!.textContent).toBe(
      'customItems: oops\n'
    );
    expect(screen.queryByText(/This site has no/)).toBeNull();
    expect(
      screen.getByText("No item can be listed from the file's customItems.")
    ).toBeTruthy();
  });
});
