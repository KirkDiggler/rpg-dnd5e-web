/**
 * BEHAVIOURS (rpg-project#970): every behaviour the file defines, from the
 * engine's read-back, with the engine's fold of what it does and who runs
 * it, each a jump. Building one is not this slice.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import { castleRoutinesReadBack } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { StudioBehaviours } from './StudioBehaviours';
import type { StudioReadBack } from './studioPublishing';

afterEach(cleanup);

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();
const state = (readBackIsCurrent = true): StudioReadBack => ({
  readBack: castleRoutinesReadBack(),
  readBackIsCurrent,
  unavailable: null,
});
const panel = () => screen.getByRole('region', { name: 'Behaviours' });

describe('StudioBehaviours', () => {
  it('lists the castle’s ten behaviours, the engine’s fold of each and who runs it', () => {
    const onJump = vi.fn();
    render(
      <StudioBehaviours
        document={castle}
        readBack={state()}
        focus={null}
        onSelect={vi.fn()}
        onJump={onJump}
      />
    );
    const rows = within(
      within(panel()).getByRole('list', { name: 'Behaviours' })
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.dataset.routine)).toEqual([
      'captain-policy',
      'gate-1-policy',
      'gate-2-policy',
      'hall-1-policy',
      'keep-1-policy',
      'keep-2-policy',
      'reserve-1-policy',
      'reserve-2-policy',
      'sergeant-policy',
      'turnkey-policy',
    ]);
    expect(rows[0]!.textContent).toContain(
      'Routine `captain-policy` — run by Guard Captain (captain); starts in `ready`'
    );
    fireEvent.click(
      within(rows[0]!).getByRole('button', { name: 'Open creature captain' })
    );
    expect(onJump).toHaveBeenCalledWith({ kind: 'creature', id: 'captain' });
  });

  it('a selected behaviour opens to its Read back', () => {
    const onSelect = vi.fn();
    render(
      <StudioBehaviours
        document={castle}
        readBack={state()}
        focus="hall-1-policy"
        onSelect={onSelect}
      />
    );
    expect(
      within(panel()).getByRole('region', { name: 'Read back' }).textContent
    ).toContain('Routine `hall-1-policy`');
    fireEvent.click(
      within(panel()).getByRole('button', { name: /^captain-policy\b/ })
    );
    expect(onSelect).toHaveBeenCalledWith('captain-policy');
  });

  it('a stale read-back says so; none says the engine has not said them', () => {
    const { rerender } = render(
      <StudioBehaviours
        document={castle}
        readBack={state(false)}
        focus={null}
        onSelect={vi.fn()}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'These sentences are from the last draft that compiled.'
    );
    rerender(
      <StudioBehaviours
        document={castle}
        readBack={{
          readBack: null,
          readBackIsCurrent: false,
          unavailable: null,
        }}
        focus={null}
        onSelect={vi.fn()}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'The engine has not said the behaviours yet.'
    );
  });
});
