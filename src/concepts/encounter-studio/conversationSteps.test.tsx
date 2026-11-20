/**
 * A CONVERSATION'S STATES AND STEPS, FROM THE FORM (rpg-project#1040), on the
 * castle's `front-gate`.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  recipeBeats,
  recipeHolderOf,
  setInteractionRecipe,
} from '../world-building/interactionOutcomes';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { RevealProvider } from './reveal';
import { StudioInteractions } from './StudioInteractions';

afterEach(cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

function conversations(refusals: { path: string; message: string }[] = []) {
  const result = read(served);
  let scopeNow = result.scope;
  let commits = 0;
  function Harness() {
    const [scope, setScope] = useState(result.scope);
    return (
      <StudioInteractions
        session={{
          document: { draft: result.draft, scope },
          commitInteractionApproach: () => true,
          commitInteractionOutcomes: () => true,
          commitInteractionRecipe: (id, edit) => {
            const holder = recipeHolderOf(scopeNow, id)!;
            try {
              scopeNow = setInteractionRecipe(
                scopeNow,
                id,
                edit(holder).recipe
              );
            } catch {
              return false;
            }
            commits += 1;
            setScope(scopeNow);
            return true;
          },
        }}
        check={
          refusals.length
            ? { state: 'refused', refusals }
            : { state: 'current', refusals: [] }
        }
      />
    );
  }
  render(
    <RevealProvider>
      <Harness />
    </RevealProvider>
  );
  return {
    commits: () => commits,
    scope: () => scopeNow,
    saved: () =>
      exportDraftYaml({ draft: result.draft, scope: scopeNow }, result.key),
  };
}

const stateItem = (name: string): HTMLElement =>
  document.querySelector(`.es-conversation-state[data-state="${name}"]`)!;

function addRefused(state: string) {
  fireEvent.click(screen.getByLabelText(`Add a step to front-gate ${state}`));
  fireEvent.change(
    screen.getByLabelText(`Step name for front-gate ${state} new step`),
    { target: { value: 'refused' } }
  );
  fireEvent.change(
    screen.getByLabelText(`Goes to for front-gate ${state} new step`),
    { target: { value: 'arrested' } }
  );
  fireEvent.click(
    screen.getByLabelText(`Add step front-gate ${state} new step`)
  );
}

describe('the states of front-gate', () => {
  it('lists its states in file order, marking where it starts and what ends it', () => {
    conversations();
    const names = [...document.querySelectorAll('.es-conversation-state')].map(
      (li) => li.getAttribute('data-state')
    );
    expect(names).toEqual([
      'fresh',
      'warned-guest',
      'warned-troupe',
      'admitted',
      'arrested',
      'jailed',
    ]);
    expect(
      within(stateItem('fresh')).getByText('the conversation starts here')
    ).toBeTruthy();
    const admitted = within(stateItem('admitted'));
    expect(admitted.getByText('ends the conversation')).toBeTruthy();
    expect(admitted.queryByText('Add a step')).toBeNull();
    expect(
      stateItem('fresh').querySelectorAll('.es-conversation-step').length
    ).toBe(3);
  });
});

describe('adding a step', () => {
  it('writes the step last, once, and the line form can then offer it', () => {
    const view = conversations();
    addRefused('fresh');
    expect(view.commits()).toBe(1);
    const fresh = view.scope().unread!.interactions as Record<string, Loose>;
    const list = fresh['front-gate'].recipe.states.fresh.transitions;
    expect(list[list.length - 1]).toEqual({ on: 'refused', to: 'arrested' });
    addRefused('warned-guest');
    addRefused('warned-troupe');
    expect(recipeBeats(view.scope(), 'front-gate')).toContain('refused');
    // Nothing else in the file moved: removing the three new steps gives
    // the castle back, byte for byte.
    const saved = view.saved();
    const step = /\n {12}- on: refused\n {14}to: arrested(?=\n)/g;
    expect(saved.match(step)).toHaveLength(3);
    expect(saved.replace(step, '')).toBe(served);
  });

  it('writes nothing while typing or tabbing, then one commit with all three values on Add', () => {
    const view = conversations();
    fireEvent.click(screen.getByLabelText('Add a step to front-gate fresh'));
    const name = screen.getByLabelText(
      'Step name for front-gate fresh new step'
    );
    const because = screen.getByLabelText(
      'Because for front-gate fresh new step'
    );
    fireEvent.change(name, { target: { value: 'refused' } });
    name.focus();
    because.focus();
    fireEvent.blur(name);
    fireEvent.change(because, { target: { value: 'turned away' } });
    fireEvent.blur(because);
    expect(view.commits()).toBe(0);
    fireEvent.click(
      screen.getByLabelText('Add step front-gate fresh new step')
    );
    expect(view.commits()).toBe(1);
    const list = (view.scope().unread!.interactions as Loose)['front-gate']
      .recipe.states.fresh.transitions;
    expect(list[list.length - 1]).toEqual({
      on: 'refused',
      to: 'fresh',
      reason: 'turned away',
    });
    // Focus lands on the new row's step name.
    expect(document.activeElement).toBe(
      screen.getByLabelText('Step name for front-gate fresh step 4')
    );
  });

  it('Add is off for an invalid name, which is said under the field', () => {
    const view = conversations();
    fireEvent.click(screen.getByLabelText('Add a step to front-gate fresh'));
    const name = screen.getByLabelText(
      'Step name for front-gate fresh new step'
    );
    fireEvent.change(name, { target: { value: 'no spaces' } });
    expect(
      (
        screen.getByLabelText(
          'Add step front-gate fresh new step'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe(
      'Letters, digits, - and _ only.'
    );
    expect(view.commits()).toBe(0);
  });

  it('Cancel discards the draft and returns focus to Add a step', async () => {
    const view = conversations();
    fireEvent.click(screen.getByLabelText('Add a step to front-gate fresh'));
    fireEvent.change(
      screen.getByLabelText('Step name for front-gate fresh new step'),
      { target: { value: 'refused' } }
    );
    fireEvent.click(screen.getByLabelText('Cancel front-gate fresh new step'));
    await Promise.resolve();
    expect(view.commits()).toBe(0);
    expect(
      screen.queryByLabelText('Step name for front-gate fresh new step')
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByLabelText('Add a step to front-gate fresh')
    );
  });
});

describe('editing and removing', () => {
  it('removing a step removes only that transition', () => {
    const view = conversations();
    fireEvent.click(screen.getByLabelText('Remove front-gate fresh step 2'));
    const states = (view.scope().unread!.interactions as Loose)['front-gate']
      .recipe.states;
    expect(states.fresh.transitions.map((t: Loose) => t.on)).toEqual([
      'guest-failed',
      'admitted',
    ]);
    expect(states['warned-guest'].transitions).toHaveLength(2);
    expect(view.commits()).toBe(1);
  });

  it('changing where a step leads is one write', () => {
    const view = conversations();
    fireEvent.change(
      screen.getByLabelText('Goes to for front-gate fresh step 1'),
      {
        target: { value: 'jailed' },
      }
    );
    const t = (view.scope().unread!.interactions as Loose)['front-gate'].recipe
      .states.fresh.transitions[0];
    expect(t.to).toBe('jailed');
    expect(view.commits()).toBe(1);
  });
});

describe('a text field commits on blur, not on every keystroke', () => {
  it('typing five characters then leaving is one commit', () => {
    const view = conversations();
    const because = screen.getByLabelText(
      'Because for front-gate fresh step 1'
    );
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde'])
      fireEvent.change(because, { target: { value: text } });
    expect(view.commits()).toBe(0);
    fireEvent.blur(because);
    expect(view.commits()).toBe(1);
  });
});

describe('adding a state', () => {
  it('adds a state with no steps, and refuses one that exists', () => {
    const view = conversations();
    const field = screen.getByLabelText('New state name for front-gate');
    fireEvent.change(field, { target: { value: 'fresh' } });
    fireEvent.submit(field.closest('form')!);
    expect(view.commits()).toBe(0);
    expect(screen.getByRole('alert').textContent).toContain('already');
    fireEvent.change(field, { target: { value: 'released' } });
    fireEvent.submit(field.closest('form')!);
    expect(view.commits()).toBe(1);
    expect(stateItem('released')).toBeTruthy();
  });
});

describe('the commit leaves the rest of the conversation as written', () => {
  it('replaces only the recipe: approach and outcomes are identical', () => {
    const result = read(served);
    const before = (result.scope.unread!.interactions as Loose)['front-gate'];
    const next = setInteractionRecipe(result.scope, 'front-gate', {
      ...before.recipe,
      initial: 'fresh',
    });
    const after = (next.unread!.interactions as Loose)['front-gate'];
    expect(after.approach).toBe(before.approach);
    expect(after.outcomes).toBe(before.outcomes);
  });
});

describe('the engine refuses', () => {
  it('shows a refusal under the row its path names', () => {
    conversations([
      {
        path: 'interactions.front-gate.recipe.states.fresh.transitions[1]',
        message: 'no such state',
      },
    ]);
    const rows = stateItem('fresh').querySelectorAll('.es-conversation-step');
    expect(
      within(rows[1] as HTMLElement).getByText('no such state')
    ).toBeTruthy();
    expect(
      within(rows[0] as HTMLElement).queryByText('no such state')
    ).toBeNull();
  });
});

describe('a refusal the section cannot place is still shown', () => {
  it('lists it under the label with the engine’s message', () => {
    conversations([
      {
        path: 'interactions.front-gate.recipe.states.admitted.transitions[0]',
        message: 'a terminal state has no steps',
      },
    ]);
    const section = screen.getByLabelText('States and steps of front-gate');
    const list = within(section).getByLabelText('The engine’s refusals here');
    expect(list.textContent).toContain('a terminal state has no steps');
    expect(
      section.querySelector('.es-conversation-state[data-state="admitted"]')!
        .textContent
    ).not.toContain('a terminal state has no steps');
  });
});
