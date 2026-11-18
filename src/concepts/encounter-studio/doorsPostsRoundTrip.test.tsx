/**
 * A DOOR'S FACT AND A POST, FROM THE FORM (rpg-project#975 D). A door may
 * teach a fact when it opens (`opened: { fact }`); a creature's behaviour
 * state may hold a post (`posts.<state>`): the door it holds, the cells it
 * holds it from (`at`, picked on the map), and the way it holds it
 * (`against`), beside the pass it already edits. Each is authored through
 * the form on the castle and written back as the exact YAML the engine
 * reads; the castle still downloads byte for byte unedited.
 *
 * What the engine refuses the form cannot write: an `opened` with no fact
 * (an empty field takes the key away), a post on a state the creature's
 * behaviour does not have or on a terminal one (offered from the
 * behaviour's states), a post naming no door or a door the site does not
 * have (offered from the site's doors, starting on the first), an `against`
 * other than both, entering or leaving (a select).
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BindingPosts } from '../world-building/BindingPostPasses';
import { DoorOpenedField } from '../world-building/DoorOpenedField';
import type { RoomMonsterBinding } from '../world-building/roomDraft';
import {
  RoutePickContext,
  type RoutePickRequest,
} from '../world-building/routePicking';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { placeName } from './placeName';
import { RevealProvider } from './reveal';

afterEach(cleanup);

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

const field = <T extends HTMLElement>(label: string): T =>
  screen.getByLabelText(label) as T;

/** One creature's posts on the castle, held in state, and the castle
 * written out with the binding the last edit committed. */
function posts(
  owner: string,
  arm: (request: RoutePickRequest) => void = vi.fn(),
  text = served
) {
  const result = read(text);
  let last: RoomMonsterBinding | undefined =
    result.draft.room.monsterBindings![owner];
  function Harness() {
    const [binding, setBinding] = useState(last);
    return (
      <BindingPosts
        owner={owner}
        binding={binding}
        scope={result.scope}
        topics={['admitted']}
        onChange={(next) => {
          last = next;
          setBinding(next);
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
    result,
    saved: (): string => {
      const draft = structuredClone(result.draft);
      draft.room.monsterBindings![owner] = last!;
      return exportDraftYaml({ draft, scope: result.scope }, result.key);
    },
  };
}

/** One door's fact on the castle, and the castle written out with it. */
function door(id: string) {
  const result = read(served);
  let binding = result.draft.room.doorBindings![id]!;
  function Harness() {
    const [shown, setShown] = useState(binding);
    return (
      <DoorOpenedField
        doorId={id}
        binding={shown}
        onChange={(next) => {
          binding = next;
          setShown(next);
        }}
      />
    );
  }
  render(
    <RevealProvider>
      <Harness />
    </RevealProvider>
  );
  return {
    saved: (): string => {
      const draft = structuredClone(result.draft);
      draft.room.doorBindings![id] = binding;
      return exportDraftYaml({ draft, scope: result.scope }, result.key);
    },
  };
}

const POSTED =
  '          posted:\n' +
  '            door: gate-wall-door\n' +
  '            against: entering\n' +
  '            pass: { holds: admitted }\n' +
  '            at:\n' +
  '              - q: -3\n' +
  '                r: 7\n' +
  '              - q: -4\n' +
  '                r: 7\n';

describe('the castle still downloads byte for byte', () => {
  it('unedited, with its doors’ facts and its posts', () => {
    const result = read(served);
    expect(
      exportDraftYaml({ draft: result.draft, scope: result.scope }, result.key)
    ).toBe(served);
    expect(served).toContain(POSTED);
  });
});

describe('a door teaches a fact when it opens (rpg-project#975 D)', () => {
  it('the gate reads `gate-opened`; another fact writes that one line', () => {
    const { saved } = door('gate-wall-door');
    const fact = field<HTMLInputElement>(
      'Fact when it opens for gate-wall-door'
    );
    expect(fact.value).toBe('gate-opened');
    fireEvent.change(fact, { target: { value: 'gate-breached' } });
    expect(changedLines(served, saved())).toEqual([
      '          fact: gate-breached',
    ]);
  });

  it('emptying it takes `opened` away: an opened door always names its fact', () => {
    const { saved } = door('gate-wall-door');
    fireEvent.change(field('Fact when it opens for gate-wall-door'), {
      target: { value: '' },
    });
    expect(saved()).toBe(
      served.replace(
        '        closed: true\n        opened:\n          fact: gate-opened\n',
        '        closed: true\n'
      )
    );
  });

  it('the hall door, which teaches nothing, gains `opened` when a fact is written', () => {
    const { saved } = door('hall-wall-door');
    fireEvent.change(field('Fact when it opens for hall-wall-door'), {
      target: { value: 'hall-opened' },
    });
    expect(saved()).toBe(
      served.replace(
        '      hall-wall-door:\n        closed: true\n',
        '      hall-wall-door:\n        closed: true\n        opened:\n          fact: hall-opened\n'
      )
    );
  });
});

describe('a post, from the form (rpg-project#975 D)', () => {
  const posted = 'gate-1 posted';

  it('gate-1’s `posted` reads as written: its door, one way (entering), two cells; no read-out', () => {
    posts('gate-1');
    expect(field<HTMLSelectElement>(`Door for ${posted}`).value).toBe(
      'gate-wall-door'
    );
    expect(field<HTMLSelectElement>(`Against for ${posted}`).value).toBe(
      'entering'
    );
    expect(screen.getByTestId(`Held cells ${posted}`).textContent).toBe(
      '2 cells'
    );
    expect(screen.queryByText(/^Holds /)).toBeNull();
  });

  it('another door writes that one line', () => {
    const { saved } = posts('gate-1');
    fireEvent.change(field(`Door for ${posted}`), {
      target: { value: 'hall-wall-door' },
    });
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace('door: gate-wall-door', 'door: hall-wall-door')
      )
    );
  });

  it('leaving writes that one line; both ways takes it away', () => {
    const { saved } = posts('gate-1');
    fireEvent.change(field(`Against for ${posted}`), {
      target: { value: 'leaving' },
    });
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace('against: entering', 'against: leaving')
      )
    );
    fireEvent.change(field(`Against for ${posted}`), {
      target: { value: '' },
    });
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace('            against: entering\n', '')
      )
    );
  });

  it('the cells are picked on the map: the pick starts from them, and its answer is written in their place', () => {
    let request: RoutePickRequest | undefined;
    const { saved } = posts('gate-1', (r) => {
      request = r;
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: `Pick held cells on map for ${posted}`,
      })
    );
    expect(request!.mode).toBe('cells');
    expect(request!.route).toEqual([
      { q: -3, r: 7 },
      { q: -4, r: 7 },
    ]);
    request!.onDone([{ q: -3, r: 7 }]);
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace('              - q: -4\n                r: 7\n', '')
      )
    );
  });

  it('no cells means the creature’s own cell: an empty pick takes `at` away', () => {
    let request: RoutePickRequest | undefined;
    const { saved } = posts('gate-1', (r) => {
      request = r;
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: `Pick held cells on map for ${posted}`,
      })
    );
    act(() => request!.onDone([]));
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace(
          '            at:\n              - q: -3\n                r: 7\n              - q: -4\n                r: 7\n',
          ''
        )
      )
    );
    expect(screen.getByTestId(`Held cells ${posted}`).textContent).toBe(
      'its own cell'
    );
  });

  it('a post is added on a state of its behaviour not yet posted, never a terminal one, on the site’s first door', () => {
    const { saved, result } = posts('gate-1');
    const states = [
      ...field<HTMLSelectElement>('Add post state for gate-1').options,
    ].map((o) => o.value);
    // gate-1 runs gate-1-policy: alert, challenged, cowed, posted, turned.
    expect(states).toEqual(['cowed', 'turned']);
    fireEvent.change(field('Add post state for gate-1'), {
      target: { value: 'cowed' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add post for gate-1' })
    );
    const first = siteNamesOf(result.scope, result.draft.room).doors[0]!;
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED + `          cowed:\n            door: ${first}\n`
      )
    );
  });

  it('removing a post takes exactly its block away', () => {
    const { saved } = posts('gate-1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove post gate-1 challenged' })
    );
    expect(saved()).toBe(
      served.replace(POSTED.replace('posted', 'challenged'), '')
    );
  });

  it('removing the last post drops `posts` itself, never leaving `posts: {}`', () => {
    const { saved } = posts('captain');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove post captain ready' })
    );
    expect(saved()).toBe(
      served.replace(
        '        posts:\n' +
          '          ready:\n' +
          '            door: gate-wall-door\n' +
          '            against: entering\n' +
          '            pass: { holds: admitted }\n' +
          '            at:\n' +
          '              - q: -4\n' +
          '                r: 8\n',
        ''
      )
    );
  });

  it('the picked cells are written in the order picked', () => {
    let request: RoutePickRequest | undefined;
    const { saved } = posts('gate-1', (r) => {
      request = r;
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: `Pick held cells on map for ${posted}`,
      })
    );
    act(() =>
      request!.onDone([
        { q: -4, r: 7 },
        { q: -3, r: 7 },
      ])
    );
    expect(saved()).toBe(
      served.replace(
        POSTED,
        POSTED.replace(
          '              - q: -3\n                r: 7\n              - q: -4\n                r: 7\n',
          '              - q: -4\n                r: 7\n              - q: -3\n                r: 7\n'
        )
      )
    );
  });

  it('a written `against: both` is the one Both ways choice, kept as written', () => {
    const text = served.replace(
      POSTED,
      POSTED.replace('against: entering', 'against: both')
    );
    posts('gate-1', vi.fn(), text);
    const select = field<HTMLSelectElement>(`Against for ${posted}`);
    expect(select.value).toBe('both');
    expect([...select.options].map((o) => o.text)).toEqual([
      'Both ways',
      'Entering',
      'Leaving',
    ]);
  });

  it('a creature that runs no behaviour says so, and offers no post', () => {
    posts('cook');
    expect(screen.getByTestId('posts-no-behaviour-cook').textContent).toBe(
      'This creature runs no behaviour, so it has no state to hold a post in.'
    );
    expect(screen.queryByLabelText('Add post state for cook')).toBeNull();
  });
});

describe('each new field is a place a jump lands on, named in words', () => {
  it('a post’s door, way and cells, and a door’s fact, register by their paths', () => {
    posts('gate-1');
    door('gate-wall-door');
    for (const path of [
      'room.room.monsterBindings.gate-1.posts.posted.door',
      'room.room.monsterBindings.gate-1.posts.posted.against',
      'room.room.monsterBindings.gate-1.posts.posted.at',
      'room.room.doorBindings.gate-wall-door.opened',
    ])
      expect(
        document.querySelector(`[data-reveal-key="path:${path}"]`)
      ).not.toBeNull();
  });

  it('placeName says them', () => {
    const result = read(served);
    const doc = { draft: result.draft, scope: result.scope };
    expect(
      placeName('room.room.monsterBindings.gate-1.posts.posted.door', doc)
    ).toBe('gate-1 · post in `posted` · door');
    expect(
      placeName('room.room.doorBindings.gate-wall-door.opened.fact', doc)
    ).toBe('door `gate-wall-door` · opened · fact');
  });
});
