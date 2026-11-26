import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  SayStatusResponseSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import { hailSiteReadBack } from './fixtures/engineReadBack';
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
