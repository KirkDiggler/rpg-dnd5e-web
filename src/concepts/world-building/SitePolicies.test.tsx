/**
 * The read-only site-policy views against the engine's own pinned v4 example
 * (rpg-dnd5e-web#1157, design slice 2).
 *
 * These are RENDER tests, not grammar tests: the decoder's strictness is
 * already covered by `singleRoomDungeon.test.ts` and the fixture's own test.
 * What is asserted here is that the document's facts appear as facts — the
 * mix, the shared table with each entry's weight, say and one word, the
 * disposition's stance and `until`, and one creature's inherited-vs-
 * overridden split with both asymmetries stated — and that nothing offers an
 * editing control.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import { CreatureOrders, SitePolicies } from './SitePolicies';
import type { SiteScope } from './siteScope';

const fixture = decodeWorldBuilderV4Site();

/** The engine's example scope, which carries both keys. */
const siteScope: SiteScope = {
  factions: fixture.factions,
  dispositions: fixture.dispositions,
};

/** The example's goblin, which overrides all three binding fields. */
const goblin = fixture.draft.room.monsters.find(
  (monster) => monster.id === 'goblin-1'
)!;

describe('SitePolicies — the site’s own facts', () => {
  it('renders a faction’s mix and shared table, and the dispositions between factions', () => {
    render(<SitePolicies scope={siteScope} />);

    const panel = screen.getByTestId('site-policies');
    // Identity and the temperament MIX, which is legal on a faction alone.
    expect(within(panel).getByText('goblins')).toBeTruthy();
    expect(
      within(panel).getByText('coward ×2 · soldier ×1 · aggressive ×1')
    ).toBeTruthy();

    // The shared table its members inherit, trigger by trigger, with each
    // entry's weight, its `say` and the one word it does.
    expect(within(panel).getByText('intimidated')).toBeTruthy();
    expect(
      within(panel).getByText(
        'weight 70 · say “Fine! The cellar door is behind the barrels.” · fact goblin-cowed'
      )
    ).toBeTruthy();
    expect(
      within(panel).getByText('weight 30 · say “Boss! BOSS!” · flee')
    ).toBeTruthy();
    expect(within(panel).getByText('time')).toBeTruthy();
    // An omitted weight is the engine's 1, and the word's selector is named.
    expect(
      within(panel).getByText('weight 1 · when enemy reach · attack enemy')
    ).toBeTruthy();

    // A disposition is the pair, its stance, and the `until` that ends it.
    expect(within(panel).getByText('goblins ↔ party')).toBeTruthy();
    expect(within(panel).getByText('hostile')).toBeTruthy();
    expect(within(panel).getByText('fact goblin-cowed')).toBeTruthy();
  });

  it('is read-only: the facts offer no input, textarea, select or button', () => {
    const { container } = render(<SitePolicies scope={siteScope} />);
    expect(
      container.querySelectorAll('input, textarea, select, button')
    ).toHaveLength(0);
  });

  it('renders a word temper and an authored mind, and says when nothing is authored', () => {
    render(
      <SitePolicies
        scope={{
          factions: [
            { id: 'bandits', mind: 'bandit-chief', temper: 'soldier' },
          ],
        }}
      />
    );
    const panel = screen.getByTestId('site-policies');
    expect(within(panel).getByText('bandits')).toBeTruthy();
    expect(within(panel).getByText('bandit-chief')).toBeTruthy();
    expect(within(panel).getByText('soldier')).toBeTruthy();
    // Absence is a statement, not an error.
    expect(
      within(panel).getByText('No dispositions are authored.')
    ).toBeTruthy();

    // A site with nothing authored says so plainly.
    render(<SitePolicies scope={{}} />);
    render(<SitePolicies scope={{ factions: [], dispositions: [] }} />);
    expect(screen.getAllByTestId('policies-none')).toHaveLength(2);
    expect(screen.getAllByTestId('policies-none')[0]!.textContent).toMatch(
      /No factions and no dispositions are authored on this site\./
    );
  });
});

describe('CreatureOrders — inherited vs overridden for a selected creature', () => {
  it('shows what the goblin’s faction supplies and what its own block overrides', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        binding={fixture.draft.room.monsterBindings?.['goblin-1']}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(within(creature).getByText('goblins')).toBeTruthy();

    // Inherited: the faction's mix and both shared-table triggers.
    expect(
      within(creature).getByText(/coward ×2 · soldier ×1 · aggressive ×1/)
    ).toBeTruthy();
    expect(within(creature).getByText('intimidated')).toBeTruthy();

    // Overridden: its own ONE word, its own `time` table and its actions.
    expect(within(creature).getByText(/^temper coward$/)).toBeTruthy();
    expect(
      within(creature).getByText('weight 1 · when enemy reach · hold')
    ).toBeTruthy();
    expect(
      within(creature).getByText(
        /dnd5e:weapons:scimitar, dnd5e:weapons:shortbow/
      )
    ).toBeTruthy();
  });

  it('states the two asymmetries where the orders are read', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        binding={fixture.draft.room.monsterBindings?.['goblin-1']}
      />
    );
    expect(screen.getByTestId('faction-layer-rule').textContent).toMatch(
      /nearest key wins WHOLESALE/
    );
    expect(screen.getByTestId('faction-layer-rule').textContent).toMatch(
      /entry lists are never merged/
    );
    expect(screen.getByTestId('temper-asymmetry').textContent).toMatch(
      /a word or a mix/
    );
    expect(screen.getByTestId('temper-asymmetry').textContent).toMatch(
      /placement’s is one word/
    );
  });

  it('renders an absent faction as the kind’s default, never as a faction named monsters', () => {
    const skeleton = fixture.draft.room.monsters.find(
      (monster) => monster.id === 'skeleton-a'
    )!;
    render(
      <CreatureOrders
        scope={siteScope}
        monster={skeleton}
        binding={fixture.draft.room.monsterBindings?.['skeleton-a']}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(within(creature).getByText(/keeps its kind’s default/)).toBeTruthy();
    expect(within(creature).queryByText('monsters')).toBeNull();
    // It has no faction to inherit from; it overrides only its actions.
    expect(within(creature).getByTestId('creature-inherits-none')).toBeTruthy();
    expect(within(creature).getByText(/dnd5e:weapons:shortsword/)).toBeTruthy();
  });

  it('says when a placement keeps everything, and when its faction is not declared', () => {
    const { unmount } = render(
      <CreatureOrders
        scope={siteScope}
        monster={{
          id: 'stray',
          ref: 'dnd5e:monsters:zombie',
          cell: { q: 0, r: 0 },
        }}
      />
    );
    expect(screen.getByTestId('creature-inherits-none')).toBeTruthy();
    expect(screen.getByTestId('creature-overrides-none')).toBeTruthy();
    unmount();

    render(
      <CreatureOrders
        scope={siteScope}
        monster={{
          id: 'stray',
          ref: 'dnd5e:monsters:zombie',
          cell: { q: 0, r: 0 },
          faction: 'ghosts',
        }}
      />
    );
    expect(screen.getByTestId('creature-inherits-unknown').textContent).toMatch(
      /declares no faction with the id “ghosts”/
    );
  });
});
