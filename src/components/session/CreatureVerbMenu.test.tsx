/** The choices over a creature that offers more than one verb
 * (rpg-project#872 D3). */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreatureVerb } from './clickToAct';
import { CreatureVerbList } from './CreatureVerbMenu';

const verbs: CreatureVerb[] = [
  { verb: 'attack', reach: 'out-of-reach' },
  { verb: 'speak' },
  { verb: 'bump' },
];

describe('the choices over a creature', () => {
  it('names each verb and shows an out-of-reach Attack disabled', () => {
    render(
      <CreatureVerbList
        subject="gate-1"
        name="Guard"
        verbs={verbs}
        onChoose={() => {}}
        onClose={() => {}}
      />
    );
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Out of reach',
      'Speak to Guard',
      'Walk up to Guard',
    ]);
    expect((items[0] as HTMLButtonElement).disabled).toBe(true);
    expect((items[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('a choice hands that verb back for that creature', () => {
    const onChoose = vi.fn();
    render(
      <CreatureVerbList
        subject="gate-1"
        name="Guard"
        verbs={verbs}
        onChoose={onChoose}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByText('Speak to Guard'));
    expect(onChoose).toHaveBeenCalledWith('gate-1', { verb: 'speak' });
    fireEvent.click(screen.getByText('Out of reach'));
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
