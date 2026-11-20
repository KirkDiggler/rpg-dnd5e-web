/**
 * A CONVERSATION'S OUTCOMES, FROM THE FORM (rpg-project#975 C). What follows
 * a conversation entering a state is a list of consequences, each one kind:
 * a give, an arrest or a jail. An arrest is a relocation reached from
 * a conversation (R33): where the taken are held — a region, the shared
 * relocation's Region — and where they are seized. A jail is the move into
 * that cell: the shared relocation's Words and Rounds, and the fact taught
 * when one escapes. Each is authored through the form on the castle's
 * `front-gate` and written back as the exact YAML the engine reads; the
 * castle still downloads byte for byte unedited.
 *
 * What the engine refuses the form cannot write: two kinds in one entry (one
 * select), a jail in a conversation that arrests nobody (Jails is offered
 * only beside an arrest), an arrest seizing nowhere (the last place it
 * seizes in cannot be taken away), a state the recipe does not declare
 * (offered from the recipe).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnswerWaypointShape } from '../world-building/answerTableShape';
import {
  setInteractionOutcomes,
  type Outcomes,
} from '../world-building/interactionOutcomes';
import {
  pickedCells,
  RoutePickContext,
  toggledCell,
  type RoutePickRequest,
} from '../world-building/routePicking';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { placeName } from './placeName';
import { RevealProvider } from './reveal';
import { StudioInteractions } from './StudioInteractions';

afterEach(cleanup);

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}
type Read = ReturnType<typeof read>;

function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

/** The Conversations section on the castle, its outcomes held in state, and
 * the castle written out with the last outcomes it committed. */
function conversations(
  arm: (request: RoutePickRequest) => void = vi.fn(),
  text = served
) {
  const result = read(text);
  let last: Outcomes | undefined;
  function Harness() {
    const [scope, setScope] = useState(result.scope);
    return (
      <StudioInteractions
        session={{
          document: { draft: result.draft, scope },
          commitInteractionApproach: () => true,
          commitInteractionRecipe: () => true,
          commitInteractionOutcomes: (id, outcomes) => {
            last = outcomes;
            setScope((was) => setInteractionOutcomes(was, id, outcomes));
            return true;
          },
        }}
      />
    );
  }
  render(
    <RevealProvider>
      <RoutePickContext.Provider value={{ arm }}>
        <SiteNamesContext.Provider
          value={siteNamesOf(result.scope, result.draft.room)}
        >
          <Harness />
        </SiteNamesContext.Provider>
      </RoutePickContext.Provider>
    </RevealProvider>
  );
  return {
    saved: (): string =>
      exportDraftYaml(
        {
          draft: result.draft,
          scope: setInteractionOutcomes(result.scope, 'front-gate', last!),
        },
        result.key
      ),
    result: result as Read,
  };
}

const field = <T extends HTMLElement>(label: string): T =>
  screen.getByLabelText(label) as T;

describe('the castle still downloads byte for byte', () => {
  it('unedited, with its give, arrest and jail', () => {
    const result = read(served);
    expect(
      exportDraftYaml({ draft: result.draft, scope: result.scope }, result.key)
    ).toBe(served);
  });
});

describe('an arrest, from the form (rpg-project#975 C)', () => {
  const arrest = 'front-gate arrested 1';

  it('reads as written: arrests, held in the cells, seized in the gatehouse and seven cells; no raw read-out', () => {
    conversations();
    expect(field<HTMLSelectElement>(`Outcome kind ${arrest}`).value).toBe(
      'arrest'
    );
    expect(field<HTMLSelectElement>(`Held in for ${arrest}`).value).toBe(
      'region-cells'
    );
    expect(
      field<HTMLInputElement>(`Seized in region-gatehouse for ${arrest}`)
        .checked
    ).toBe(true);
    expect(
      field<HTMLInputElement>(`Seized in region-courtyard for ${arrest}`)
        .checked
    ).toBe(false);
    expect(screen.getByTestId(`Seized cells ${arrest}`).textContent).toBe(
      '7 cells'
    );
    expect(screen.queryByLabelText(/^Outcome as written/)).toBeNull();
  });

  it('held in another region writes that one line', () => {
    const { saved } = conversations();
    fireEvent.change(field(`Held in for ${arrest}`), {
      target: { value: 'region-chapel' },
    });
    expect(changedLines(served, saved())).toEqual([
      '            cell: region-chapel',
    ]);
  });

  it('seizing in the courtyard too appends it to the authored regions', () => {
    const { saved } = conversations();
    fireEvent.click(field(`Seized in region-courtyard for ${arrest}`));
    expect(changedLines(served, saved())).toEqual([
      '              regions: [region-gatehouse, region-courtyard]',
    ]);
  });

  it('the cells are picked on the map: the pick starts from them, and its answer is written as row runs', () => {
    let request: RoutePickRequest | undefined;
    const { saved } = conversations((r) => {
      request = r;
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: `Pick seized cells on map for ${arrest}`,
      })
    );
    expect(request!.mode).toBe('cells');
    expect(request!.route).toHaveLength(7);
    // The author keeps the first row and one cell of the second.
    const kept: AnswerWaypointShape[] = request!.route.filter(
      (cell) => cell.r === 13 || (cell.r === 14 && cell.q === -8)
    );
    request!.onDone(kept);
    expect(saved()).toBe(
      served.replace(
        '                - {r: 13, q: [[-8, -5]]}\n                - {r: 14, q: [[-8, -6]]}\n',
        '                - {r: 13, q: [[-8, -5]]}\n                - {r: 14, q: [[-8, -8]]}\n'
      )
    );
  });

  it('the last place an arrest seizes in cannot be taken away: an area names its regions or its cells', () => {
    const { saved } = conversations((r) => r.onDone([]));
    fireEvent.click(
      screen.getByRole('button', {
        name: `Pick seized cells on map for ${arrest}`,
      })
    );
    // With its cells gone, the gatehouse is the only place left.
    expect(saved()).toContain('              regions: [region-gatehouse]\n');
    expect(
      field<HTMLInputElement>(`Seized in region-gatehouse for ${arrest}`)
        .disabled
    ).toBe(true);
  });
});

describe('a jail, from the form (rpg-project#975 C)', () => {
  const jail = 'front-gate jailed 1';

  it('reads as written: the words and rounds of the move, the fact when one escapes', () => {
    conversations();
    expect(field<HTMLSelectElement>(`Outcome kind ${jail}`).value).toBe('jail');
    expect(field<HTMLTextAreaElement>(`Words for ${jail}`).value).toBe(
      'The guards march you to the cells.'
    );
    expect(field<HTMLInputElement>(`Rounds for ${jail}`).value).toBe('5');
    expect(
      field<HTMLInputElement>(`Fact when they escape for ${jail}`).value
    ).toBe('prisoners-escaped');
    // A jail moves the taken into the arrest's cell: it has no region.
    expect(screen.queryByLabelText(`Region for ${jail}`)).toBeNull();
  });

  it('six rounds writes that one line; no escape fact removes its line', () => {
    const { saved } = conversations();
    fireEvent.change(field(`Rounds for ${jail}`), { target: { value: '6' } });
    expect(changedLines(served, saved())).toEqual(['            rounds: 6']);
    fireEvent.change(field(`Fact when they escape for ${jail}`), {
      target: { value: '' },
    });
    expect(saved()).toBe(
      served
        .replace('            rounds: 5\n', '            rounds: 6\n')
        .replace('            escaped: prisoners-escaped\n', '')
    );
  });

  it('a jail is offered only beside an arrest: without one, Jails cannot be chosen, and a chosen Jails falls back', () => {
    conversations();
    // Jails chosen in the add control while the conversation arrests…
    fireEvent.change(field('Add outcome kind for front-gate'), {
      target: { value: 'jail' },
    });
    // …the jail and then the arrest go.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove outcome front-gate jailed 1' })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove outcome front-gate arrested 1',
      })
    );
    const kinds = field<HTMLSelectElement>('Add outcome kind for front-gate');
    const jails = [...kinds.options].find((o) => o.value === 'jail')!;
    expect(jails.disabled).toBe(true);
    expect(kinds.value).toBe('give');
  });

  it('the only arrest of a conversation that jails cannot be removed or changed', () => {
    conversations();
    const remove = screen.getByRole('button', {
      name: 'Remove outcome front-gate arrested 1',
    }) as HTMLButtonElement;
    const kind = field<HTMLSelectElement>('Outcome kind front-gate arrested 1');
    for (const control of [remove, kind]) {
      expect(control.disabled).toBe(true);
      expect(control.title).toBe(
        'A jail in this conversation takes the taken of this arrest: remove the jail first.'
      );
    }
    // Without the jail it is free again.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove outcome front-gate jailed 1' })
    );
    expect(remove.disabled).toBe(false);
    expect(kind.disabled).toBe(false);
  });
});

describe('an outcome is one kind; adding and removing (rpg-project#975 C)', () => {
  it('the admitted give reads in fields, not a sentence', () => {
    conversations();
    const at = 'front-gate admitted 1';
    expect(field<HTMLSelectElement>(`Outcome kind ${at}`).value).toBe('give');
    expect(field<HTMLInputElement>(`Topic for ${at}`).value).toBe('admitted');
    expect(field<HTMLSelectElement>(`About for ${at}`).value).toBe(
      'party_in_sight'
    );
    expect(
      field<HTMLInputElement>(
        `Also given to the conversation’s carriers who witness it, for ${at}`
      ).checked
    ).toBe(true);
  });

  it('adding an arrest on entering warned-guest writes one, held in and seized in the first region, in the recipe’s order', () => {
    const { saved } = conversations();
    fireEvent.change(field('Add outcome state for front-gate'), {
      target: { value: 'warned-guest' },
    });
    fireEvent.change(field('Add outcome kind for front-gate'), {
      target: { value: 'arrest' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add outcome for front-gate' })
    );
    expect(saved()).toBe(
      served.replace(
        '    outcomes:\n      admitted:\n',
        '    outcomes:\n' +
          '      warned-guest:\n' +
          '        - arrest:\n' +
          '            cell: room-1-region\n' +
          '            area:\n' +
          '              regions:\n' +
          '                - room-1-region\n' +
          '      admitted:\n'
      )
    );
  });

  it('turning the admitted give into a jail replaces it whole', () => {
    const { saved } = conversations();
    fireEvent.change(field('Outcome kind front-gate admitted 1'), {
      target: { value: 'jail' },
    });
    const text = saved();
    expect(text).toContain(
      '      admitted:\n        - jail:\n            words: ""\n'
    );
    expect(text).not.toContain(
      '        - give:\n            topic: admitted\n            to: spoken_to\n            about: party_in_sight\n            heard_by: carriers_who_witnessed\n      # Hand edit'
    );
  });

  it('removing the jail drops its state', () => {
    const { saved } = conversations();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove outcome front-gate jailed 1' })
    );
    expect(saved()).not.toContain('      jailed:\n        - jail:');
  });
});

describe('what the form cannot fully read is shown as written (rpg-project#975 C review)', () => {
  const ARREST =
    '        - arrest:\n' +
    '            cell: region-cells\n' +
    '            area:\n' +
    '              regions: [region-gatehouse]\n' +
    '              cells:\n' +
    '                - {r: 13, q: [[-8, -5]]}\n' +
    '                - {r: 14, q: [[-8, -6]]}\n';

  it('an arrest with no area is shown as written, and the section does not crash', () => {
    expect(served).toContain(ARREST);
    conversations(
      vi.fn(),
      served.replace(
        ARREST,
        '        - arrest:\n            cell: region-cells\n'
      )
    );
    expect(
      screen.getByLabelText('Outcome as written front-gate arrested 1')
        .textContent
    ).toBe('{"arrest":{"cell":"region-cells"}}');
  });

  it('an arrest with an empty area is a form seizing nothing', () => {
    conversations(
      vi.fn(),
      served.replace(
        ARREST,
        '        - arrest:\n            cell: region-cells\n            area: {}\n'
      )
    );
    expect(
      screen.getByTestId('Seized cells front-gate arrested 1').textContent
    ).toBe('0 cells');
  });

  it('a give with a word the form does not offer is shown as written, never blank', () => {
    conversations(
      vi.fn(),
      served.replace(
        '            about: party_in_sight\n            heard_by: carriers_who_witnessed\n      # Hand edit (rpg-project#925',
        '            about: everyone\n            heard_by: carriers_who_witnessed\n      # Hand edit (rpg-project#925'
      )
    );
    expect(
      screen.getByLabelText('Outcome as written front-gate admitted 1')
        .textContent
    ).toContain('"about":"everyone"');
    expect(
      screen.queryByLabelText('Topic for front-gate admitted 1')
    ).toBeNull();
  });

  it('a sceneMove beside them survives a neighbour’s edit byte for byte', () => {
    const text = served.replace(
      '      admitted:\n        - give:\n',
      '      admitted:\n        - sceneMove:\n            leave: gate-left\n        - give:\n'
    );
    expect(text).not.toBe(served);
    const { saved } = conversations(vi.fn(), text);
    fireEvent.change(field('Topic for front-gate admitted 2'), {
      target: { value: 'welcomed' },
    });
    expect(changedLines(text, saved())).toEqual([
      '            topic: welcomed',
    ]);
  });
});

describe('a cells pick ignores cells that are not floor', () => {
  it('a floor cell is added, a held one taken away, an off-floor one ignored', () => {
    const floor = (c: { q: number; r: number }) => c.q >= 0;
    expect(pickedCells([], { q: 1, r: 0 }, floor)).toEqual([{ q: 1, r: 0 }]);
    expect(pickedCells([], { q: -1, r: 0 }, floor)).toEqual([]);
    expect(pickedCells([{ q: -1, r: 0 }], { q: -1, r: 0 }, floor)).toEqual([]);
  });
});

describe('each outcome is a place a jump lands on, named in words', () => {
  it('every outcome registers by its path', () => {
    conversations();
    for (const path of [
      'interactions.front-gate.outcomes.admitted[0]',
      'interactions.front-gate.outcomes.arrested[0]',
      'interactions.front-gate.outcomes.jailed[0]',
    ])
      expect(
        document.querySelector(`[data-reveal-key="path:${path}"]`)
      ).not.toBeNull();
  });

  it('placeName says them', () => {
    const result = read(served);
    const doc = { draft: result.draft, scope: result.scope };
    expect(
      placeName('interactions.front-gate.outcomes.arrested[0].arrest', doc)
    ).toBe('conversation `front-gate` · on entering `arrested` · arrest');
    expect(
      placeName('interactions.front-gate.outcomes.jailed[0].jail.words', doc)
    ).toBe('conversation `front-gate` · on entering `jailed` · jail · words');
  });
});

describe('picking a set of cells on the map', () => {
  it('a click adds a cell, and a second click takes it away', () => {
    const one = toggledCell([], { q: 1, r: 2 });
    expect(one).toEqual([{ q: 1, r: 2 }]);
    const two = toggledCell(one, { q: 3, r: 2 });
    expect(two).toEqual([
      { q: 1, r: 2 },
      { q: 3, r: 2 },
    ]);
    expect(toggledCell(two, { q: 1, r: 2 })).toEqual([{ q: 3, r: 2 }]);
  });
});
