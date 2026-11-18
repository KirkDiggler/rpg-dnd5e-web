/**
 * WAYS OUT LISTS THE EXITS (rpg-project#970): each set on its hex on the
 * map, listed here with a jump to that hex.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { StudioExits } from './StudioExits';

afterEach(cleanup);

describe('StudioExits', () => {
  it('lists the castle’s exits, each a jump to its hex', () => {
    const read = readDraftYaml(served);
    if (!read.ok) throw new Error(read.refusal);
    const onJump = vi.fn();
    render(<StudioExits exits={read.scope.exits ?? []} onJump={onJump} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Open exit postern at q -22, r 5' })
    );
    expect(onJump).toHaveBeenCalledWith({
      kind: 'hex',
      cell: { q: -22, r: 5 },
    });
    expect(
      screen.getByRole('button', { name: 'Open exit front-door at q -2, r 16' })
    ).toBeTruthy();
  });
});
