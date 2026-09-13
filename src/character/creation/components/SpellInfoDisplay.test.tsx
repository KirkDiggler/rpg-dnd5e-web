import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SpellInfoDisplay } from './SpellInfoDisplay';

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
