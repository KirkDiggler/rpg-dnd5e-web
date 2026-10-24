import { create } from '@bufbuild/protobuf';
import { CharacterDataSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterStatusRail } from './CharacterStatusRail';
import { presentCharacterData } from './characterPresentation';
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function character(current = 3) {
  return presentCharacterData(
    create(CharacterDataSchema, {
      features: [
        {
          ref: { module: 'dnd5e', type: 'features', id: 'bardic_inspiration' },
          name: 'Bardic Inspiration',
          detail: 'Provider-authored inspiration explanation.',
          resourceKey: 'inspiration',
        },
      ],
      conditions: [
        {
          ref: {
            module: 'dnd5e',
            type: 'conditions',
            id: 'opportunity_attack',
          },
          name: 'Opportunity Attack',
          detail: 'Provider-authored reaction explanation.',
        },
      ],
      resources: [
        { key: 'inspiration', name: 'Bardic Inspiration', current, maximum: 3 },
        { key: 'hit_dice', name: 'Hit Dice', current: 1, maximum: 1 },
      ],
    })
  );
}
describe('character status icon rail', () => {
  it('uses compact mapped icons with one linked pool badge and readable focus details', async () => {
    render(<CharacterStatusRail character={character()} />);
    const rail = screen.getByRole('group', { name: 'Effects and resources' });
    expect(within(rail).getAllByRole('button')).toHaveLength(3);
    const trigger = within(rail).getByRole('button', {
      name: 'Inspect Bardic Inspiration',
    });
    expect(trigger.querySelector('img')?.getAttribute('src')).toContain(
      'Fortified_01'
    );
    expect(trigger).toHaveTextContent('3');
    act(() => trigger.focus());
    const summary = await screen.findByRole('tooltip');
    expect(summary).toHaveTextContent(
      'Provider-authored inspiration explanation.'
    );
    expect(summary).toHaveTextContent('3/3');
  });
  it('keeps depleted resources inspectable and refreshes an open detail without executing an action', async () => {
    const { rerender } = render(
      <CharacterStatusRail character={character(0)} />
    );
    const trigger = screen.getByRole('button', {
      name: 'Inspect Bardic Inspiration',
    });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Bardic Inspiration' })
    ).toHaveTextContent('0/3');
    expect(
      screen.queryByRole('button', { name: /^(Use|Activate)$/ })
    ).toBeNull();
    rerender(<CharacterStatusRail character={character(2)} />);
    expect(
      screen.getByRole('dialog', { name: 'Bardic Inspiration' })
    ).toHaveTextContent('2/3');
    fireEvent.click(screen.getByRole('button', { name: 'Close inspection' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('carries stale snapshot state into the inspection instead of implying fresh counts', () => {
    render(
      <CharacterStatusRail character={character()} privateStatus="stale" />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Bardic Inspiration' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Bardic Inspiration' })
    ).toHaveTextContent('Last confirmed status · May be out of date');
  });
  it('removes stale inspection when its source entry disappears', () => {
    const { rerender } = render(
      <CharacterStatusRail character={character()} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Bardic Inspiration' })
    );
    rerender(
      <CharacterStatusRail
        character={presentCharacterData(create(CharacterDataSchema, {}))}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
