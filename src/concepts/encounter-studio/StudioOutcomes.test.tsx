/**
 * An interaction's outcomes (rpg-project#928, #975 C): each entry one kind,
 * shown as fields — a recognition's topic and witnesses, an arrest, a jail —
 * an add for a recipe state and a remove; an entry of another kind is shown
 * as written and kept.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
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
  const document = castle(text);
  render(
    <SiteNamesContext.Provider
      value={siteNamesOf(document.scope, document.draft.room)}
    >
      <StudioInteractions
        session={{
          document,
          commitInteractionApproach: vi.fn(() => true),
          commitInteractionOutcomes: commit,
        }}
      />
    </SiteNamesContext.Provider>
  );
  return commit;
}

const RECOGNITION = {
  topic: 'admitted',
  holder: 'spoken_to',
  about: 'party_in_sight',
  heard_by: 'carriers_who_witnessed',
};

/** The castle's arrest (rpg-project#925), carried through every edit of its
 * neighbours. */
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

/** The castle's jail (rpg-project#925): the `jailed` outcome. */
const JAIL = {
  jail: {
    words: 'The guards march you to the cells.',
    rounds: 5,
    escaped: 'prisoners-escaped',
  },
};

describe('the outcomes form', () => {
  it('shows the gate’s recognition as fields: its kind, topic, holder (the one word, not offered) and witnesses (rpg-project#975 C)', () => {
    renderOutcomes();
    const at = 'front-gate admitted 1';
    expect(
      (screen.getByLabelText(`Outcome kind ${at}`) as HTMLSelectElement).value
    ).toBe('recognize');
    expect(
      (screen.getByLabelText(`Topic for ${at}`) as HTMLInputElement).value
    ).toBe('admitted');
    expect(
      (screen.getByLabelText(`Held by for ${at}`) as HTMLSelectElement).disabled
    ).toBe(true);
  });

  it('commits a new topic, keeping the rest of the entry', () => {
    const commit = renderOutcomes();
    fireEvent.change(screen.getByLabelText('Topic for front-gate admitted 1'), {
      target: { value: 'welcome' },
    });
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
        'Witnessing carriers hold it too for front-gate admitted 1'
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
      screen.getByLabelText('Add outcome state for front-gate'),
      {
        target: { value: 'arrested' },
      }
    );
    fireEvent.click(screen.getByLabelText('Add outcome for front-gate'));
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      admitted: [{ recognize: RECOGNITION }],
      arrested: [ARREST, { recognize: RECOGNITION }],
      jailed: [JAIL],
    });
    fireEvent.click(
      screen.getByLabelText('Remove outcome front-gate admitted 1')
    );
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('shows an entry of another kind as written, and keeps it through an edit of its neighbour', () => {
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
    fireEvent.change(screen.getByLabelText('Topic for front-gate admitted 2'), {
      target: { value: 'welcome' },
    });
    expect(commit).toHaveBeenCalledWith('front-gate', {
      admitted: [
        { announce: { to: 'garrison' } },
        { recognize: { ...RECOGNITION, topic: 'welcome' } },
      ],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });

  it('shows the castle’s arrest and jail as forms, never as written JSON, and keeps them through a neighbour’s edit (rpg-project#925, #975 C)', () => {
    const commit = renderOutcomes();
    expect(
      screen.getByRole('heading', { name: 'On entering arrested' })
    ).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          'Outcome kind front-gate arrested 1'
        ) as HTMLSelectElement
      ).value
    ).toBe('arrest');
    expect(
      (
        screen.getByLabelText(
          'Outcome kind front-gate jailed 1'
        ) as HTMLSelectElement
      ).value
    ).toBe('jail');
    expect(screen.queryByLabelText(/^Outcome as written/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Topic for front-gate admitted 1'), {
      target: { value: 'welcome' },
    });
    expect(commit).toHaveBeenLastCalledWith('front-gate', {
      admitted: [{ recognize: { ...RECOGNITION, topic: 'welcome' } }],
      arrested: [ARREST],
      jailed: [JAIL],
    });
  });
});
