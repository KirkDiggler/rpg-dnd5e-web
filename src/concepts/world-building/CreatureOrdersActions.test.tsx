/** A placement's Add action and Drop action under Overrides
 * (rpg-project#721): each edit writes the placement's binding and keeps the
 * rest of its orders. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import type { RoomMonsterBinding } from './roomDraft';
import { CreatureOrders } from './SitePolicies';

const fixture = decodeWorldBuilderV4Site();
const goblin = fixture.draft.room.monsterDeclarations.find(
  (monster) => monster.id === 'goblin-1'
)!;

function Harness({
  onBinding,
}: {
  onBinding(next: RoomMonsterBinding | undefined): void;
}) {
  const [binding, setBinding] = useState(
    fixture.draft.room.monsterBindings?.['goblin-1']
  );
  return (
    <CreatureOrders
      scope={{ factions: fixture.factions, dispositions: fixture.dispositions }}
      monster={goblin}
      room={fixture.draft.room}
      binding={binding}
      onOrdersChange={(next) => {
        setBinding(next);
        onBinding(next);
      }}
    />
  );
}

describe('CreatureOrders — Add action and Drop action', () => {
  it('writes the placement binding in order, keeps its other orders, and moves', () => {
    const seen: (RoomMonsterBinding | undefined)[] = [];
    render(<Harness onBinding={(next) => seen.push(next)} />);
    const original = fixture.draft.room.monsterBindings?.['goblin-1'];
    const drop = screen.getByTestId('action-refs-dropActions');
    for (const ref of ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow']) {
      fireEvent.change(
        within(drop).getByLabelText('New dropped action reference'),
        { target: { value: ref } }
      );
      fireEvent.click(
        within(drop).getByRole('button', { name: 'Drop action' })
      );
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move dropped action dnd5e:weapons:shortbow earlier',
      })
    );
    const last = seen[seen.length - 1];
    expect(last?.dropActions).toEqual([
      'dnd5e:weapons:shortbow',
      'dnd5e:weapons:scimitar',
    ]);
    expect(last?.faction).toBe(original?.faction);
    expect(last?.options).toEqual(original?.options);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove dropped action dnd5e:weapons:shortbow',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove dropped action dnd5e:weapons:scimitar',
      })
    );
    expect(seen[seen.length - 1]).toEqual(original);
  });
});
