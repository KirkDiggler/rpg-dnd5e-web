import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { factIndexOf } from '../world-building/factIndex';
import { createCastleReadBackDocument } from './fixtures/castleReadBack';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { StudioEndings } from './StudioEndings';
import type { EncounterStudioSession } from './studioSession';

afterEach(cleanup);

function castleSession(): EncounterStudioSession {
  const document = createCastleReadBackDocument();
  document.scope.endings = [
    { id: 'king-slain', when: { down: 'captain' } },
    { id: 'king-deposed', when: { fact: 'king-deposed' } },
  ];
  return { ...createFakeStudioSession(), document };
}
const endings = () => within(screen.getByRole('region', { name: 'Endings' }));

describe('StudioEndings (rpg-project#578)', () => {
  it('an ending reads as its sentence', () => {
    render(<StudioEndings session={castleSession()} />);
    const items = within(
      screen.getByRole('list', { name: 'Authored endings' })
    ).getAllByRole('listitem');
    expect(items.map((item) => item.firstChild?.textContent)).toEqual([
      'king-slain: when captain is down',
      'king-deposed: when king-deposed is known',
    ]);
  });

  it('holds is not offered for an ending', () => {
    render(<StudioEndings session={castleSession()} />);
    fireEvent.click(endings().getByRole('button', { name: 'Add ending' }));
    const form = endings().getByLabelText(
      'Ending when form'
    ) as HTMLSelectElement;
    const values = [...form.options].map((option) => option.value);
    expect(values).toEqual(['', 'fact', 'round', 'down', 'stance']);
    expect(values).not.toContain('holds');
    expect(values).not.toContain('none');
  });

  it('an ending with no when cannot be applied', () => {
    const session = castleSession();
    render(<StudioEndings session={session} />);
    fireEvent.click(endings().getByRole('button', { name: 'Add ending' }));
    fireEvent.change(endings().getByLabelText('Ending id'), {
      target: { value: 'held-out' },
    });
    expect(
      (
        endings().getByRole('button', {
          name: 'Apply ending',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(endings().getByLabelText('Ending when form'), {
      target: { value: 'round' },
    });
    fireEvent.change(endings().getByLabelText('Ending when round'), {
      target: { value: '5' },
    });
    expect(
      endings().getByText('The run ends when round 5 begins.')
    ).toBeTruthy();
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(session.endings.set).toHaveBeenCalledExactlyOnceWith([
      { id: 'king-slain', when: { down: 'captain' } },
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
      { id: 'held-out', when: { round: 5 } },
    ]);
  });

  it('a duplicate id is refused with the validator sentence and nothing is written', () => {
    const session = castleSession();
    render(<StudioEndings session={session} />);
    fireEvent.click(endings().getByRole('button', { name: 'Add ending' }));
    fireEvent.change(endings().getByLabelText('Ending id'), {
      target: { value: 'king-slain' },
    });
    fireEvent.change(endings().getByLabelText('Ending when form'), {
      target: { value: 'fact' },
    });
    fireEvent.change(endings().getByLabelText('Ending when fact'), {
      target: { value: 'x' },
    });
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(endings().getByRole('alert').textContent).toBe(
      'Site ending at index 2: duplicate ending id: king-slain'
    );
    expect(session.endings.set).not.toHaveBeenCalled();
  });

  it('rename, reorder and remove each write the whole list once', () => {
    const session = castleSession();
    render(<StudioEndings session={session} />);
    fireEvent.click(
      endings().getByRole('button', { name: 'Move ending king-deposed up' })
    );
    expect(session.endings.set).toHaveBeenLastCalledWith([
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
      { id: 'king-slain', when: { down: 'captain' } },
    ]);
    fireEvent.click(
      endings().getByRole('button', { name: 'Edit ending king-slain' })
    );
    fireEvent.change(endings().getByLabelText('Ending id'), {
      target: { value: 'king-dead' },
    });
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(session.endings.set).toHaveBeenLastCalledWith([
      { id: 'king-dead', when: { down: 'captain' } },
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
    ]);
    fireEvent.click(
      endings().getByRole('button', { name: 'Remove ending king-deposed' })
    );
    expect(session.endings.set).toHaveBeenLastCalledWith([
      { id: 'king-slain', when: { down: 'captain' } },
    ]);
  });

  it('a focus from the fact index opens that ending', () => {
    render(<StudioEndings session={castleSession()} focus="king-deposed" />);
    expect(
      (endings().getByLabelText('Ending id') as HTMLInputElement).value
    ).toBe('king-deposed');
    expect(
      (endings().getByLabelText('Ending when fact') as HTMLInputElement).value
    ).toBe('king-deposed');
  });

  it("the fact index lists an ending as its fact's reader, linked to Endings", () => {
    const row = factIndexOf(castleSession().document).find(
      (candidate) => candidate.fact === 'king-deposed'
    );
    expect(row?.readers).toEqual([
      {
        kind: 'ending',
        label: 'ending king-deposed',
        target: { home: 'endings', id: 'king-deposed' },
      },
    ]);
  });
});
