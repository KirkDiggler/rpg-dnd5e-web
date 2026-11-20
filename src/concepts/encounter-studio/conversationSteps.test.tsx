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
  const name = screen.getByLabelText(
    `Step name for front-gate ${state} new step`
  );
  fireEvent.change(name, { target: { value: 'refused' } });
  const to = screen.getByLabelText(
    `Goes to for front-gate ${state} new step`
  ) as HTMLSelectElement;
  fireEvent.change(to, { target: { value: 'arrested' } });
  fireEvent.blur(name);
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

  it('writes nothing for an invalid name and says why', () => {
    const view = conversations();
    fireEvent.click(screen.getByLabelText('Add a step to front-gate fresh'));
    const name = screen.getByLabelText(
      'Step name for front-gate fresh new step'
    );
    fireEvent.change(name, { target: { value: 'no spaces' } });
    fireEvent.blur(name);
    expect(view.commits()).toBe(0);
    expect(screen.getByRole('alert').textContent).toBe(
      'Letters, digits, - and _ only.'
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
