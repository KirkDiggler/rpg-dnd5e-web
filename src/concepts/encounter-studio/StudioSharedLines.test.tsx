/**
 * People → Conversations, the conversations written once (rpg-project#1027).
 * The page is driven by the engine's read-back of the conversations site
 * (rpg-toolkit's golden at encounter v0.232.1) and writes through the
 * studio's edits, so each test reads the file the edit would save.
 */
import { create } from '@bufbuild/protobuf';
import {
  ReadBackConnectionSchema,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
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
  editCarrierLine,
  removeConversation,
  setConversationLines,
  unapplyConversation,
  type LinesCarrier,
} from '../world-building/sharedLinesEdits';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import site from './fixtures/conversations-site.yaml?raw';
import {
  castleConversationsReadBack,
  conversationsSiteReadBack,
} from './fixtures/engineReadBack';
import castle from './fixtures/the-mad-king-conversations.yaml?raw';
import { DIFFICULTY_REFUSAL, STALE_LINE_SENTENCE } from './SharedLineCard';
import { StudioInteractions } from './StudioInteractions';
import type { StudioReadBack } from './studioPublishing';
import type { SharedLinesCheck } from './StudioSharedLines';

afterEach(cleanup);

function read(yaml: string = site) {
  const result = readDraftYaml(yaml);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** The lines of `b` that differ from `a`, line by line. */
function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

function renderPage(
  engine: ReadBack = conversationsSiteReadBack(),
  yaml: string = site
) {
  const result = read(yaml);
  let readBack: StudioReadBack = {
    readBack: engine,
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
    setOwnLine: vi.fn(
      through(
        (d, carrier: LinesCarrier, index: number, option: OptionShape | null) =>
          editCarrierLine(d, carrier, index, option)
      )
    ),
  };
  const view = () => (
    <SiteNamesContext.Provider
      value={siteNamesOf(document.scope, document.draft.room)}
    >
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
    </SiteNamesContext.Provider>
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
  return { sharedLines, written, refresh, before: yaml };
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
          name: /^Remove .* from gate-claims$/,
        })
      ).toBeTruthy();
    }
    const lines = screen.getByRole('region', { name: 'Lines of gate-claims' });
    fireEvent.click(
      within(lines).getByRole('button', { name: 'Edit line 1 of gate-claims' })
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 1 of gate-claims' })
    );
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
    fireEvent.click(within(chip).getByRole('button', { name: /^Remove / }));
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply gate-claims to…' })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply gate-claims to faction watch',
      })
    );
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
    fireEvent.click(within(chip).getByRole('button', { name: /^Remove / }));
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
      fireEvent.click(within(chip).getByRole('button', { name: /^Remove / }));
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
        name: /^Remove /,
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
          name: 'Edit line 1 of gate-claims',
        })
      );
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
        name: 'Edit line 1 of gate-claims',
      })
    );
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
          name: 'Edit line 1 of gate-claims',
        })
      );
      fireEvent.click(
        within(lines()).getByRole('button', {
          name: 'Remove line 1 from gate-claims',
        })
      );
      refresh({ current: false });
    }
    fireEvent.click(
      within(lines()).getByRole('button', {
        name: 'Edit line 1 of gate-claims',
      })
    );
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
          name: /^Remove /,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Apply gate-claims to…' })
    ).toBeNull();
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

/** The conversations site's read-back with the sentence at `path` replaced:
 * words the YAML never holds, so a card that shows them read the engine. */
function withSentences(sentences: Record<string, string>): ReadBack {
  const engine = conversationsSiteReadBack();
  const seen = new Set<string>();
  for (const group of engine.sections.flatMap((section) => section.groups))
    for (const statement of group.statements)
      if (statement.path in sentences) {
        statement.sentence = sentences[statement.path]!;
        seen.add(statement.path);
      }
  expect([...seen].sort()).toEqual(Object.keys(sentences).sort());
  return engine;
}

const card = (n: number) =>
  screen.getByRole('article', { name: `Line ${n} of gate-claims` });

describe('a card per line (rpg-project#1030)', () => {
  it('a closed card’s face is built from the engine’s connections; each item’s tooltip is its sentence', () => {
    const line = 'conversations.gate-claims.lines[0]';
    const engine = withSentences({
      [`${line}.requires[0]`]: 'ENGINE SAYS: offered once the moon is up.',
    });
    // The engine names a fact the file does not: the clause says the
    // engine's id, so it was read from the connection, not the YAML.
    for (const group of engine.sections.flatMap((section) => section.groups))
      for (const statement of group.statements)
        if (statement.path === `${line}.requires[0]`)
          statement.connects[0]!.id = 'moon-up';
    renderPage(engine);
    const offered = within(card(1)).getByRole('group', {
      name: 'Offered when, line 1 of gate-claims',
    });
    const clause = within(offered).getByText('moon-up').closest('[title]')!;
    expect(clause.textContent).toBe('knows moon-up');
    expect(clause.getAttribute('title')).toBe(
      'ENGINE SAYS: offered once the moon is up.'
    );
    expect(offered.textContent).not.toContain('feast-tonight');
    // The full sentence is in the card's details, not on its face.
    const words = card(1).querySelector('details')!;
    expect(words.textContent).toContain(
      'ENGINE SAYS: offered once the moon is up.'
    );
    // No form is open: the cards are closed.
    expect(screen.queryByLabelText('Line 1 for gate-claims')).toBeNull();
  });

  it('on the castle, the troupe card is short: two offered-when clauses, two difficulties, no speech range on its face', () => {
    renderPage(castleConversationsReadBack(), castle);
    fireEvent.click(screen.getByRole('button', { name: /^the-gate/ }));
    const troupe = screen.getByRole('article', {
      name: 'Line 1 of the-gate',
    });
    expect(troupe.textContent).toContain(
      '“We’re the troupe for tonight’s feast.”'
    );
    const offered = within(troupe).getByRole('group', {
      name: 'Offered when, line 1 of the-gate',
    });
    // The engine also says this line's requirements as a way through the
    // gate, as the fact's hub and once per carrier; only the line's own two
    // are its clauses.
    expect(
      [...offered.querySelectorAll('.es-line-card-item')].map(
        (item) => item.textContent
      )
    ).toEqual(['knows feast-tonight', 'front-gate is fresh or warned-guest']);
    expect(offered.textContent).not.toContain('more');
    for (const [ability, dc] of [
      ['Performance', '13'],
      ['Deception', '15'],
    ] as const)
      expect(
        (
          within(troupe).getByLabelText(
            `${ability} difficulty, line 1 of the-gate`
          ) as HTMLInputElement
        ).value
      ).toBe(dc);
    const face = troupe.cloneNode(true) as HTMLElement;
    face.querySelector('details')!.remove();
    expect(face.textContent).not.toContain('its words reach');
    expect(face.textContent).not.toContain('Guard (gate-1)');
    // The engine's words are one disclosure away.
    expect(troupe.querySelector('details')!.textContent).toContain(
      'its words reach'
    );
    const pass = within(troupe).getByRole('region', { name: 'On a pass' });
    expect(pass.textContent).toContain('Through to the hall, then.');
    expect(pass.textContent).toContain('advances front-gate: admitted');
  });

  it('a carrier’s own line is the same card, under “Only Guard Captain offers”, and its difficulty writes at the captain', () => {
    const { sharedLines, written, before } = renderPage(
      castleConversationsReadBack(),
      castle
    );
    fireEvent.click(screen.getByRole('button', { name: /^the-gate/ }));
    const captain = screen.getByRole('region', {
      name: 'Only Guard Captain offers',
    });
    const guest = within(captain).getByRole('article', {
      name: 'Line 1 of Guard Captain',
    });
    expect(guest.textContent).toContain(
      '“We’re invited guests of His Majesty, here for the feast.”'
    );
    const dc = within(guest).getByLabelText(
      'Persuasion difficulty, line 1 of Guard Captain'
    ) as HTMLInputElement;
    expect(dc.value).toBe('11');
    fireEvent.change(dc, { target: { value: '12' } });
    expect(sharedLines.setOwnLine).toHaveBeenCalledTimes(1);
    expect(sharedLines.setOwnLine.mock.calls[0]!.slice(0, 2)).toEqual([
      { kind: 'creature', id: 'captain' },
      0,
    ]);
    expect(sharedLines.setLines).not.toHaveBeenCalled();
    // One line of the file changed: the captain's own `guest` difficulty.
    const changed = changedLines(before, written());
    expect(changed).toHaveLength(1);
    expect(changed[0]!.trim()).toBe('dc: 12');
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const guestLine = saved.draft.room.monsterBindings!.captain!.options![0]!;
    expect(guestLine).toMatchObject({ id: 'guest' });
    expect((guestLine as OptionShape).check).toEqual([
      { ability: 'persuasion', dc: 12 },
    ]);
    expect(saved.scope.unread!.conversations).toEqual(
      read(castle).scope.unread!.conversations
    );
  });

  it('Edit on a carrier’s own line opens the carrier’s form for that line only', () => {
    renderPage(castleConversationsReadBack(), castle);
    fireEvent.click(screen.getByRole('button', { name: /^the-gate/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 1 of Guard Captain' })
    );
    expect(
      (screen.getByLabelText('Line 1 for captain') as HTMLTextAreaElement).value
    ).toBe('We’re invited guests of His Majesty, here for the feast.');
    expect(screen.queryByLabelText('Line 1 for the-gate')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 1 of the-gate' })
    );
    expect(screen.queryByLabelText('Line 1 for captain')).toBeNull();
  });

  it('a connection the card does not know is counted as “+1 more”, which opens the engine’s words', () => {
    const engine = castleConversationsReadBack();
    for (const group of engine.sections.flatMap((section) => section.groups))
      for (const statement of group.statements)
        if (
          statement.path === 'conversations.the-gate.lines[0].success[0]' &&
          statement.about?.kind === 'shared-lines'
        )
          statement.connects.push(
            create(ReadBackConnectionSchema, {
              kind: 'omen',
              id: 'red-moon',
              role: 'portends',
            })
          );
    renderPage(engine, castle);
    fireEvent.click(screen.getByRole('button', { name: /^the-gate/ }));
    const troupe = screen.getByRole('article', {
      name: 'Line 1 of the-gate',
    });
    const pass = within(troupe).getByRole('region', { name: 'On a pass' });
    expect(pass.textContent).not.toContain('red-moon');
    const more = within(pass).getByRole('button', { name: /^1 more/ });
    expect(more.textContent).toBe('+1 more');
    expect(
      within(troupe).getByRole('region', { name: 'On a miss' }).textContent
    ).not.toContain('more');
    const words = troupe.querySelector('details')!;
    expect(words.open).toBe(false);
    fireEvent.click(more);
    expect(words.open).toBe(true);
  });

  it('the check is on the surface, each way’s difficulty a number; a line with none says so', () => {
    renderPage();
    const check = within(card(1)).getByRole('group', {
      name: 'Check of line 1 of gate-claims',
    });
    expect(check.textContent).toContain('Check, best of');
    expect(
      (
        within(check).getByLabelText(
          'Performance difficulty, line 1 of gate-claims'
        ) as HTMLInputElement
      ).value
    ).toBe('13');
    expect(
      (
        within(check).getByLabelText(
          'Deception difficulty, line 1 of gate-claims'
        ) as HTMLInputElement
      ).value
    ).toBe('15');
    expect(
      within(card(2)).getByRole('group', {
        name: 'Check of line 2 of gate-claims',
      }).textContent
    ).toBe('No check');
  });

  it('a new difficulty on a closed card is one write, at that way’s dc', () => {
    const { sharedLines, written } = renderPage();
    const before = written();
    fireEvent.change(
      screen.getByLabelText('Deception difficulty, line 1 of gate-claims'),
      { target: { value: '16' } }
    );
    expect(sharedLines.setLines).toHaveBeenCalledTimes(1);
    expect(sharedLines.setLines.mock.calls[0]![0]).toBe('gate-claims');
    // Only `conversations.gate-claims.lines[0].check[1].dc` changed.
    expect(changedLines(before, written())).toEqual(['            dc: 16']);
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const lines = (
      saved.scope.unread!.conversations as Record<
        string,
        { lines: OptionShape[] }
      >
    )['gate-claims']!.lines;
    expect(lines[0]!.check).toEqual([
      { ability: 'performance', dc: 13 },
      { ability: 'deception', dc: 16 },
    ]);
  });

  it('Edit opens only that line’s form, in place; one line is open at a time', () => {
    renderPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 2 of gate-claims' })
    );
    expect(
      (
        within(card(2)).getByLabelText(
          'Line 2 for gate-claims'
        ) as HTMLTextAreaElement
      ).value
    ).toBe('We’ll come quietly.');
    for (const n of [1, 3, 4])
      expect(screen.queryByLabelText(`Line ${n} for gate-claims`)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 3 of gate-claims' })
    );
    expect(screen.getByLabelText('Line 3 for gate-claims')).toBeTruthy();
    expect(screen.queryByLabelText('Line 2 for gate-claims')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Done editing line 3 of gate-claims' })
    );
    expect(screen.queryByLabelText('Line 3 for gate-claims')).toBeNull();
  });

  it('“+ apply to…” offers only who does not carry it yet, grouped', () => {
    renderPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply gate-claims to…' })
    );
    const picker = screen.getByRole('group', {
      name: 'Apply gate-claims to',
    });
    const offered = within(picker)
      .getAllByRole('button')
      .map((button) => button.getAttribute('title'))
      .filter((id): id is string => id !== null);
    for (const applied of ['gate-1', 'gate-2', 'captain'])
      expect(offered).not.toContain(applied);
    expect(
      within(
        within(picker).getByRole('region', { name: 'Factions' })
      ).getByRole('button', { name: 'Apply gate-claims to faction watch' })
    ).toBeTruthy();
  });

  it('while the check is behind the draft, a just-added line is a card with its words and “checking…”', () => {
    const { refresh } = renderPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a line to gate-claims' })
    );
    refresh({ current: false });
    // The new line opens to be written; its words come from the draft.
    fireEvent.change(screen.getByLabelText('Line 5 for gate-claims'), {
      target: { value: 'Is the cook in?' },
    });
    refresh({ current: false });
    fireEvent.click(
      screen.getByRole('button', { name: 'Done editing line 5 of gate-claims' })
    );
    expect(card(5).textContent).toContain('“Is the cook in?”');
    expect(card(5).textContent).toContain('checking…');
    // A line the engine read before is not shown with sentences that may be
    // of another draft.
    expect(card(1).textContent).toContain('checking…');
    expect(card(1).textContent).not.toContain('On a win of the line');
  });
});

/** The castle's page with `name` chosen. */
function castlePage(name = 'the-gate', engine = castleConversationsReadBack()) {
  const page = renderPage(engine, castle);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  return page;
}

/** The card whose headline says `words`. */
const cardSaying = (words: string): HTMLElement =>
  screen
    .getAllByRole('article')
    .find((article) =>
      article.querySelector('.es-line-card-say')!.textContent!.includes(words)
    )!;

describe('the review of the line cards (rpg-project#1030)', () => {
  it('weighted replies: one is picked, each with its share and its own chips', () => {
    castlePage();
    const stand = cardSaying('Stand aside or bleed.');
    const pass = within(stand).getByRole('region', { name: 'On a pass' });
    expect(pass.textContent).toContain('One of:');
    const replies = [...pass.querySelectorAll('.es-line-card-reply')];
    expect(replies.map((reply) => reply.textContent)).toEqual([
      '3 in 4…go on, then. I saw nothing.teaches gate-cowed',
      '1 in 4Big words. GUARDS!teaches party-recognized',
    ]);
    // A single reply has no share.
    const miss = within(stand).getByRole('region', { name: 'On a miss' });
    expect(miss.textContent).not.toContain('One of:');
    expect(miss.textContent).not.toContain(' in ');
  });

  it('a shouted reply says so', () => {
    castlePage();
    const never = cardSaying('You will never take me alive.');
    expect(
      within(never).getByRole('region', { name: 'When it is said' }).textContent
    ).toContain('shouted');
  });

  it('a give says who it goes to', () => {
    castlePage('past-the-gate');
    const gives = screen
      .getAllByRole('article')
      .flatMap((article) => [
        ...article.querySelectorAll('.es-line-card-chips li'),
      ])
      .map((chip) => chip.textContent);
    expect(gives).toContain(
      'gives admitted about the party in sight to the one spoken to and carriers who witnessed it'
    );
  });

  it('a reply’s activity is a chip', () => {
    // The castle's activities are prisoner-1's own copy, which carries no
    // conversation; the engine gives an activity no connection either way,
    // so the row's value is read where the engine names the row.
    const answer = '          - say: Then we do this the hard way. To arms!\n';
    expect(castle.split(answer)).toHaveLength(2);
    renderPage(
      castleConversationsReadBack(),
      castle.replace(
        answer,
        `${answer}            activity: {ref: 'dnd5e:activities:thoughtful', cycles: 2}\n`
      )
    );
    fireEvent.click(screen.getByRole('button', { name: /^the-gate/ }));
    const chips = screen
      .getAllByRole('article')
      .flatMap((article) => [
        ...article.querySelectorAll('.es-line-card-chips li'),
      ])
      .map((chip) => chip.textContent);
    expect(chips).toContain('plays thoughtful ×2');
  });

  it('a connection on the step the card does not know is counted as “+1 more”', () => {
    const engine = castleConversationsReadBack();
    for (const group of engine.sections.flatMap((section) => section.groups))
      for (const statement of group.statements)
        if (
          statement.path === 'conversations.the-gate.lines[0].advance' &&
          statement.about?.kind === 'shared-lines'
        )
          statement.connects.push(
            create(ReadBackConnectionSchema, {
              kind: 'omen',
              id: 'red-moon',
              role: 'portends',
            })
          );
    castlePage('the-gate', engine);
    const troupe = screen.getByRole('article', { name: 'Line 1 of the-gate' });
    expect(
      within(
        within(troupe).getByRole('region', { name: 'On a pass' })
      ).getByRole('button', { name: /^1 more/ })
    ).toBeTruthy();
  });

  it('an own line is never written over a `use:` entry', () => {
    const result = read(castle);
    const document: RoomDraftDocument = {
      draft: result.draft,
      scope: result.scope,
    };
    const before = JSON.stringify(document);
    // The captain's `use: the-gate` is his second entry.
    expect(result.draft.room.monsterBindings!.captain!.options![1]).toEqual({
      use: 'the-gate',
    });
    expect(() =>
      editCarrierLine(document, { kind: 'creature', id: 'captain' }, 1, {
        id: 'x',
        say: 'Overwritten.',
      })
    ).toThrow(/no longer says its own line/);
    expect(() =>
      editCarrierLine(document, { kind: 'creature', id: 'captain' }, 1, null)
    ).toThrow(/no longer says its own line/);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('while the check is behind, a carrier’s `use:` is never shown as an own line', () => {
    const { refresh } = castlePage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 1 of Guard Captain' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove line 1 from captain' })
    );
    refresh({ current: false });
    const captain = screen.getByRole('region', {
      name: 'Only Guard Captain offers',
    });
    expect(captain.textContent).not.toContain('Nothing said yet');
    expect(captain.textContent).toContain('no longer holds here');
  });

  it('a difficulty that is not a whole number, 0 or more, is not written and the field says why', () => {
    const { sharedLines } = castlePage();
    const dc = screen.getByLabelText(
      'Performance difficulty, line 1 of the-gate'
    ) as HTMLInputElement;
    for (const typed of ['', '-3', '12.5']) {
      fireEvent.change(dc, { target: { value: typed } });
      expect(sharedLines.setLines).not.toHaveBeenCalled();
      expect(dc.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert').textContent).toBe(DIFFICULTY_REFUSAL);
    }
    fireEvent.change(dc, { target: { value: '0' } });
    expect(sharedLines.setLines).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refusal keeps the last words, marked, and shows on the card it concerns', () => {
    const { refresh } = castlePage();
    refresh({
      current: false,
      check: {
        state: 'refused',
        refusals: [
          {
            path: 'conversations.the-gate.lines[0].check[0].dc',
            message: 'a difficulty is a whole number of at least 1',
          },
        ],
      },
    });
    const troupe = screen.getByRole('article', { name: 'Line 1 of the-gate' });
    expect(troupe.textContent).toContain(STALE_LINE_SENTENCE);
    expect(
      within(troupe).getByRole('group', {
        name: 'Offered when, line 1 of the-gate',
      }).textContent
    ).toContain('knows feast-tonight');
    expect(
      within(troupe).getByRole('list', {
        name: 'The engine’s refusals in line 1 of the-gate',
      }).textContent
    ).toBe('a difficulty is a whole number of at least 1');
    const quietly = screen.getByRole('article', {
      name: 'Line 2 of the-gate',
    });
    expect(
      within(quietly).queryByRole('list', {
        name: /The engine’s refusals/,
      })
    ).toBeNull();
  });

  it('own-line cards number consecutively by the carrier’s name', () => {
    castlePage();
    const captain = screen.getByRole('region', {
      name: 'Only Guard Captain offers',
    });
    const labels = within(captain)
      .getAllByRole('article')
      .map((article) => article.getAttribute('aria-label'));
    expect(labels.length).toBeGreaterThan(1);
    expect(labels).toEqual(
      labels.map((_, at) => `Line ${at + 1} of Guard Captain`)
    );
  });
});

describe('authoring a line (rpg-project#1033)', () => {
  it('the last way of a check can be removed: the line then has no check, and its replies are “When it is said”', () => {
    const { written, refresh } = castlePage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 1 of the-gate' })
    );
    for (let i = 0; i < 2; i++) {
      refresh();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove approach 0 from line 1 of the-gate',
        })
      );
    }
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const troupe = (
      saved.scope.unread!.conversations as Record<
        string,
        { lines: OptionShape[] }
      >
    )['the-gate']!.lines[0]!;
    expect(Object.hasOwn(troupe, 'check')).toBe(false);
  });

  it('a line with no check heads its replies “When it is said” in the form', () => {
    castlePage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 2 of the-gate' })
    );
    const form = screen.getByRole('article', { name: 'Line 2 of the-gate' });
    expect(form.textContent).toContain('When it is said');
    expect(form.textContent).not.toContain('When the check is beaten');
    expect(form.textContent).not.toContain('When the check is missed');
  });

  it('choosing a conversation picks no step; each step says what it does; choosing one is one write', () => {
    const { sharedLines, written } = castlePage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit line 3 of the-gate' })
    );
    // `never-alive` advances nothing.
    expect(
      (
        screen.getByLabelText(
          'Line 3 advances conversation for the-gate'
        ) as HTMLSelectElement
      ).value
    ).toBe('');
    fireEvent.change(
      screen.getByLabelText('Line 3 advances conversation for the-gate'),
      { target: { value: 'front-gate' } }
    );
    expect(sharedLines.setLines).not.toHaveBeenCalled();
    const step = screen.getByLabelText(
      'Line 3 on a win steps for the-gate'
    ) as HTMLSelectElement;
    expect(step.value).toBe('');
    expect(step.options[0]!.textContent).toBe('choose a step…');
    const words = new Map(
      [...step.options].map((option) => [option.value, option.textContent])
    );
    expect(words.get('admitted')).toBe(
      'admitted: fresh or warned-guest or warned-troupe → admitted'
    );
    expect(words.get('troupe-failed')).toBe(
      'troupe-failed: fresh → warned-troupe; warned-guest → arrested'
    );
    fireEvent.change(step, { target: { value: 'came-quietly' } });
    expect(sharedLines.setLines).toHaveBeenCalledTimes(1);
    const saved = readDraftYaml(written());
    if (!saved.ok) throw new Error(saved.refusal);
    const never = (
      saved.scope.unread!.conversations as Record<
        string,
        { lines: (OptionShape & { advance?: unknown })[] }
      >
    )['the-gate']!.lines[2]!;
    expect(never.advance).toEqual({
      interaction: 'front-gate',
      success: 'came-quietly',
    });
  });
});
