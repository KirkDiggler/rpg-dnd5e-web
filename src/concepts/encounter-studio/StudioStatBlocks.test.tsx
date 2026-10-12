// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import type { EncounterStudioSession } from './studioSession';
import { StudioStatBlocks } from './StudioStatBlocks';
afterEach(cleanup);
function fixture() {
  const document = createPopulatedStudioDocument();
  document.scope.templates = {
    guard: {
      base: 'dnd5e:monsters:human',
      abilities: { str: 13, con: 12 },
      skills: [],
      actions: [],
      name: '',
      proficiency: 0,
      experience: 0,
    },
  };
  const commitTemplates = vi.fn<EncounterStudioSession['commitTemplates']>(
    () => true
  );
  const session = {
    document,
    intentEpoch: 0,
    commitTemplates,
  } as unknown as EncounterStudioSession;
  const mounted = render(<StudioStatBlocks session={session} />);
  fireEvent.change(screen.getByLabelText('Stat block', { exact: true }), {
    target: { value: 'guard' },
  });
  return { session, commitTemplates, ...mounted };
}
describe('stat block authored input staging', () => {
  it('keeps declaration order on an unchanged Apply', () => {
    const { session, commitTemplates, rerender } = fixture();
    const document = structuredClone(session.document);
    document.scope.templates!.cook = { base: 'dnd5e:monsters:human' };
    rerender(<StudioStatBlocks session={{ ...session, document }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply stat block' }));
    expect(Object.keys(commitTemplates.mock.calls[0][0])).toEqual([
      'guard',
      'cook',
    ]);
  });
  it('preserves untouched empty overrides and zeros, clears only an edited score, and never derives totals', () => {
    const { commitTemplates } = fixture();
    fireEvent.change(screen.getByLabelText('CON'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply stat block' }));
    expect(commitTemplates).toHaveBeenCalledWith({
      guard: {
        base: 'dnd5e:monsters:human',
        abilities: { str: 13 },
        skills: [],
        actions: [],
        name: '',
        proficiency: 0,
        experience: 0,
      },
    });
    expect(screen.queryByLabelText('HP')).toBeNull();
    expect(screen.queryByLabelText('AC')).toBeNull();
  });
  it('keeps invalid edits visible without committing; cancel and retired epochs restore the source', () => {
    const { session, commitTemplates, rerender } = fixture();
    fireEvent.change(screen.getByLabelText('Hit dice'), {
      target: { value: '2d8+2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply stat block' }));
    expect(commitTemplates).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('hitDice');
    expect((screen.getByLabelText('Hit dice') as HTMLInputElement).value).toBe(
      '2d8+2'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel stat block edits' })
    );
    expect((screen.getByLabelText('Hit dice') as HTMLInputElement).value).toBe(
      ''
    );
    fireEvent.change(screen.getByLabelText('Hit dice'), {
      target: { value: '3d8' },
    });
    rerender(<StudioStatBlocks session={{ ...session, intentEpoch: 1 }} />);
    expect((screen.getByLabelText('Hit dice') as HTMLInputElement).value).toBe(
      ''
    );
    expect(commitTemplates).not.toHaveBeenCalled();
  });
});
