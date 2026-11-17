/**
 * BEHAVIOURS (rpg-project#970): every behaviour the file defines, from the
 * engine's read-back, with the engine's fold of what it does and who runs
 * it, each a jump. Building one is not this slice.
 */
import { create } from '@bufbuild/protobuf';
import { ReadBackUnsaidSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import {
  castleMachinesReadBack,
  castleRoutinesReadBack,
} from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { READ_BACK_VIEW_STORAGE_KEY } from './ReadBack';
import { StudioBehaviours } from './StudioBehaviours';
import type { StudioReadBack } from './studioPublishing';

afterEach(cleanup);

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();
const state = (readBackIsCurrent = true): StudioReadBack => ({
  readBack: castleRoutinesReadBack(),
  readBackIsCurrent,
  unavailable: null,
});
const panel = () => screen.getByRole('region', { name: 'Behaviours' });

describe('StudioBehaviours', () => {
  it('lists the castle’s ten behaviours, the engine’s fold of each and who runs it', () => {
    const onJump = vi.fn();
    render(
      <StudioBehaviours
        document={castle}
        readBack={state()}
        focus={null}
        onSelect={vi.fn()}
        onJump={onJump}
      />
    );
    const rows = within(
      within(panel()).getByRole('list', { name: 'Behaviours' })
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.dataset.routine)).toEqual([
      'captain-policy',
      'gate-1-policy',
      'gate-2-policy',
      'hall-1-policy',
      'keep-1-policy',
      'keep-2-policy',
      'reserve-1-policy',
      'reserve-2-policy',
      'sergeant-policy',
      'turnkey-policy',
    ]);
    expect(rows[0]!.textContent).toContain(
      'Routine `captain-policy` — run by Guard Captain (captain); starts in `ready`'
    );
    fireEvent.click(
      within(rows[0]!).getByRole('button', { name: 'Open creature captain' })
    );
    expect(onJump).toHaveBeenCalledWith({ kind: 'creature', id: 'captain' });
  });

  it('a selected behaviour opens to its Read back', () => {
    const onSelect = vi.fn();
    render(
      <StudioBehaviours
        document={castle}
        readBack={state()}
        focus="hall-1-policy"
        onSelect={onSelect}
      />
    );
    expect(
      within(panel()).getByRole('region', { name: 'Read back' }).textContent
    ).toContain('Routine `hall-1-policy`');
    fireEvent.click(
      within(panel()).getByRole('button', { name: /^captain-policy\b/ })
    );
    expect(onSelect).toHaveBeenCalledWith('captain-policy');
  });

  it('a stale read-back says so; none says the engine has not said them', () => {
    const { rerender } = render(
      <StudioBehaviours
        document={castle}
        readBack={state(false)}
        focus={null}
        onSelect={vi.fn()}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'These sentences are from the last draft that compiled.'
    );
    rerender(
      <StudioBehaviours
        document={castle}
        readBack={{
          readBack: null,
          readBackIsCurrent: false,
          unavailable: null,
        }}
        focus={null}
        onSelect={vi.fn()}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'The engine has not said the behaviours yet.'
    );
  });

  it('a behaviour no creature runs is still listed, with the engine’s own sentence and no Run by', () => {
    // hall-1 given keep-1-policy: the engine moves hall-1-policy out of the
    // Routines section into not-yet-said.
    const readBack = castleRoutinesReadBack();
    for (const section of readBack.sections)
      section.groups = section.groups.filter(
        (group) => group.about?.id !== 'hall-1-policy'
      );
    readBack.notYetSaid = [
      create(ReadBackUnsaidSchema, {
        path: 'behaviorDefinitions.hall-1-policy',
        kind: 'routine',
        why: 'no creature runs it, so it is not in the compiled encounter to be said',
      }),
    ];
    render(
      <StudioBehaviours
        document={castle}
        readBack={{ readBack, readBackIsCurrent: true, unavailable: null }}
        focus={null}
        onSelect={vi.fn()}
        onJump={vi.fn()}
      />
    );
    const row = within(panel())
      .getAllByRole('listitem')
      .find((item) => item.dataset.routine === 'hall-1-policy')!;
    expect(row.textContent).toContain(
      'no creature runs it, so it is not in the compiled encounter to be said'
    );
    expect(within(row).queryByText('Run by')).toBeNull();
    expect(
      within(panel())
        .getAllByRole('listitem')
        .map((item) => item.dataset.routine)
    ).toHaveLength(10);
  });

  describe('the machine (rpg-project#995)', () => {
    const machines = (): StudioReadBack => ({
      readBack: castleMachinesReadBack(),
      readBackIsCurrent: true,
      unavailable: null,
    });
    const drawing = () =>
      within(panel()).getByRole('group', {
        name: 'The machine of gate-1-policy',
      });
    const marked = () =>
      within(panel()).queryByRole('group', { name: 'Marked on the drawing' });

    it('draws the selected behaviour above the list, which stays', () => {
      render(
        <StudioBehaviours
          document={castle}
          readBack={machines()}
          focus="gate-1-policy"
          onSelect={vi.fn()}
        />
      );
      const states = within(drawing())
        .getAllByRole('button')
        .filter((mark) => mark.dataset.state)
        .map((mark) => mark.dataset.state);
      expect(states).toEqual(
        expect.arrayContaining([
          'posted',
          'alert',
          'challenged',
          'cowed',
          'turned',
        ])
      );
      expect(
        within(drawing()).getByRole('button', {
          name: 'State posted (starts here)',
        })
      ).toBeTruthy();
      expect(
        within(drawing()).getByRole('button', {
          name: 'State turned (no way out)',
        })
      ).toBeTruthy();
      const list = within(panel()).getByRole('list', { name: 'Behaviours' });
      expect(
        drawing().compareDocumentPosition(list) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it('clicking an arrow marks it and puts its sentences first in the detail', () => {
      render(
        <StudioBehaviours
          document={castle}
          readBack={machines()}
          focus="gate-1-policy"
          onSelect={vi.fn()}
        />
      );
      expect(marked()).toBeNull();
      const heard = within(drawing()).getByRole('button', {
        name: 'Step from posted to alert, on heard',
      });
      // Its sentence is reachable without a click: hover and a screen
      // reader's description.
      const sentence =
        'In the state `posted`, when Guard (gate-1) hears a sound';
      expect(heard.querySelector('title')!.textContent).toContain(sentence);
      expect(heard.getAttribute('aria-description')).toContain(sentence);
      fireEvent.click(heard);
      expect(heard.getAttribute('aria-pressed')).toBe('true');
      expect(heard.dataset.selected).toBe('true');
      const sentences = within(marked()!)
        .getAllByRole('listitem')
        .map((item) => item.textContent ?? '');
      expect(sentences).toEqual([
        expect.stringContaining(
          'In the state `posted`, when Guard (gate-1) hears a sound'
        ),
      ]);
      // The shared step is one mark, its sentences each state's.
      const turned = within(drawing()).getByRole('button', {
        name: 'Step from posted, alert or challenged to turned, on fact: guards-turned',
      });
      fireEvent.keyDown(turned, { key: 'Enter' });
      expect(turned.getAttribute('aria-pressed')).toBe('true');
      expect(heard.getAttribute('aria-pressed')).toBe('false');
      expect(
        within(marked()!)
          .getAllByRole('listitem')
          .map(
            (item) => /In the state `(\w+)`/.exec(item.textContent ?? '')?.[1]
          )
      ).toEqual(['posted', 'alert', 'challenged']);
    });

    it('clicking a box shows what the creature does there; a sentence in the list marks its box', () => {
      render(
        <StudioBehaviours
          document={castle}
          readBack={machines()}
          focus="gate-1-policy"
          onSelect={vi.fn()}
        />
      );
      const posted = within(drawing()).getByRole('button', {
        name: 'State posted (starts here)',
      });
      fireEvent.click(posted);
      expect(posted.getAttribute('aria-pressed')).toBe('true');
      const said = marked()!.textContent ?? '';
      expect(said).toContain(
        'In the state `posted`, Guard (gate-1) listens for'
      );
      expect(said).toContain(
        "In the state `posted`, on Guard (gate-1)'s own time (each round Guard (gate-1) is due, out of a fight), Guard (gate-1) acts from its own `post` rows."
      );
      expect(said).toContain('While its routine is in the state `posted`');
      // From the read-back's list (its Full view): cowed's state sentence
      // marks cowed.
      fireEvent.click(within(panel()).getByRole('button', { name: 'Full' }));
      fireEvent.click(
        within(panel()).getByRole('button', {
          name: /^Mark on the drawing: .*in `cowed`$/,
        })
      );
      expect(
        within(drawing())
          .getByRole('button', { name: 'State cowed' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(posted.getAttribute('aria-pressed')).toBe('false');
      localStorage.removeItem(READ_BACK_VIEW_STORAGE_KEY);
    });

    it('another behaviour draws its own machine, unmarked', () => {
      const { rerender } = render(
        <StudioBehaviours
          document={castle}
          readBack={machines()}
          focus="gate-1-policy"
          onSelect={vi.fn()}
        />
      );
      fireEvent.click(
        within(drawing()).getByRole('button', {
          name: 'State posted (starts here)',
        })
      );
      rerender(
        <StudioBehaviours
          document={castle}
          readBack={machines()}
          focus="captain-policy"
          onSelect={vi.fn()}
        />
      );
      const captain = within(panel()).getByRole('group', {
        name: 'The machine of captain-policy',
      });
      expect(
        within(captain).getByRole('button', { name: 'State in-hall' })
      ).toBeTruthy();
      expect(marked()).toBeNull();
    });

    it('a read-back that does not say the shape draws nothing', () => {
      render(
        <StudioBehaviours
          document={castle}
          readBack={state()}
          focus="gate-1-policy"
          onSelect={vi.fn()}
        />
      );
      expect(
        within(panel()).queryByRole('group', { name: /^The machine of/ })
      ).toBeNull();
      expect(
        within(panel()).queryByRole('button', { name: /^Mark on the drawing/ })
      ).toBeNull();
      expect(
        within(panel()).getByRole('region', { name: 'Read back' }).textContent
      ).toContain('Routine `gate-1-policy`');
    });
  });
});
