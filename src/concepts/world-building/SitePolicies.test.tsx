/**
 * The site-policy views against the engine's own pinned v4 example
 * (rpg-dnd5e-web#1157 read-only; #1160 makes the site's own facts editable).
 *
 * These are RENDER tests, not grammar tests: the decoder's strictness is
 * covered by `singleRoomDungeon.test.ts` and the fixture's own test, and the
 * edit mechanics by `sitePolicyEdits.test.ts`. What is asserted here is that
 * the document's facts appear as CONTROLS holding the document's values — the
 * faction's id, its mix, its shared table with each entry's weight, say and one
 * word, the disposition's pair and stance — that the add verbs hand the parent
 * a next scope, and that a creature's inherited-vs-overridden split stays a
 * readout with both asymmetries stated.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('SitePolicies — the site’s own facts, editable', () => {
  it('shows a faction’s id, mix and shared table, and the dispositions between sides', () => {
    render(
      <SitePolicies
        scope={siteScope}
        room={fixture.draft.room}
        onChange={() => {}}
      />
    );

    const panel = screen.getByTestId('site-policies');
    // The id is a control holding the document's value.
    const idInput = within(panel).getByLabelText(
      'Faction id for goblins'
    ) as HTMLInputElement;
    expect(idInput.value).toBe('goblins');
    // The mix is shown with the words the declaration seals.
    expect(
      within(panel).getByText('temper coward ×2 · soldier ×1 · aggressive ×1')
    ).toBeTruthy();

    // The shared table, trigger by trigger, with each entry's weight, its
    // `say` and the one word it does.
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
    expect(
      within(panel).getByText('weight 1 · when enemy reach · attack enemy')
    ).toBeTruthy();

    // A disposition is the pair, its stance, and the `until` that ends it.
    expect(
      (
        within(panel).getByLabelText(
          'Between first faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('goblins');
    expect(
      (
        within(panel).getByLabelText(
          'Between second faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('party');
    expect(
      (within(panel).getByLabelText('Stance') as HTMLSelectElement).value
    ).toBe('hostile');
    expect(within(panel).getByText('fact goblin-cowed')).toBeTruthy();

    // It IS editable: the facts are controls now.
    expect(
      panel.querySelectorAll('input, select, button').length
    ).toBeGreaterThan(0);
  });

  it('hands the parent a next scope when a faction or a disposition is added', () => {
    const onChange = vi.fn();
    render(
      <SitePolicies scope={{}} room={fixture.draft.room} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add faction' }));
    expect(onChange).toHaveBeenCalled();
    const withFaction = onChange.mock.calls[0]![0] as SiteScope;
    expect(withFaction.factions).toHaveLength(1);
    expect(withFaction.factions?.[0]?.id).toBeTruthy();
  });

  it('says when nothing is authored, and offers the add verb', () => {
    render(
      <SitePolicies scope={{}} room={fixture.draft.room} onChange={() => {}} />
    );
    expect(screen.getByTestId('policies-none').textContent).toMatch(
      /No factions and no dispositions are authored on this site\./
    );
    expect(screen.getByRole('button', { name: 'Add faction' })).toBeTruthy();
    // No faction exists, so there is nothing to declare a stance about.
    expect(
      (
        screen.getByRole('button', {
          name: 'Add disposition',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('adds a disposition once a faction exists', () => {
    const onChange = vi.fn();
    render(
      <SitePolicies
        scope={{ factions: [{ id: 'goblins' }] }}
        room={fixture.draft.room}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add disposition' }));
    const withDisposition = onChange.mock.calls[0]![0] as SiteScope;
    expect(withDisposition.dispositions).toEqual([
      { between: ['goblins', 'party'], stance: 'hostile' },
    ]);
  });
});

describe('CreatureOrders — inherited vs overridden for a selected creature', () => {
  it('shows what the goblin’s faction supplies and what its own block overrides', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
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
        room={fixture.draft.room}
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
        room={fixture.draft.room}
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
        room={fixture.draft.room}
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
        room={fixture.draft.room}
      />
    );
    expect(screen.getByTestId('creature-inherits-unknown').textContent).toMatch(
      /declares no faction with the id “ghosts”/
    );
  });
});

describe('CreatureOrders — the creature’s checks, intel and reserve (web#1176)', () => {
  it('edits the priced checks, handing the parent a next binding each time', () => {
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ intimidate: [{ ability: 'intimidation', dc: 12 }] }}
        onOrdersChange={onOrdersChange}
      />
    );
    const intimidate = screen.getByTestId('creature-intimidate');
    expect(
      (
        within(intimidate).getByLabelText(
          'Intimidate ability 0'
        ) as HTMLInputElement
      ).value
    ).toBe('intimidation');
    expect(
      (within(intimidate).getByLabelText('Intimidate dc 0') as HTMLInputElement)
        .value
    ).toBe('12');

    // A new row starts blank with a legal DC — the form never invents an
    // ability word, because it keeps no rules catalog.
    fireEvent.click(within(intimidate).getByLabelText('Add Intimidate row'));
    expect(onOrdersChange.mock.calls[0][0].intimidate).toEqual([
      { ability: 'intimidation', dc: 12 },
      { ability: '', dc: 1 },
    ]);

    // Persuade with nothing authored says the rulebook derives the DC.
    expect(
      within(screen.getByTestId('creature-persuade')).getByTestId(
        'creature-persuade-none'
      )
    ).toBeTruthy();
  });

  it('gives and takes away a held record from the site’s declared ones', () => {
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={{
          ...siteScope,
          intel: [{ id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } }],
        }}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ actions: ['dnd5e:weapons:scimitar'] }}
        onOrdersChange={onOrdersChange}
      />
    );
    expect(screen.getByTestId('creature-holds-none')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Give intel record'), {
      target: { value: 'cellar-lie' },
    });
    expect(onOrdersChange.mock.calls[0][0].holds).toEqual(['cellar-lie']);
  });

  it('says when the site has no records to give, rather than showing an empty picker', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ actions: ['dnd5e:weapons:scimitar'] }}
        onOrdersChange={() => {}}
      />
    );
    expect(screen.getByTestId('creature-holds-no-records')).toBeTruthy();
  });

  it('authors the reserve predicate in the same four forms as an `until`', () => {
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        onOrdersChange={onOrdersChange}
      />
    );
    // Nothing authored: the creature is in the run from the first frame.
    expect(screen.getByTestId('creature-arrives-note').textContent).toMatch(
      /in the run from the first frame/
    );
    fireEvent.change(screen.getByLabelText('Arrives form'), {
      target: { value: 'fact' },
    });
    expect(onOrdersChange.mock.calls[0][0].arrives).toEqual({ fact: '' });

    // And a fact form writes what the author types.
    onOrdersChange.mockClear();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ arrives: { fact: 'cellar-is-clear' } }}
        onOrdersChange={onOrdersChange}
      />
    );
    expect(
      screen.getAllByTestId('creature-arrives-note')[1].textContent
    ).toMatch(/Held in reserve until fact cellar-is-clear/);
  });

  it('reports the interaction facts read-only when no editor is given', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{
          intimidate: [{ ability: 'intimidation', dc: 12 }],
          persuade: [
            { ability: 'persuasion', dc: 10, tool: 'dnd5e:items:lute' },
          ],
          holds: ['cellar-lie'],
          arrives: { fact: 'cellar-is-clear' },
        }}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(
      within(creature).getByText('intimidate dc 12 intimidation')
    ).toBeTruthy();
    expect(
      within(creature).getByText(
        'persuade dc 10 persuasion via dnd5e:items:lute'
      )
    ).toBeTruthy();
    expect(within(creature).getByText('holds cellar-lie')).toBeTruthy();
    expect(
      within(creature).getByText(/held in reserve until fact cellar-is-clear/)
    ).toBeTruthy();
    expect(screen.getByTestId('creature-interaction-readonly')).toBeTruthy();
  });
});
