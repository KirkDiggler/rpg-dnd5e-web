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
      arrested: [{ recognize: RECOGNITION }],
    });
    fireEvent.click(
      screen.getByLabelText('Remove recognition front-gate admitted 1')
    );
    expect(commit).toHaveBeenLastCalledWith('front-gate', {});
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
    });
  });
});
