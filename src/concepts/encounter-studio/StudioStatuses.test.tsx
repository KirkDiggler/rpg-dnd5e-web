import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  SayStatusResponseSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import { hailSiteReadBack, statusWordsV240 } from './fixtures/engineReadBack';
import site from './fixtures/hail-site.yaml?raw';
import { StudioStatuses } from './StudioStatuses';
import type { StatusSaidClient } from './useStatusSaid';

afterEach(cleanup);

function hailDocument(): RoomDraftDocument {
  const result = readDraftYaml(site);
  if (!result.ok) throw new Error(result.refusal);
  return { draft: result.draft, scope: result.scope };
}

const answered = {
  readBack: hailSiteReadBack(),
  readBackIsCurrent: true,
  unavailable: null,
};
const unanswered = {
  readBack: null,
  readBackIsCurrent: false,
  unavailable: null,
};

function show(
  readBack: typeof answered | typeof unanswered,
  onJump = vi.fn()
): { onJump: ReturnType<typeof vi.fn> } {
  render(
    <StudioStatuses
      document={hailDocument()}
      readBack={readBack}
      focus="welcomed"
      onSelect={vi.fn()}
      onJump={onJump}
    />
  );
  return { onJump };
}

describe('StudioStatuses', () => {
  it('lists the status by its name and shows the engine’s sentence and the block as written', () => {
    show(answered);
    expect(screen.getByRole('button', { name: /^Welcomed\b/ })).toBeTruthy();
    const page = screen.getByRole('region', { name: 'Status effects' });
    expect(page.textContent).toContain('is a status effect a line');
    expect(screen.getByText('As written')).toBeTruthy();
    expect(page.querySelector('pre')!.textContent).toMatch(/^welcomed:/);
  });

  // catches: the giver shown as text only, or a jump to the wrong thing
  it('Given by names the giver and pressing it jumps to that creature', () => {
    const { onJump } = show(answered);
    expect(screen.getByText('Given by')).toBeTruthy();
    expect(screen.getByText(/gives it to speaker/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'creature porter' }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]![0]).toEqual({
      kind: 'creature',
      id: 'porter',
    });
  });

  it('a giver the studio cannot jump to is shown as plain text, never dropped', () => {
    const document = hailDocument();
    const readBack = hailSiteReadBack();
    for (const section of readBack.sections)
      for (const group of section.groups)
        for (const statement of group.statements)
          if (statement.kind === 'line.grant' && statement.about)
            statement.about.kind = 'unheard-of';
    render(
      <StudioStatuses
        document={document}
        readBack={{ ...answered, readBack }}
        focus="welcomed"
        onSelect={vi.fn()}
        onJump={vi.fn()}
      />
    );
    expect(screen.getByText('unheard-of porter')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'unheard-of porter' })
    ).toBeNull();
  });

  it('says when no line gives it, once the engine has answered', () => {
    const readBack = hailSiteReadBack();
    for (const section of readBack.sections)
      for (const group of section.groups)
        group.statements = group.statements.filter(
          (statement) => statement.kind !== 'line.grant'
        );
    render(
      <StudioStatuses
        document={hailDocument()}
        readBack={{ ...answered, readBack }}
        focus="welcomed"
        onSelect={vi.fn()}
        onJump={vi.fn()}
      />
    );
    expect(screen.getByText('No line gives it.')).toBeTruthy();
  });

  // catches: claiming nobody gives it before the engine answered
  it('before the engine answers it lists the status and claims nothing', () => {
    show(unanswered);
    expect(screen.getByRole('button', { name: /^Welcomed\b/ })).toBeTruthy();
    expect(screen.getByText('As written')).toBeTruthy();
    expect(
      screen.getAllByText('The engine has not said the status effects yet.')
        .length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Given by')).toBeNull();
    expect(screen.queryByText('No line gives it.')).toBeNull();
  });
});

describe('StudioStatuses, further cases', () => {
  const edited = (
    edit: (statement: { kind: string; connects: { kind: string }[] }) => void
  ) => {
    const readBack = hailSiteReadBack();
    for (const section of readBack.sections)
      for (const group of section.groups)
        for (const statement of group.statements)
          if (statement.kind === 'line.grant') edit(statement);
    return { ...answered, readBack };
  };

  // catches: a giver jump with the wrong or extra arguments
  it('pressing a giver calls the jump with exactly that giver’s target', () => {
    const { onJump } = show(answered);
    fireEvent.click(screen.getByRole('button', { name: 'creature porter' }));
    expect(onJump.mock.calls).toEqual([[{ kind: 'creature', id: 'porter' }]]);
  });

  it('a giver inside a conversation jumps to that conversation', () => {
    const document = hailDocument();
    document.scope = {
      ...document.scope,
      unread: {
        ...document.scope.unread,
        interactions: { 'front-gate': { lines: [] } },
      },
    };
    const readBack = hailSiteReadBack();
    for (const section of readBack.sections)
      for (const group of section.groups)
        for (const statement of group.statements)
          if (statement.kind === 'line.grant' && statement.about) {
            statement.about.kind = 'conversation';
            statement.about.id = 'front-gate';
          }
    const onJump = vi.fn();
    render(
      <StudioStatuses
        document={document}
        readBack={{ ...answered, readBack }}
        focus="welcomed"
        onSelect={vi.fn()}
        onJump={onJump}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'conversation front-gate' })
    );
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]![0]).toMatchObject({
      kind: 'home',
      section: 'interactions',
      id: 'front-gate',
    });
  });

  // catches: a dangling "gives it to" when the line names no receiver
  it('a giving line with no receiver is listed without "gives it to"', () => {
    const readBack = edited((s) => {
      s.connects = s.connects.filter((c) => c.kind !== 'who');
    });
    render(
      <StudioStatuses
        document={hailDocument()}
        readBack={readBack}
        focus="welcomed"
        onSelect={vi.fn()}
        onJump={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'creature porter' })
    ).toBeTruthy();
    expect(screen.queryByText(/gives it to/)).toBeNull();
  });

  // catches: giver rows keyed by path alone (a repeated path collides)
  it('two giving lines at one path render without a key collision', () => {
    const readBack = hailSiteReadBack();
    for (const section of readBack.sections)
      for (const group of section.groups) {
        const grant = group.statements.find((s) => s.kind === 'line.grant');
        if (grant) group.statements.push(structuredClone(grant));
      }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <StudioStatuses
          document={hailDocument()}
          readBack={{ ...answered, readBack }}
          focus="welcomed"
          onSelect={vi.fn()}
          onJump={vi.fn()}
        />
      );
      expect(
        screen.getAllByRole('button', { name: 'creature porter' })
      ).toHaveLength(2);
      expect(
        errors.mock.calls.filter((c) => String(c[0]).includes('same key'))
      ).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  // catches: the page saying the site has none when the file holds statuses
  it('statuses that are not a mapping are shown as written, never as "has none"', () => {
    const document = hailDocument();
    document.scope = {
      ...document.scope,
      unread: { ...document.scope.unread, statuses: 'welcomed, stunned' },
    };
    render(
      <StudioStatuses
        document={document}
        readBack={answered}
        focus={null}
        onSelect={vi.fn()}
        onJump={vi.fn()}
      />
    );
    expect(screen.getByText(/not a list of statuses/)).toBeTruthy();
    expect(document.scope.unread).toBeDefined();
    expect(screen.getByText(/statuses: welcomed, stunned/)).toBeTruthy();
    expect(screen.queryByText('This site has no status effects.')).toBeNull();
  });

  describe('what the engine says of it', () => {
    const asked = (
      answer: () => ReturnType<StatusSaidClient['sayStatus']>,
      focus = 'welcomed'
    ) => {
      const client = {
        sayStatus: vi.fn(answer),
      } as unknown as StatusSaidClient;
      const ui = (f: string) => (
        <StudioStatuses
          document={hailDocument()}
          readBack={answered}
          focus={f}
          onSelect={vi.fn()}
          client={client}
          enabled
        />
      );
      const view = render(ui(focus));
      return { client, view, ui };
    };

    // catches: the sentence below "As written", or not shown
    it('the sentence shows above "As written", with a line per part when there are several', async () => {
      asked(() =>
        Promise.resolve(
          create(SayStatusResponseSchema, {
            name: 'Welcomed',
            sentence: 'Welcomed changes nothing it cannot.',
            parts: [
              { path: 'a', text: 'first part' },
              { path: 'b', text: 'second part' },
            ],
          })
        )
      );
      const sentence = await screen.findByText(
        'Welcomed changes nothing it cannot.'
      );
      const heading = screen.getByText('What it does');
      const written = screen.getByText('As written');
      expect(
        heading.compareDocumentPosition(written) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        sentence.compareDocumentPosition(written) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(screen.getByText('first part')).toBeTruthy();
      expect(screen.getByText('second part')).toBeTruthy();
    });

    // catches: a refusal shown as a sentence, or its place dropped
    it('a refusal shows each path and message and no sentence', async () => {
      asked(() =>
        Promise.resolve(
          create(SayStatusResponseSchema, {
            sentence: 'must not show',
            errors: [
              create(FieldErrorSchema, {
                path: 'changes[0].cannot[1]',
                message: 'is not a thing',
              }),
              create(FieldErrorSchema, { path: 'name', message: 'is empty' }),
            ],
          })
        )
      );
      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((a) => a.textContent)).toEqual([
        'changes[0].cannot[1]: is not a thing',
        'name: is empty',
      ]);
      expect(screen.queryByText('must not show')).toBeNull();
    });

    // catches: an unreachable engine shown as nothing, or a made-up sentence
    it('an engine that cannot be asked says so in one line', async () => {
      asked(() => Promise.reject(new Error('boom')));
      expect(
        await screen.findByText('The engine could not be asked: Error: boom.')
      ).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    // catches: the previous status's sentence shown while the next loads
    it('while the next status loads, nothing of the previous one shows', async () => {
      const { view, ui } = asked(() =>
        Promise.resolve(create(SayStatusResponseSchema, { sentence: 'one' }))
      );
      await screen.findByText('one');
      // The same document, another status: its answer never arrives.
      const document = hailDocument();
      const statuses = document.scope.unread!.statuses as Record<
        string,
        unknown
      >;
      statuses.second = { name: 'Second' };
      const client = {
        sayStatus: vi.fn(() => new Promise(() => undefined)),
      } as unknown as StatusSaidClient;
      view.rerender(
        <StudioStatuses
          document={document}
          readBack={answered}
          focus="second"
          onSelect={vi.fn()}
          client={client}
          enabled
        />
      );
      await waitFor(() => expect(client.sayStatus).toHaveBeenCalled());
      expect(screen.queryByText('one')).toBeNull();
      expect(screen.queryByText('What it does')).toBeNull();
      void ui;
    });

    // catches: the block removed while loading (it blinks and the form jumps)
    it('changing the words of the same status keeps the last sentence, busy, until the new one comes', async () => {
      let release: (v: unknown) => void = () => undefined;
      let calls = 0;
      const client = {
        sayStatus: vi.fn(() =>
          calls++ === 0
            ? Promise.resolve(
                create(SayStatusResponseSchema, { sentence: 'one' })
              )
            : new Promise((resolve) => {
                release = resolve;
              })
        ),
      } as unknown as StatusSaidClient;
      const ui = (document: RoomDraftDocument) => (
        <StudioStatuses
          document={document}
          readBack={answered}
          focus="welcomed"
          onSelect={vi.fn()}
          client={client}
          enabled
        />
      );
      const view = render(ui(hailDocument()));
      await screen.findByText('one');
      expect(
        screen.queryByText('The engine is reading the change.')
      ).toBeNull();
      const changed = hailDocument();
      (
        (changed.scope.unread!.statuses as Record<string, unknown>)
          .welcomed as Record<string, unknown>
      ).name = 'Renamed';
      view.rerender(ui(changed));
      await waitFor(() => expect(client.sayStatus).toHaveBeenCalledTimes(2));
      const block = screen.getByText('one').closest('.es-status-said')!;
      expect(block.classList.contains('es-said-again')).toBe(true);
      expect(block.getAttribute('aria-busy')).toBe('true');
      screen.getByText('The engine is reading the change.');
      act(() => release(create(SayStatusResponseSchema, { sentence: 'two' })));
      await screen.findByText('two');
      expect(screen.queryByText('one')).toBeNull();
      expect(
        screen.queryByText('The engine is reading the change.')
      ).toBeNull();
      expect(
        screen
          .getByText('two')
          .closest('.es-status-said')!
          .getAttribute('aria-busy')
      ).toBeNull();
    });

    it('not enabled asks nothing and shows nothing', () => {
      const client = { sayStatus: vi.fn() } as unknown as StatusSaidClient;
      render(
        <StudioStatuses
          document={hailDocument()}
          readBack={answered}
          focus="welcomed"
          onSelect={vi.fn()}
          client={client}
        />
      );
      expect(client.sayStatus).not.toHaveBeenCalled();
      expect(screen.queryByText('What it does')).toBeNull();
    });
  });
});

describe('StudioStatuses: the Change form (rpg-project#1220)', () => {
  const words = statusWordsV240();
  type Edit = (status: Record<string, unknown>) => Record<string, unknown>;
  const plain = answered;
  const abilityName = /only when the ability is/;

  const mountForm = (
    props: Partial<React.ComponentProps<typeof StudioStatuses>> = {}
  ) => {
    const onCommitStatus = vi.fn<(id: string, edit: Edit) => boolean>(
      () => true
    );
    render(
      <StudioStatuses
        document={hailDocument()}
        readBack={plain}
        focus="welcomed"
        onSelect={vi.fn()}
        statusWords={words}
        onCommitStatus={onCommitStatus}
        {...props}
      />
    );
    return { onCommitStatus };
  };

  // catches: Save/Discard back on a form that writes as it goes; a help line
  // shown where there is no form
  it('has no Save and no Discard, and the help line shows only with the form', () => {
    mountForm();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Discard$/ })).toBeNull();
    expect(
      screen.getByText(
        'Each change is written as you make it. Undo takes it back.'
      )
    ).toBeTruthy();
    cleanup();
    mountForm({ statusWords: null });
    expect(screen.queryByText(/Each change is written/)).toBeNull();
  });

  // catches: the form not drawn for the selected status, or a commit that
  // names the wrong status or fires more than once
  it('changing the ability to wisdom calls the intent once for that status', () => {
    const { onCommitStatus } = mountForm();
    fireEvent.change(screen.getByRole('combobox', { name: abilityName }), {
      target: { value: 'wisdom' },
    });
    expect(onCommitStatus).toHaveBeenCalledTimes(1);
    expect(onCommitStatus.mock.calls[0]![0]).toBe('welcomed');
  });

  // catches: the edit built from the block drawn, not the live block
  it('the edit keeps a change made since the form was drawn', () => {
    const { onCommitStatus } = mountForm();
    fireEvent.change(screen.getByRole('combobox', { name: abilityName }), {
      target: { value: 'wisdom' },
    });
    const edit = onCommitStatus.mock.calls[0]![1];
    const live = {
      name: 'Welcomed',
      changes: [{ advantage: 'checks', when: { ability: 'charisma' } }],
      maintenance: [{ ends_on: 'rest' }],
      again: 'ignored',
      extra: 'made elsewhere',
    };
    const next = edit(live);
    expect(next.extra).toBe('made elsewhere');
    expect(next.changes).toEqual([
      { advantage: 'checks', when: { ability: 'wisdom' } },
    ]);
  });

  // catches: a silent empty panel when the engine gave no words
  it('with no words it says so with the reason and draws no form', () => {
    mountForm({
      statusWords: null,
      statusWordsUnavailable: 'the engine has no status words',
    });
    expect(
      screen.getByText(
        /cannot be changed here\. the engine has no status words/
      )
    ).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: abilityName })).toBeNull();
  });

  // catches: a form drawn over text, or "As written" hiding the text
  it('a status written as text says it is not a block and still shows it', () => {
    const document = hailDocument();
    document.scope = {
      ...document.scope,
      unread: {
        ...document.scope.unread,
        statuses: { welcomed: 'stunned' },
      },
    };
    mountForm({ document });
    expect(screen.getByText(/is not written as a set of words/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: abilityName })).toBeNull();
    expect(screen.queryByText(/Each change is written/)).toBeNull();
    expect(screen.getByText('As written')).toBeTruthy();
    expect(screen.getByText(/welcomed: stunned/)).toBeTruthy();
  });

  // catches: a refusal at another status shown here, or one at this status lost
  it('a refusal under this status shows on it and one at another does not', () => {
    mountForm({
      refusals: [
        { path: 'statuses.welcomed.changes[0]', message: 'this one shows' },
        { path: 'statuses.welcomed', message: 'and this' },
        { path: 'statuses.other', message: 'not this' },
        { path: 'statuses.welcomedtoo', message: 'nor this' },
      ],
    });
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'this one shows',
      'and this',
    ]);
  });

  describe('what it does, three cases', () => {
    const said = (
      response: Parameters<typeof create<typeof SayStatusResponseSchema>>[1]
    ) =>
      render(
        <StudioStatuses
          document={hailDocument()}
          readBack={answered}
          focus="welcomed"
          onSelect={vi.fn()}
          enabled
          client={
            {
              sayStatus: vi.fn(() =>
                Promise.resolve(create(SayStatusResponseSchema, response))
              ),
            } as unknown as StatusSaidClient
          }
        />
      );

    // catches: ": message" with a bare colon when the engine names no place
    it('a refusal with no path shows the message alone', async () => {
      said({
        errors: [create(FieldErrorSchema, { path: '', message: 'bad' })],
      });
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('bad');
    });

    // catches: a bare "What it does" heading over nothing
    it('an answer with no sentence and no parts shows nothing', async () => {
      const client = {
        sayStatus: vi.fn(() =>
          Promise.resolve(create(SayStatusResponseSchema, { sentence: '' }))
        ),
      } as unknown as StatusSaidClient;
      render(
        <StudioStatuses
          document={hailDocument()}
          readBack={answered}
          focus="welcomed"
          onSelect={vi.fn()}
          enabled
          client={client}
        />
      );
      await waitFor(() => expect(client.sayStatus).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText('What it does')).toBeNull();
    });

    // catches: one part repeated as a one-item list under its own sentence
    it('an answer with exactly one part does not repeat it as a list', async () => {
      said({
        sentence: 'Welcomed does one thing.',
        parts: [{ path: 'a', text: 'the one part' }],
      });
      await screen.findByText('Welcomed does one thing.');
      expect(screen.queryByText('the one part')).toBeNull();
    });
  });
});

describe('StudioStatuses: new and delete (rpg-project#1221)', () => {
  const words = statusWordsV240();
  const nameLabel = words.words.find(
    (w) => w.place === 'status' && w.required && w.shape === 'text'
  )!.label;
  const mountNd = (
    props: Partial<React.ComponentProps<typeof StudioStatuses>> = {}
  ) => {
    const onAddStatus = vi.fn(() => true);
    const onRemoveStatus = vi.fn(() => true);
    const onSelect = vi.fn();
    render(
      <StudioStatuses
        document={hailDocument()}
        readBack={answered}
        focus="welcomed"
        onSelect={onSelect}
        statusWords={words}
        onAddStatus={onAddStatus}
        onRemoveStatus={onRemoveStatus}
        {...props}
      />
    );
    return { onAddStatus, onRemoveStatus, onSelect };
  };

  // catches: the name written under a word the engine did not name, or an untrimmed name, or no selection
  it('New status adds the trimmed name under the engine’s word and selects it', () => {
    const { onAddStatus, onSelect } = mountNd();
    const input = screen.getByRole('textbox', { name: nameLabel });
    fireEvent.change(input, { target: { value: '  Warmed Up ' } });
    screen.getByText('warmed-up');
    fireEvent.click(screen.getByRole('button', { name: 'New status' }));
    expect(onAddStatus).toHaveBeenCalledWith('warmed-up', {
      name: 'Warmed Up',
    });
    expect(onSelect).toHaveBeenCalledWith('warmed-up');
    expect((input as HTMLInputElement).value).toBe('');
  });

  // catches: a blank name making a status
  it('a blank name cannot be added', () => {
    const { onAddStatus } = mountNd();
    expect(
      (screen.getByRole('button', { name: 'New status' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(onAddStatus).not.toHaveBeenCalled();
  });

  // catches: a control drawn with no engine words, typing words the web does not have
  it('without the status words there is no New status control', () => {
    mountNd({ statusWords: null });
    expect(screen.queryByRole('button', { name: 'New status' })).toBeNull();
  });

  // catches: the Given by line missing, or after the button, or the button disabled
  it('Delete status says Given by N first and stays enabled', () => {
    const { onRemoveStatus } = mountNd();
    const del = screen.getByRole('button', { name: 'Delete status' });
    const line = screen.getByText(/^Given by 1\. Deleting it leaves/);
    expect(
      line.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect((del as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(del);
    expect(onRemoveStatus).toHaveBeenCalledWith('welcomed');
  });

  // catches: the Given by line drawn before the engine has said who gives it
  it('before the engine answers there is no Given by line', () => {
    mountNd({ readBack: unanswered });
    expect(screen.queryByText(/^Given by 1\./)).toBeNull();
    screen.getByRole('button', { name: 'Delete status' });
  });
});
