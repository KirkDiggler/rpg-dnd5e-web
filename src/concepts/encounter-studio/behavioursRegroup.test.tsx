/**
 * A CREATURE IS GIVEN A BEHAVIOUR THE FILE DEFINES, AND THE RETIRED KEYS
 * RIDE THROUGH (rpg-project#970). The picker writes the creature's
 * `behaviors` and `behaviorState` and nothing else; a file that still
 * carries root `tables`, `scenarios`, a faction `table` or a creature `on`
 * opens and downloads byte for byte, and its forms say so in one line with
 * no editor for them.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignBehaviour,
  behaviourChoicesOf,
} from '../world-building/behaviourChoice';
import { withBinding } from '../world-building/monsterOrderEdits';
import type { RoomMonsterBinding } from '../world-building/roomDraft';
import { CreatureOrders, FactionsPanel } from '../world-building/SitePolicies';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

afterEach(cleanup);

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}
function editedFirst(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

describe('the behaviour picker', () => {
  it('offers the castle’s ten definitions; each is concrete, so each can be assigned', () => {
    const choices = behaviourChoicesOf(read(served).scope);
    expect(choices.map((choice) => choice.id)).toEqual([
      'gate-1-policy',
      'gate-2-policy',
      'captain-policy',
      'reserve-1-policy',
      'reserve-2-policy',
      'hall-1-policy',
      'keep-1-policy',
      'keep-2-policy',
      'sergeant-policy',
      'turnkey-policy',
    ]);
    expect(choices.every((choice) => choice.assignable)).toBe(true);
  });

  it('a sequence definition needs cells, so it is offered with the reason and not assigned', () => {
    const text = editedFirst(
      served,
      'behaviorDefinitions:\n',
      'behaviorDefinitions:\n  walk-the-wall:\n    ref: dnd5e:sequences:walk\n    end: repeat\n    body: {}\n'
    );
    const choice = behaviourChoicesOf(read(text).scope).find(
      (c) => c.id === 'walk-the-wall'
    )!;
    expect(choice).toEqual({
      id: 'walk-the-wall',
      assignable: false,
      reason: 'needs cells to walk: edit in the file',
    });
  });

  it('assigning writes behaviors and behaviorState only, and the castle downloads with just those lines changed', () => {
    const result = read(served);
    const room = result.draft.room;
    const before = room.monsterBindings!['hall-1']!;
    const after = assignBehaviour(before, 'keep-1-policy');
    const { behaviors, behaviorState, ...rest } =
      after as RoomMonsterBinding & {
        behaviors?: unknown;
        behaviorState?: unknown;
      };
    const { behaviors: _b, ...restBefore } = before as RoomMonsterBinding & {
      behaviors?: unknown;
    };
    void _b;
    expect(rest).toEqual(restBefore);
    expect(behaviors).toEqual([{ id: 'policy', use: 'keep-1-policy' }]);
    expect(behaviorState).toBe('policy');
    const draft = {
      ...result.draft,
      room: {
        ...room,
        monsterBindings: withBinding(room.monsterBindings, 'hall-1', after),
      },
    };
    expect(exportDraftYaml({ draft, scope: result.scope }, result.key)).toBe(
      served.replace(
        '            use: hall-1-policy\n',
        '            use: keep-1-policy\n        behaviorState: policy\n'
      )
    );
  });

  it('the king, who runs nothing yet, is given keep-1-policy: the binding gains behaviors and behaviorState, nothing else', () => {
    // The reviewer compiled exactly this file with the engine (rpg-toolkit
    // bb5806f7, `cmd/readback --full`): "The routine `keep-1-policy` is run
    // by Knight (keep-1) and The Mad King (king)". The hall-1 case above
    // compiled the same way (rpg-dnd5e-web#1443 review).
    const result = read(served);
    const room = result.draft.room;
    const after = assignBehaviour(room.monsterBindings!.king, 'keep-1-policy');
    const draft = {
      ...result.draft,
      room: {
        ...room,
        monsterBindings: withBinding(room.monsterBindings, 'king', after),
      },
    };
    expect(exportDraftYaml({ draft, scope: result.scope }, result.key)).toBe(
      served.replace(
        '      king:\n        faction: loyalists\n',
        '      king:\n        faction: loyalists\n        behaviors:\n          - id: policy\n            use: keep-1-policy\n        behaviorState: policy\n'
      )
    );
  });

  it('the creature form names its behaviour and its picker writes through the orders', () => {
    const result = read(served);
    const monster = result.draft.room.monsterDeclarations.find(
      (m) => m.id === 'hall-1'
    )!;
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={result.scope}
        monster={monster}
        room={result.draft.room}
        binding={result.draft.room.monsterBindings!['hall-1']}
        onOrdersChange={onOrdersChange}
      />
    );
    const picker = screen.getByRole('combobox', {
      name: 'Behaviour for hall-1',
    }) as HTMLSelectElement;
    expect(picker.value).toBe('hall-1-policy');
    fireEvent.change(picker, { target: { value: 'keep-1-policy' } });
    expect(onOrdersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        behaviors: [{ id: 'policy', use: 'keep-1-policy' }],
        behaviorState: 'policy',
      })
    );
  });
});

describe('the picker checks a creature’s posts against a definition’s states (rpg-project#970 review B)', () => {
  const pickerFor = (id: string) => {
    const result = read(served);
    const monster = result.draft.room.monsterDeclarations.find(
      (m) => m.id === id
    )!;
    render(
      <CreatureOrders
        scope={result.scope}
        monster={monster}
        room={result.draft.room}
        binding={result.draft.room.monsterBindings![id]}
        onOrdersChange={vi.fn()}
      />
    );
    return screen.getByRole('combobox', {
      name: `Behaviour for ${id}`,
    }) as HTMLSelectElement;
  };
  const option = (select: HTMLSelectElement, value: string) =>
    [...select.options].find((entry) => entry.value === value)!;

  it('gate-1 cannot take captain-policy, which has none of the states it posts and blocks in', () => {
    const result = read(served);
    const gate = result.draft.room.monsterBindings!['gate-1'];
    const choices = behaviourChoicesOf(result.scope, gate, 'gate-1');
    expect(choices.find((c) => c.id === 'captain-policy')).toEqual({
      id: 'captain-policy',
      assignable: false,
      reason:
        'gate-1 holds posts or blocks in `alert`, `challenged`, `posted`; `captain-policy` has no state `alert`, `challenged`, `posted`',
    });
    expect(choices.find((c) => c.id === 'gate-1-policy')?.assignable).toBe(
      true
    );
    const select = pickerFor('gate-1');
    expect(option(select, 'captain-policy').disabled).toBe(true);
    expect(option(select, 'gate-1-policy').disabled).toBe(false);
    // No other definition fits, and the form says so.
    expect(
      screen.getByText(
        'No other behaviour this file defines has the states gate-1 holds posts or blocks in.'
      )
    ).toBeTruthy();
  });

  it('a creature with no posts can take any concrete definition', () => {
    const select = pickerFor('hall-1');
    expect(
      [...select.options]
        .filter((entry) => entry.value !== '')
        .every((entry) => !entry.disabled)
    ).toBe(true);
  });
});

/** The served castle with the retired keys put back: root `tables` and
 * `scenarios`, a faction's `table`, a creature's `on`. */
const retired = (() => {
  let text = editedFirst(
    served,
    'factions:\n  - id: garrison\n',
    'tables:\n  gate-patrol:\n    time:\n      - hold: {}\nscenarios:\n  smoke:\n    party: garrison\nfactions:\n  - id: garrison\n    table: gate-patrol\n'
  );
  text = editedFirst(
    text,
    '      hall-1:\n        faction: garrison\n',
    '      hall-1:\n        faction: garrison\n        on:\n          time:\n            - hold: {}\n'
  );
  return text;
})();

describe('the retired keys', () => {
  it('a file with root tables, scenarios, a faction table and a creature on downloads byte for byte', () => {
    const result = read(retired);
    expect(exportDraftYaml(result, result.key)).toBe(retired);
  });

  it('a faction that carries a table says so in one line and offers no table editor', () => {
    const result = read(retired);
    render(
      <FactionsPanel
        scope={result.scope}
        room={result.draft.room}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        'This faction still carries `table`, which the engine no longer reads; it refuses the file until it is removed.'
      )
    ).toBeTruthy();
    expect(screen.queryByLabelText('Table for garrison')).toBeNull();
    expect(screen.queryByLabelText(/^States YAML for /)).toBeNull();
  });

  it('a creature that carries on says so in one line and offers no table or states editor', () => {
    const result = read(retired);
    const monster = result.draft.room.monsterDeclarations.find(
      (m) => m.id === 'hall-1'
    )!;
    render(
      <CreatureOrders
        scope={result.scope}
        monster={monster}
        room={result.draft.room}
        binding={result.draft.room.monsterBindings!['hall-1']}
        onOrdersChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        'This creature still carries `on`, which the engine no longer reads; it refuses the file until it is removed.'
      )
    ).toBeTruthy();
    expect(screen.queryByLabelText('Table for hall-1')).toBeNull();
    expect(screen.queryByLabelText('States YAML for hall-1')).toBeNull();
  });
});
