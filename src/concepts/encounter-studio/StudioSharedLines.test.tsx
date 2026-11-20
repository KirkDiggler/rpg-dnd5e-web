/**
 * People → Conversations, the conversations written once (rpg-project#1027).
 * The page is driven by the engine's read-back of the conversations site
 * (rpg-toolkit's golden at encounter v0.232.1) and writes through the
 * studio's edits, so each test reads the file the edit would save.
 */
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptionShape } from '../world-building/answerTableShape';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import {
  addConversationLine,
  applyConversation,
  createConversation,
  removeConversation,
  setConversationLines,
  unapplyConversation,
  type LinesCarrier,
} from '../world-building/sharedLinesEdits';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import site from './fixtures/conversations-site.yaml?raw';
import { conversationsSiteReadBack } from './fixtures/engineReadBack';
import { StudioInteractions } from './StudioInteractions';
import type { StudioReadBack } from './studioPublishing';
import type { SharedLinesCheck } from './StudioSharedLines';

afterEach(cleanup);

function read() {
  const result = readDraftYaml(site);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** The lines of `b` that differ from `a`, line by line. */
function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

function renderPage() {
  const result = read();
  let readBack: StudioReadBack = {
    readBack: conversationsSiteReadBack(),
    readBackIsCurrent: true,
    unavailable: null,
  };
  let check: SharedLinesCheck | undefined;
  let document: RoomDraftDocument = {
    draft: result.draft,
    scope: result.scope,
  };
  const written = (): string => exportDraftYaml(document, result.key);
  const through =
    <A extends unknown[]>(
      edit: (document: RoomDraftDocument, ...args: A) => RoomDraftDocument
    ) =>
    (...args: A): boolean => {
      document = edit(document, ...args);
      return true;
    };
  const sharedLines = {
    setLines: vi.fn(
      through((d, id: string, lines: readonly OptionShape[]) =>
        setConversationLines(d, id, lines)
      )
    ),
    addLine: vi.fn(through((d, id: string) => addConversationLine(d, id))),
    create: vi.fn(
      through((d, id: string, carrier: LinesCarrier, say: string) =>
        createConversation(d, id, carrier, say)
      )
    ),
    apply: vi.fn(
      through((d, id: string, carrier: LinesCarrier) =>
        applyConversation(d, id, carrier)
      )
    ),
    unapply: vi.fn(
      through((d, id: string, carrier: LinesCarrier, index: number) =>
        unapplyConversation(d, id, carrier, index)
      )
    ),
    remove: vi.fn(through((d, id: string) => removeConversation(d, id))),
  };
  const view = () => (
    <StudioInteractions
      session={{
        document,
        commitInteractionApproach: vi.fn(() => true),
        commitInteractionOutcomes: vi.fn(() => true),
        sharedLines,
      }}
      readBack={readBack}
      check={check}
    />
  );
  const { rerender } = render(view());
  /** Show the draft as it now stands, and the check as `next` says. */
  const refresh = (next?: {
    current: boolean;
    check?: SharedLinesCheck;
    readBack?: ReadBack;
  }): void => {
    if (next) {
      readBack = {
        ...readBack,
        readBack: next.readBack ?? readBack.readBack,
        readBackIsCurrent: next.current,
      };
      check = next.check;
    }
    rerender(view());
  };
  return { sharedLines, written, refresh, before: site };
}

describe('the conversations written once (rpg-project#1027)', () => {
  it('lists the conversation with who carries it and how many lines, from the read-back', () => {
    renderPage();
    const list = screen.getByRole('list', {
      name: 'Conversations written once',
    });
    const row = within(list).getByRole('button', { name: /gate-claims/ });
    expect(row.textContent).toContain('3 carry it · 4 lines');
  });

  it('shows each carrier under Applied to, and the conversation’s lines in the line form', () => {
    renderPage();
    const applied = screen.getByRole('region', {
      name: 'Applied to for gate-claims',
    });
    for (const id of ['gate-1', 'gate-2', 'captain']) {
      const chip = within(applied).getByTitle(id).closest('li')!;
      expect(
        within(chip).getByRole('button', {
          name: /^Stop .* saying the lines of gate-claims$/,
        })
      ).toBeTruthy();
    }
    const lines = screen.getByRole('region', { name: 'Lines of gate-claims' });
    expect(
      (
        within(lines).getByLabelText(
          'Line 1 for gate-claims'
        ) as HTMLTextAreaElement
      ).value
    ).toBe('We’re the troupe for tonight’s feast.');
  });

  it('a new Performance difficulty on the troupe line writes once, at the conversation', () => {
    const { sharedLines, written } = renderPage();
    const before = written();
    const dc = screen.getByLabelText(
      'DC for approach 0 of line 1 of gate-claims'
    ) as HTMLInputElement;
    expect(dc.value).toBe('13');
    fireEvent.change(dc, { target: { value: '17' } });
    expect(sharedLines.setLines).toHaveBeenCalledTimes(1);
    expect(sharedLines.setLines.mock.calls[0]![0]).toBe('gate-claims');
    // One byte range changed: the troupe line's Performance difficulty under
    // `conversations.gate-claims.lines[0].check[0].dc`, which every carrier
    // says.
    expect(changedLines(before, written())).toEqual(['            dc: 17']);
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const conversations = saved.scope.unread!.conversations as Record<
      string,
      { lines: OptionShape[] }
    >;
    expect(conversations['gate-claims']!.lines[0]!.check![0]).toEqual({
      ability: 'performance',
      dc: 17,
    });
  });

  it('removing a carrier deletes only its `use:`', () => {
    const { sharedLines, written } = renderPage();
    const before = written();
    const chip = screen.getByTitle('gate-2').closest('li')!;
    fireEvent.click(within(chip).getByRole('button', { name: /^Stop / }));
    expect(sharedLines.unapply).toHaveBeenCalledWith(
      'gate-claims',
      { kind: 'creature', id: 'gate-2' },
      0
    );
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const bindings = saved.draft.room.monsterBindings!;
    expect(bindings['gate-2']!.options).toBeUndefined();
    expect(bindings['gate-1']!.options).toEqual([{ use: 'gate-claims' }]);
    expect(bindings.captain!.options).toContainEqual({ use: 'gate-claims' });
    // Only gate-2's two lines went; the rest of the file is as it was.
    expect(before.split('\n').length - written().split('\n').length).toBe(2);
  });

  it('applying to a faction writes `- use:` into its options', () => {
    const { sharedLines, written } = renderPage();
    fireEvent.change(screen.getByLabelText('Apply gate-claims to'), {
      target: { value: 'faction/watch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply gate-claims' }));
    expect(sharedLines.apply).toHaveBeenCalledWith('gate-claims', {
      kind: 'faction',
      id: 'watch',
    });
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    expect(
      saved.scope.factions!.find((faction) => faction.id === 'watch')!.options
    ).toEqual([{ use: 'gate-claims' }]);
  });

  it('shows the captain’s own line beside the conversation, as his', () => {
    renderPage();
    const own = screen.getByRole('region', {
      name: 'Own lines beside gate-claims',
    });
    expect(own.textContent).toContain(
      'We’re invited guests of His Majesty, here for the feast.'
    );
    expect(own.textContent).not.toContain('troupe for tonight');
  });

  it('a new conversation is written with its first line and its first carrier', () => {
    const { sharedLines, written } = renderPage();
    fireEvent.change(screen.getByLabelText('New conversation name'), {
      target: { value: 'kitchen-talk' },
    });
    fireEvent.change(screen.getByLabelText('New conversation applied to'), {
      target: { value: 'creature/gate-1' },
    });
    fireEvent.change(screen.getByLabelText('New conversation first line'), {
      target: { value: 'Smells good in here.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Write the new conversation' })
    );
    expect(sharedLines.create).toHaveBeenCalledTimes(1);
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const conversations = saved.scope.unread!.conversations as Record<
      string,
      { lines: OptionShape[] }
    >;
    expect(conversations['kitchen-talk']!.lines).toEqual([
      expect.objectContaining({ say: 'Smells good in here.' }),
    ]);
    expect(saved.draft.room.monsterBindings!['gate-1']!.options).toEqual([
      { use: 'gate-claims' },
      { use: 'kitchen-talk' },
    ]);
  });

  it('a name already written is refused before anything is written', () => {
    const { sharedLines } = renderPage();
    fireEvent.change(screen.getByLabelText('New conversation name'), {
      target: { value: 'gate-claims' },
    });
    fireEvent.change(screen.getByLabelText('New conversation first line'), {
      target: { value: 'Hello.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Write the new conversation' })
    );
    expect(sharedLines.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('already written');
  });

  it('today’s states and outcomes stay on the page', () => {
    renderPage();
    expect(
      screen.getByLabelText('Hails within (cells) for front-gate')
    ).toBeTruthy();
    expect(screen.getByLabelText('Outcomes for front-gate')).toBeTruthy();
  });

  it('removing the captain as a carrier keeps his own `guest` line', () => {
    const { sharedLines, written, before } = renderPage();
    const chip = screen.getByTitle('captain').closest('li')!;
    fireEvent.click(within(chip).getByRole('button', { name: /^Stop / }));
    // His `use:` is his second entry; his own line is his first.
    expect(sharedLines.unapply).toHaveBeenCalledWith(
      'gate-claims',
      { kind: 'creature', id: 'captain' },
      1
    );
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    expect(saved.draft.room.monsterBindings!.captain!.options).toEqual([
      expect.objectContaining({
        id: 'guest',
        say: 'We’re invited guests of His Majesty, here for the feast.',
      }),
    ]);
    // Only the `use:` line went.
    expect(before.split('\n').length - written().split('\n').length).toBe(1);
  });

  it('removing the last carrier asks, in the page; Keep it changes nothing, Yes removes the conversation in one write', () => {
    const { sharedLines, written, refresh } = renderPage();
    for (const id of ['gate-1', 'gate-2']) {
      const chip = screen.getByTitle(id).closest('li')!;
      fireEvent.click(within(chip).getByRole('button', { name: /^Stop / }));
    }
    expect(sharedLines.unapply).toHaveBeenCalledTimes(2);
    // The check answers: the engine now says only the captain carries it.
    const one = conversationsSiteReadBack();
    for (const group of one.sections.flatMap((section) => section.groups))
      for (const statement of group.statements)
        if (statement.kind === 'shared-lines')
          statement.connects = statement.connects.filter(
            (c) => c.role !== 'carries' || c.id === 'captain'
          );
    refresh({ current: true, readBack: one });
    const stop = () =>
      within(screen.getByTitle('captain').closest('li')!).getByRole('button', {
        name: /^Stop /,
      });
    fireEvent.click(stop());
    expect(sharedLines.unapply).toHaveBeenCalledTimes(2);
    const ask = screen.getByRole('group', {
      name: 'Remove the conversation gate-claims?',
    });
    expect(ask.textContent).toContain('Nobody would carry it.');
    const kept = written();
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep it' }));
    expect(written()).toBe(kept);
    expect(sharedLines.remove).not.toHaveBeenCalled();

    fireEvent.click(stop());
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the conversation' })
    );
    expect(sharedLines.remove).toHaveBeenCalledTimes(1);
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    expect(saved.scope.unread?.conversations).toBeUndefined();
    expect(saved.draft.room.monsterBindings!.captain!.options).toEqual([
      expect.objectContaining({ id: 'guest' }),
    ]);
  });

  it('the last line asks before the conversation goes; Keep it changes nothing', () => {
    const { sharedLines, written, refresh } = renderPage();
    const lines = () =>
      screen.getByRole('region', { name: 'Lines of gate-claims' });
    // Three lines go one by one, each a plain write.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        within(lines()).getByRole('button', {
          name: 'Remove line 1 from gate-claims',
        })
      );
      refresh({ current: false });
    }
    expect(sharedLines.setLines).toHaveBeenCalledTimes(3);
    // The last one asks.
    fireEvent.click(
      within(lines()).getByRole('button', {
        name: 'Remove line 1 from gate-claims',
      })
    );
    expect(sharedLines.setLines).toHaveBeenCalledTimes(3);
    const ask = screen.getByRole('group', {
      name: 'Remove the conversation gate-claims?',
    });
    expect(ask.textContent).toContain('It would have no lines.');
    const kept = written();
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep it' }));
    expect(written()).toBe(kept);
    expect(sharedLines.remove).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', {
        name: 'Remove the conversation gate-claims?',
      })
    ).toBeNull();
  });

  it('Yes removes the conversation and every `use:` of it in one write; own lines stay', () => {
    const { sharedLines, written, refresh } = renderPage();
    const lines = () =>
      screen.getByRole('region', { name: 'Lines of gate-claims' });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        within(lines()).getByRole('button', {
          name: 'Remove line 1 from gate-claims',
        })
      );
      refresh({ current: false });
    }
    fireEvent.click(
      within(lines()).getByRole('button', {
        name: 'Remove line 1 from gate-claims',
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the conversation' })
    );
    expect(sharedLines.remove).toHaveBeenCalledTimes(1);
    expect(sharedLines.remove).toHaveBeenCalledWith('gate-claims');
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    expect(saved.scope.unread?.conversations).toBeUndefined();
    const bindings = saved.draft.room.monsterBindings!;
    expect(bindings['gate-1']!.options).toBeUndefined();
    expect(bindings['gate-2']!.options).toBeUndefined();
    expect(bindings.captain!.options).toEqual([
      expect.objectContaining({ id: 'guest' }),
    ]);
    // Until the check answers, the page says the conversation is gone from
    // the draft rather than showing its old carriers as true.
    refresh({ current: false });
    expect(
      screen.getByRole('button', { name: /gate-claims/ }).textContent
    ).toContain('removed from the draft');
    expect(
      screen.queryByRole('region', { name: 'Applied to for gate-claims' })
    ).toBeNull();
  });

  it('while the check is behind the draft, carriers cannot be changed and the page says why', () => {
    const { refresh } = renderPage();
    refresh({ current: false });
    expect(screen.getByRole('status').textContent).toContain(
      'Checking the latest edit'
    );
    const chip = screen.getByTitle('gate-2').closest('li')!;
    expect(
      (
        within(chip).getByRole('button', {
          name: /^Stop /,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.queryByLabelText('Apply gate-claims to')).toBeNull();
  });

  it('when the engine refused the draft, the page says so and shows the refusal', () => {
    const { refresh } = renderPage();
    refresh({
      current: false,
      check: {
        state: 'refused',
        refusals: [
          {
            path: 'conversations.gate-claims.lines[0].check[0].dc',
            message: 'a difficulty is a whole number of at least 1',
          },
        ],
      },
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('The engine refused this draft');
    expect(status.textContent).toContain(
      'a difficulty is a whole number of at least 1'
    );
    expect(status.textContent).toContain('the lines of `gate-claims`');
    expect(status.textContent).not.toContain('catch up');
  });
});
