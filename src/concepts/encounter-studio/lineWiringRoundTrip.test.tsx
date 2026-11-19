/**
 * A LINE'S WIRING, FROM THE FORM (rpg-project#975 B). A line requires a list
 * of things, every one of which must be true — a fact the speaker knows, a
 * prop they carry (`carries`), a conversation in one of its states, a topic
 * the one spoken to holds about them (`holds`), or `not` one of those — and it may advance a
 * conversation: the beat a win steps it on, and the beat a miss does. Each
 * is authored through the form on the castle and written back as the exact
 * YAML the engine reads; editing one changes no other key's bytes.
 *
 * What the engine refuses the form cannot write: a conversation state or a
 * beat the recipe does not declare (offered from the recipe), a state list
 * left empty (the last state cannot be unticked), `holds` on a prop's
 * line (not offered), a miss beat on a plain line (not offered), an advance
 * with no beat (a conversation starts with its first beat).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptionShape } from '../world-building/answerTableShape';
import { SiteNamesContext, siteNamesOf } from '../world-building/siteNames';
import { OptionsEditor } from '../world-building/SitePolicies';
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
type Read = ReturnType<typeof read>;

function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

function editor(
  result: Read,
  owner: string,
  kind: 'creature' | 'prop' = 'creature',
  scope = result.scope
): () => { index: number; option: OptionShape } {
  const room = result.draft.room;
  const initial =
    kind === 'creature'
      ? room.monsterBindings![owner]!.options!
      : room.propBindings![owner]!.options!;
  let last: { index: number; option: OptionShape } | undefined;
  // The lines held in state, as their owner holds them: every edit is
  // shown, so several can be made in one go.
  function Harness() {
    const [options, setOptions] = useState<readonly OptionShape[]>(initial);
    return (
      <OptionsEditor
        owner={owner}
        at={
          kind === 'creature'
            ? `room.room.monsterBindings.${owner}`
            : `room.room.propBindings.${owner}`
        }
        options={options}
        room={room}
        isProp={kind === 'prop'}
        onAdd={vi.fn()}
        onChange={(index, option) => {
          last = { index, option };
          setOptions((was) => was.map((o, i) => (i === index ? option : o)));
        }}
        onRemove={vi.fn()}
      />
    );
  }
  render(
    <RevealProvider>
      <SiteNamesContext.Provider value={siteNamesOf(scope, room)}>
        <Harness />
      </SiteNamesContext.Provider>
    </RevealProvider>
  );
  return () => last!;
}

function saveWith(
  result: Read,
  owner: string,
  index: number,
  option: OptionShape
): string {
  const draft = structuredClone(result.draft);
  const binding = draft.room.monsterBindings![owner]!;
  const options = [...binding.options!];
  options[index] = option as (typeof options)[number];
  binding.options = options;
  return exportDraftYaml({ draft, scope: result.scope }, result.key);
}

/** Make each edit through the form in turn, then write the castle out. */
function steps(
  owner: string,
  ...edits: (() => void)[]
): { saved: string; result: Read } {
  const result = read(served);
  const last = editor(result, owner);
  for (const edit of edits) edit();
  const { index, option } = last();
  const saved = saveWith(result, owner, index, option);
  cleanup();
  return { saved, result: read(saved) };
}

const field = <T extends HTMLElement>(label: string): T =>
  screen.getByLabelText(label) as T;

describe('a line’s requirements, as a list (rpg-project#975 B)', () => {
  it('gate-1’s `vouch` reads as written: a conversation in a state, and a topic noted', () => {
    editor(read(served), 'gate-1');
    expect(field<HTMLSelectElement>('Line 1 requires for gate-1').value).toBe(
      'interaction'
    );
    expect(
      field<HTMLSelectElement>('Line 1 requires conversation for gate-1').value
    ).toBe('front-gate');
    expect(
      field<HTMLInputElement>(
        'Line 1 requires front-gate in admitted for gate-1'
      ).checked
    ).toBe(true);
    expect(
      field<HTMLInputElement>('Line 1 requires front-gate in fresh for gate-1')
        .checked
    ).toBe(false);
    expect(field<HTMLSelectElement>('Line 1 requires 2 for gate-1').value).toBe(
      'noted'
    );
    expect(
      field<HTMLInputElement>('Line 1 requires topic 2 for gate-1').value
    ).toBe('admitted');
  });

  it('the only state ticked cannot be unticked: a state list is never empty', () => {
    editor(read(served), 'gate-1');
    expect(
      field<HTMLInputElement>(
        'Line 1 requires front-gate in admitted for gate-1'
      ).disabled
    ).toBe(true);
  });

  it('ticking a second state writes it into that list, and nothing else', () => {
    const { saved } = steps('gate-1', () =>
      fireEvent.click(field('Line 1 requires front-gate in fresh for gate-1'))
    );
    expect(changedLines(served, saved)).toEqual([
      '                  in: [fresh, admitted]',
    ]);
  });

  it('a requirement added to the scullion’s line makes its one requirement a list, then a conversation in a state', () => {
    const { saved } = steps(
      'scullion',
      () =>
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Add a requirement to line 1 of scullion',
          })
        ),
      () =>
        fireEvent.change(field('Line 1 requires 2 for scullion'), {
          target: { value: 'interaction' },
        })
    );
    expect(saved).toBe(
      served.replace(
        "            say: There's a coin in it if you know a way out of here.\n" +
          '            requires:\n              carries: purse\n',
        "            say: There's a coin in it if you know a way out of here.\n" +
          '            requires:\n' +
          '              - carries: purse\n' +
          '              - interaction:\n' +
          '                  id: front-gate\n' +
          '                  in:\n' +
          '                    - fresh\n'
      )
    );
  });

  it('a noted requirement offers the topics the file mentions; Unless negates it', () => {
    const { saved } = steps(
      'scullion',
      () =>
        fireEvent.change(field('Line 1 requires for scullion'), {
          target: { value: 'not-noted' },
        }),
      () =>
        fireEvent.change(field('Line 1 requires topic for scullion'), {
          target: { value: 'turned-away' },
        })
    );
    expect(saved).toBe(
      served.replace(
        "            say: There's a coin in it if you know a way out of here.\n" +
          '            requires:\n              carries: purse\n',
        "            say: There's a coin in it if you know a way out of here.\n" +
          '            requires:\n' +
          '              not:\n' +
          '                noted: turned-away\n'
      )
    );
  });

  it('removing a requirement from a list keeps it a list', () => {
    const { saved } = steps('gate-1', () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove requirement 2 from line 1 of gate-1',
        })
      )
    );
    expect(saved).toBe(
      served.replace(
        '                  in: [admitted]\n              - noted: admitted\n            success:\n              - say: Right you are.',
        '                  in: [admitted]\n            success:\n              - say: Right you are.'
      )
    );
  });

  it('a prop’s line is never offered `holds`: a prop holds nothing about anybody', () => {
    editor(read(served), 'grate', 'prop');
    const offered = [
      ...field<HTMLSelectElement>('Line 1 requires for grate').options,
    ].map((option) => option.value);
    expect(offered).not.toContain('noted');
    expect(offered).not.toContain('not-noted');
    expect(offered).toContain('carries');
    expect(offered).toContain('interaction');
  });
});

describe('a line advances a conversation (rpg-project#975 B)', () => {
  it('gate-1’s `troupe` reads as written; a new miss beat changes that one line', () => {
    const result = read(served);
    const at = result.draft.room.monsterBindings!['gate-1']!.options!.findIndex(
      (o) => o.id === 'troupe'
    );
    const n = at + 1;
    editor(result, 'gate-1');
    expect(
      field<HTMLSelectElement>(`Line ${n} advances conversation for gate-1`)
        .value
    ).toBe('front-gate');
    expect(
      field<HTMLSelectElement>(`Line ${n} on a win steps for gate-1`).value
    ).toBe('admitted');
    const miss = field<HTMLSelectElement>(
      `Line ${n} on a miss steps for gate-1`
    );
    expect(miss.value).toBe('troupe-failed');
    // Offered from the recipe: the beats it listens for.
    expect([...miss.options].map((o) => o.value)).toEqual([
      '',
      'guest-failed',
      'troupe-failed',
      'admitted',
      'came-quietly',
    ]);
  });

  it('a plain line (no check) is offered no miss beat; a conversation starts on its first beat', () => {
    const { saved } = steps(
      'scullion',
      () => {
        expect(
          screen.queryByLabelText('Line 1 on a miss steps for scullion')
        ).toBeNull();
        fireEvent.change(field('Line 1 advances conversation for scullion'), {
          target: { value: 'front-gate' },
        });
      },
      () =>
        fireEvent.change(field('Line 1 on a win steps for scullion'), {
          target: { value: 'came-quietly' },
        })
    );
    expect(saved).toBe(
      served.replace(
        '                tells: kitchen-way\n',
        '                tells: kitchen-way\n' +
          '            advance:\n' +
          '              interaction: front-gate\n' +
          '              success: came-quietly\n'
      )
    );
  });

  it('with a win beat only, the win cannot be cleared: an advance steps on at least one beat', () => {
    const result = read(served);
    const at = result.draft.room.monsterBindings!['gate-1']!.options!.findIndex(
      (o) => o.id === 'come-quietly'
    );
    editor(result, 'gate-1');
    const win = field<HTMLSelectElement>(
      `Line ${at + 1} on a win steps for gate-1`
    );
    expect([...win.options].map((o) => o.value)).not.toContain('');
  });

  it('None takes the advance away', () => {
    const result = read(served);
    const at = result.draft.room.monsterBindings!['gate-1']!.options!.findIndex(
      (o) => o.id === 'come-quietly'
    );
    const last = editor(result, 'gate-1');
    fireEvent.change(field(`Line ${at + 1} advances conversation for gate-1`), {
      target: { value: '' },
    });
    const { index, option } = last();
    expect(saveWith(result, 'gate-1', index, option)).toBe(
      served.replace(
        '            advance:\n              interaction: front-gate\n              success: came-quietly\n            success:\n              - say: Sensible. This way, and keep your hands where I can see them.\n',
        '            success:\n              - say: Sensible. This way, and keep your hands where I can see them.\n'
      )
    );
  });

  it('a give’s witnesses can be set once the line advances a conversation (part A’s field)', () => {
    const { result } = steps('scullion', () =>
      fireEvent.change(field('Line 1 advances conversation for scullion'), {
        target: { value: 'front-gate' },
      })
    );
    editor(result, 'scullion');
    fireEvent.change(field('Grants for line 1 of scullion success entry'), {
      target: { value: 'give' },
    });
    expect(
      field<HTMLInputElement>(
        'Also given to the conversation’s carriers who witness it, for line 1 of scullion success entry'
      ).disabled
    ).toBe(false);
  });
});

describe('a new requirement starts complete (rpg-project#975 B review)', () => {
  it('Add a requirement starts on the first fact the file mentions, never an empty one', () => {
    const result = read(served);
    const last = editor(result, 'scullion');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Add a requirement to line 1 of scullion',
      })
    );
    const added = (last().option.requires as unknown[])[1] as { fact: string };
    expect(added.fact).not.toBe('');
    expect(siteNamesOf(result.scope, result.draft.room).facts).toContain(
      added.fact
    );
    // Choosing "knows a fact" on another kind does the same.
    fireEvent.change(field('Line 1 requires for scullion'), {
      target: { value: 'fact' },
    });
    expect((last().option.requires as unknown[])[0]).toEqual({
      fact: siteNamesOf(result.scope, result.draft.room).facts[0],
    });
  });

  it('a site with no conversations offers no conversation requirement', () => {
    const result = read(served);
    const scope = {
      ...result.scope,
      unread: { ...result.scope.unread, interactions: undefined },
    };
    editor(result, 'scullion', 'creature', scope);
    const offered = [
      ...field<HTMLSelectElement>('Line 1 requires for scullion').options,
    ];
    for (const value of ['interaction', 'not-interaction'])
      expect(offered.find((o) => o.value === value)!.disabled).toBe(true);
  });

  it('with two conversations, the states and beats offered are the chosen one’s', () => {
    const result = read(served);
    const interactions = result.scope.unread!.interactions as Record<
      string,
      unknown
    >;
    const scope = {
      ...result.scope,
      unread: {
        ...result.scope.unread,
        interactions: {
          ...interactions,
          'side-door': {
            recipe: {
              ref: 'site:interactions:side-door',
              initial: 'quiet',
              states: {
                quiet: { transitions: [{ on: 'knocked', to: 'noisy' }] },
                noisy: { transitions: [{ on: 'hushed', to: 'quiet' }] },
              },
            },
          },
        },
      },
    };
    editor(result, 'scullion', 'creature', scope);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Add a requirement to line 1 of scullion',
      })
    );
    fireEvent.change(field('Line 1 requires 2 for scullion'), {
      target: { value: 'interaction' },
    });
    fireEvent.change(field('Line 1 requires conversation 2 for scullion'), {
      target: { value: 'side-door' },
    });
    expect(
      field<HTMLInputElement>(
        'Line 1 requires side-door in quiet 2 for scullion'
      ).checked
    ).toBe(true);
    expect(
      screen.queryByLabelText(
        'Line 1 requires side-door in fresh 2 for scullion'
      )
    ).toBeNull();
    expect(
      field<HTMLInputElement>(
        'Line 1 requires side-door in noisy 2 for scullion'
      ).checked
    ).toBe(false);
    fireEvent.change(field('Line 1 advances conversation for scullion'), {
      target: { value: 'side-door' },
    });
    expect(
      [
        ...field<HTMLSelectElement>('Line 1 on a win steps for scullion')
          .options,
      ].map((o) => o.value)
    ).toEqual(['knocked', 'hushed']);
  });
});

describe('each new field is a place a jump lands on, named in words', () => {
  it('a requirement and the advance register by their paths', () => {
    editor(read(served), 'gate-1');
    for (const path of [
      'room.room.monsterBindings.gate-1.options[0].requires[0]',
      'room.room.monsterBindings.gate-1.options[0].requires[1]',
      'room.room.monsterBindings.gate-1.options[3].advance',
    ])
      expect(
        document.querySelector(`[data-reveal-key="path:${path}"]`)
      ).not.toBeNull();
  });

  it('placeName says them', () => {
    const result = read(served);
    const doc = { draft: result.draft, scope: result.scope };
    expect(
      placeName(
        'room.room.monsterBindings.gate-1.options[3].advance.failure',
        doc
      )
    ).toBe('gate-1 · line `troupe` · advance · failure');
    expect(
      placeName(
        'room.room.monsterBindings.gate-1.options[0].requires[1].noted',
        doc
      )
    ).toBe('gate-1 · line `vouch` · requires 2 · noted');
  });
});
