import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from '../encounter-studio/draftFile';
import served from '../encounter-studio/fixtures/the-mad-king-posts.yaml?raw';
import type { CreatureStates } from './creatureStates';
import { roomDoorIds } from './statePostEdits';
import { StatesEditor } from './StatesEditor';

/** gate-1's recipe in small: posted holds the gate, a future field rides
 * along, and down is terminal. */
const gate: CreatureStates = {
  initial: 'posted',
  posted: {
    blocks: true,
    holds: { door: 'gate-wall-door', at: [{ q: -3, r: 7 }] },
    watches: { every: 2 },
    transitions: [{ on: 'time', do: [{ pick: 'post' }] }],
  },
  cowed: { transitions: [{ on: 'time' }] },
  down: { terminal: true },
};

function Harness({ seen }: { seen: CreatureStates[] }) {
  const [value, setValue] = useState<CreatureStates | undefined>(gate);
  return (
    <StatesEditor
      owner="gate-1"
      value={value}
      doors={['gate-wall-door', 'postern']}
      onChange={(next) => {
        if (next) seen.push(next);
        setValue(next);
      }}
    />
  );
}

describe('a state’s post as fields (rpg-project#857)', () => {
  it('edits blocks, the door, the direction, the pass and the cells, keeping every other field', () => {
    const seen: CreatureStates[] = [];
    render(<Harness seen={seen} />);
    const last = () => seen.at(-1)!;

    fireEvent.click(screen.getByLabelText('Blocks in gate-1 cowed'));
    expect(last().cowed).toEqual({
      blocks: true,
      transitions: [{ on: 'time' }],
    });

    fireEvent.change(screen.getByLabelText('Holds against in gate-1 posted'), {
      target: { value: 'entering' },
    });
    expect(last().posted).toMatchObject({
      holds: { door: 'gate-wall-door', against: 'entering' },
    });
    fireEvent.change(screen.getByLabelText('Pass fact in gate-1 posted'), {
      target: { value: 'troupe-admitted' },
    });
    fireEvent.change(screen.getByLabelText('Held door in gate-1 posted'), {
      target: { value: 'postern' },
    });
    fireEvent.click(screen.getByLabelText('Add post cell in gate-1 posted'));
    fireEvent.change(screen.getByLabelText('Post cell 2 q in gate-1 posted'), {
      target: { value: '-4' },
    });
    expect(last().posted).toEqual({
      blocks: true,
      holds: {
        door: 'postern',
        at: [
          { q: -3, r: 7 },
          { q: -4, r: 7 },
        ],
        against: 'entering',
        pass: 'troupe-admitted',
      },
      watches: { every: 2 },
      transitions: [{ on: 'time', do: [{ pick: 'post' }] }],
    });

    // Both is the default: choosing it writes no word. An empty pass, and
    // removing the last cell, write none either.
    fireEvent.change(screen.getByLabelText('Holds against in gate-1 posted'), {
      target: { value: 'both' },
    });
    fireEvent.change(screen.getByLabelText('Pass fact in gate-1 posted'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByLabelText('Remove post cell 2 in gate-1 posted')
    );
    fireEvent.click(
      screen.getByLabelText('Remove post cell 1 in gate-1 posted')
    );
    expect(last().posted).toEqual({
      blocks: true,
      holds: { door: 'postern' },
      watches: { every: 2 },
      transitions: [{ on: 'time', do: [{ pick: 'post' }] }],
    });

    fireEvent.click(screen.getByLabelText('Blocks in gate-1 posted'));
    fireEvent.click(screen.getByLabelText('Holds a door in gate-1 posted'));
    expect(last().posted).toEqual({
      watches: { every: 2 },
      transitions: [{ on: 'time', do: [{ pick: 'post' }] }],
    });
    fireEvent.click(screen.getByLabelText('Holds a door in gate-1 cowed'));
    expect(last().cowed).toMatchObject({ holds: { door: 'gate-wall-door' } });
  });

  it('offers the site’s doors, names an undeclared one, and gives a terminal state no post', () => {
    render(<Harness seen={[]} />);
    expect(
      [...document.querySelectorAll('#post-doors-gate-1 option')].map(
        (o) => (o as HTMLOptionElement).value
      )
    ).toEqual(['gate-wall-door', 'postern']);
    fireEvent.change(screen.getByLabelText('Held door in gate-1 posted'), {
      target: { value: 'moat' },
    });
    expect(
      screen.getByText(/declares no door with the id “moat”/)
    ).toBeTruthy();
    expect(screen.queryByLabelText('Blocks in gate-1 down')).toBeNull();
    expect(screen.getByText(/down is terminal/)).toBeTruthy();
  });

  it('the served castle offers its gate door to a post', () => {
    const result = readDraftYaml(served);
    if (!result.ok) throw new Error(result.refusal);
    expect(roomDoorIds(result.draft.room)).toContain('gate-wall-door');
  });
});
