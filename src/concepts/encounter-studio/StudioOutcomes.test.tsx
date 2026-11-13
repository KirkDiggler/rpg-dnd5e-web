/**
 * An interaction's outcomes (rpg-project#928): each recognition in plain
 * words, its topic and its heard-by editable, an add for a recipe state and a
 * remove; an entry the form cannot say is shown as written and kept.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { StudioInteractions } from './StudioInteractions';

function castle(text = served) {
  const read = readDraftYaml(text);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
}

function renderOutcomes(text = served) {
  const commit = vi.fn(() => true);
  render(
    <StudioInteractions
      session={{
        document: castle(text),
        commitInteractionApproach: vi.fn(() => true),
        commitInteractionOutcomes: commit,
      }}
    />
  );
  return commit;
}

const RECOGNITION = {
  topic: 'admitted',
  holder: 'spoken_to',
  about: 'party_in_sight',
  heard_by: 'carriers_who_witnessed',
};

/** The castle's arrest (rpg-project#925): an outcome this form cannot say,
 * shown as written and carried through every edit of its neighbours. */
const ARREST = {
  arrest: {
    cell: 'region-cells',
    area: {
      regions: ['region-gatehouse'],
      cells: [
        { r: 13, q: [[-8, -5]] },
        { r: 14, q: [[-8, -6]] },
      ],
    },
  },
};

/** The castle's jail (rpg-project#925): the `jailed` outcome, kept as written
 * like the arrest beside it. */
const JAIL = {
  jail: {
    words: 'The guards march you to the cells.',
    rounds: 5,
    escaped: 'prisoners-escaped',
  },
};

describe('the outcomes form', () => {
  it('says the gate’s recognition in plain words, holder and subjects shown, not offered', () => {
    renderOutcomes();
    const entry = screen.getByLabelText('Recognition front-gate admitted 1');
    expect(entry.textContent).toContain(
      'the creature the line was said to recognises the speaker’s party he sees, and every other carrier who saw it said does too.'
    );
    expect(
      (
        screen.getByLabelText(
          'Recognition topic front-gate admitted 1'
        ) as HTMLInputElement
      ).value
    ).toBe('admitted');
    expect(screen.queryByLabelText(/holder/i)).toBeNull();
  });

  it('commits a new topic, keeping the rest of the entry', () => {
    const commit = renderOutcomes();
    fireEvent.change(
      screen.getByLabelText('Recognition topic front-gate admitted 1'),
      { target: { value: 'welcome' } }
    );
    expect(commit).toHaveBeenCalledWith('front-gate', {
      admitted: [{ recognize: { ...RECOGNITION, topic: 'welcome' } }],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('turns the heard-by off', () => {
    const commit = renderOutcomes();
    fireEvent.click(
      screen.getByLabelText(
        'Heard by the witnessing carriers front-gate admitted 1'
      )
    );
    const unheard: Partial<typeof RECOGNITION> = { ...RECOGNITION };
    delete unheard.heard_by;
    expect(commit).toHaveBeenCalledWith('front-gate', {
      admitted: [{ recognize: unheard }],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('adds a recognition on a state the recipe declares, and removes one', () => {
    const commit = renderOutcomes();
    fireEvent.change(
      screen.getByLabelText('Add recognition state for front-gate'),
      { target: { value: 'arrested' } }
    );
    fireEvent.click(screen.getByLabelText('Add recognition for front-gate'));
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      admitted: [{ recognize: RECOGNITION }],
      arrested: [ARREST, { recognize: RECOGNITION }],
      jailed: [JAIL],
    });
    fireEvent.click(
      screen.getByLabelText('Remove recognition front-gate admitted 1')
    );
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('shows an entry it cannot say as written, and keeps it through an edit of its neighbour', () => {
    const commit = renderOutcomes(
      served.replace(
        '        - recognize:\n',
        '        - announce: { to: garrison }\n        - recognize:\n'
      )
    );
    expect(
      screen.getByLabelText('Outcome as written front-gate admitted 1')
        .textContent
    ).toBe('{"announce":{"to":"garrison"}}');
    fireEvent.change(
      screen.getByLabelText('Recognition topic front-gate admitted 2'),
      { target: { value: 'welcome' } }
    );
    expect(commit).toHaveBeenCalledWith('front-gate', {
      admitted: [
        { announce: { to: 'garrison' } },
        { recognize: { ...RECOGNITION, topic: 'welcome' } },
      ],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('shows the castle’s arrest and jail as written, never refused or hidden, and keeps them (rpg-project#925)', () => {
    const commit = renderOutcomes();
    expect(
      screen.getByRole('heading', { name: 'Entering arrested' })
    ).toBeTruthy();
    expect(
      JSON.parse(
        screen.getByLabelText('Outcome as written front-gate arrested 1')
          .textContent!
      )
    ).toEqual(ARREST);
    expect(
      screen.getByRole('heading', { name: 'Entering jailed' })
    ).toBeTruthy();
    expect(
      JSON.parse(
        screen.getByLabelText('Outcome as written front-gate jailed 1')
          .textContent!
      )
    ).toEqual(JAIL);
    expect(
      screen.getByLabelText('Outcomes on entering arrested in front-gate')
        .textContent
    ).toContain('This form does not edit it; it is kept as written.');
    fireEvent.change(
      screen.getByLabelText('Recognition topic front-gate admitted 1'),
      { target: { value: 'welcome' } }
    );
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      admitted: [{ recognize: { ...RECOGNITION, topic: 'welcome' } }],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });
});
