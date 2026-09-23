import { create } from '@bufbuild/protobuf';
import { SpellInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SpellInfoDisplay } from './SpellInfoDisplay';

vi.mock('../../../api/useSpellCatalog', () => ({
  useSpellCatalog: () =>
    new Map([
      [
        'dnd5e:spells:identify',
        create(SpellInfoSchema, {
          spellRef: 'dnd5e:spells:identify',
          name: 'Identify',
          notYetImplemented: true,
        }),
      ],
      [
        'dnd5e:spells:command',
        create(SpellInfoSchema, {
          spellRef: 'dnd5e:spells:command',
          name: 'Command',
        }),
      ],
    ]),
}));
it('shows known NYI grants alongside existing spells without offering a cast', () => {
  render(
    <SpellInfoDisplay
      knownSpellRefs={['dnd5e:spells:identify', 'dnd5e:spells:command']}
    />
  );
  expect(screen.getByText('Identify')).toBeTruthy();
  expect(screen.getByText('(Not yet implemented)')).toBeTruthy();
  expect(screen.getByText('Command')).toBeTruthy();
  expect(screen.getAllByText('(Not yet implemented)')).toHaveLength(1);
  expect(screen.queryByRole('button')).toBeNull();
});

it('renders acquired spell refs when the provider omits spellcasting metadata', () => {
  render(
    <SpellInfoDisplay
      knownCantripRefs={['dnd5e:spells:light']}
      knownSpellRefs={[
        'dnd5e:spells:bless',
        'dnd5e:spells:cure-wounds',
        'dnd5e:spells:healing-word',
      ]}
    />
  );
  for (const name of ['Light', 'Bless', 'Cure Wounds', 'Healing Word'])
    expect(screen.getByText(name)).toBeTruthy();
  expect(screen.queryByText('1st Level Spell Slots')).toBeNull();
  expect(screen.queryByText('Ritual Casting')).toBeNull();
});
