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
import {
  CreatureOrders,
  DispositionsPanel,
  FactionsPanel,
} from './SitePolicies';
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

/** The site's two noun panels, together. They are separate NODES now
 * (rpg-dnd5e-web#1178 follow-up) but they read one scope, so a test of the
 * site's facts renders both. */
function SiteFacts(props: {
  scope: SiteScope;
  room?: Parameters<typeof DispositionsPanel>[0]['room'];
  onChange?: (next: SiteScope) => void;
  onNotice?: (message: string) => void;
}) {
  return (
    <>
      <FactionsPanel
        scope={props.scope}
        onChange={props.onChange ?? (() => {})}
        onNotice={props.onNotice}
      />
      <DispositionsPanel
        scope={props.scope}
        room={props.room ?? fixture.draft.room}
        onChange={props.onChange ?? (() => {})}
      />
    </>
  );
}

describe('SitePolicies — the site’s own facts, editable', () => {
  it('shows a faction’s id, mix and shared table, and the dispositions between sides', () => {
    render(<SiteFacts scope={siteScope} onChange={() => {}} />);

    // Factions and dispositions are peers now, so the faction facts are read
    // from the Factions node and the pair from the Dispositions node.
    const panel = screen.getByTestId('site-factions');
    // The id is a control holding the document's value.
    const idInput = within(panel).getByLabelText(
      'Faction id for goblins'
    ) as HTMLInputElement;
    expect(idInput.value).toBe('goblins');
    // The mix is shown with the words the declaration seals.
    expect(
      within(panel).getByText('temper coward ×2 · soldier ×1 · aggressive ×1')
    ).toBeTruthy();

    // The shared table, trigger by trigger, with each entry's weight, its `say`
    // and the one word it does. THE SOCIAL ROWS CARRY NO CONDITION LEAD: `when`
    // is illegal under a social key (the verdict IS the condition), so "any
    // time" there would assert a timing the row does not have. Only the `time`
    // row leads with its condition. (Corrected in review — the first cut
    // labelled every row, social included.)
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
      within(panel).getByText('when enemy reach · weight 1 · attack enemy')
    ).toBeTruthy();

    // A disposition is the pair, its stance, and the `until` that ends it —
    // read from the DISPOSITIONS node, which is its own top-level node now.
    const dispositionsNode = screen.getByTestId('site-dispositions');
    expect(
      (
        within(dispositionsNode).getByLabelText(
          'Between first faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('goblins');
    expect(
      (
        within(dispositionsNode).getByLabelText(
          'Between second faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('party');
    expect(
      (within(dispositionsNode).getByLabelText('Stance') as HTMLSelectElement)
        .value
    ).toBe('hostile');
    expect(
      within(dispositionsNode).getByText('fact goblin-cowed')
    ).toBeTruthy();

    // It IS editable: the facts are controls now.
    expect(
      panel.querySelectorAll('input, select, button').length
    ).toBeGreaterThan(0);
  });

  it('hands the parent a next scope when a faction or a disposition is added', () => {
    const onChange = vi.fn();
    render(<SiteFacts scope={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add faction' }));
    expect(onChange).toHaveBeenCalled();
    const withFaction = onChange.mock.calls[0]![0] as SiteScope;
    expect(withFaction.factions).toHaveLength(1);
    expect(withFaction.factions?.[0]?.id).toBeTruthy();
  });

  it('says when nothing is authored, and offers the add verb', () => {
    render(<SiteFacts scope={{}} onChange={() => {}} />);
    expect(screen.getByTestId('policies-none').textContent).toMatch(
      /No factions are authored on this site\./
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
      <SiteFacts
        scope={{ factions: [{ id: 'goblins' }] }}
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
      within(creature).getByText('when enemy reach · weight 1 · hold')
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

describe('every entry in a site node collapses to its own line (web#1178 follow-up)', () => {
  it('a disposition reads as its pair, with the stance beside it', () => {
    render(<SiteFacts scope={siteScope} />);
    const summary = screen.getByLabelText(
      'Disposition between goblins and party'
    );
    // THE LINE IS THE PAIR — the form (stance, until) is one expansion behind.
    expect(summary.textContent).toMatch(/between goblins and party/);
    expect(summary.textContent).toMatch(/hostile/);
  });

  it('a faction reads as its id', () => {
    render(<SiteFacts scope={siteScope} />);
    const summary = screen.getByLabelText('Faction goblins');
    expect(summary.textContent?.trim()).toBe('goblins');
    // The shared table is behind the line, not on it: a node can be scanned
    // without opening a single entry.
    expect(summary.textContent).not.toMatch(/intimidated/);
  });

  it('every entry is a details, so the line and the form are the same entry', () => {
    render(<SiteFacts scope={siteScope} />);
    const row = screen.getByTestId('faction-goblins');
    expect(row.tagName.toLowerCase()).toBe('details');
    expect(row.querySelector('summary')).toBeTruthy();
    // Closed by default: the nodes collapse AND each entry inside them does.
    expect((row as HTMLDetailsElement).open).toBe(false);
  });
});

describe('an entry’s `when:` condition is authored, not just read (web#1192)', () => {
  /** The creature panel EDITABLE — the real mount, so the control is tested
   * where an author meets it. */
  function editableCreature(onOrdersChange = vi.fn()) {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={fixture.draft.room.monsterBindings?.['goblin-1']}
        onOrdersChange={onOrdersChange}
      />
    );
    return onOrdersChange;
  }

  it('reads the document’s condition as the control’s value', () => {
    // The fixture's goblin authors `{when: {enemy: reach}, hold: {}}`, so the
    // picker must open on that band — the form holds the document's value, it
    // does not default to something of its own.
    editableCreature();
    const picker = screen.getByLabelText(
      'When for time entry'
    ) as HTMLSelectElement;
    expect(picker.value).toBe('enemy:reach');
  });

  it('authors an enemy band, handing the parent the whole next table', () => {
    const onOrdersChange = editableCreature();
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'enemy:seen' },
    });
    // The commit is the creature's ORDERS, carrying the new condition.
    const next = onOrdersChange.mock.calls[0][0];
    expect(next.on.time[0].when).toEqual({ enemy: 'seen' });
  });

  it('authors a deed with a span — the case the slice exists for', () => {
    // "change targets when it is attacked": the condition is a DEED, and the
    // span is authored beside it.
    const onOrdersChange = editableCreature();
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'deed:attacked' },
    });
    const next = onOrdersChange.mock.calls[0][0];
    expect(next.on.time[0].when).toEqual({ attacked: { within: 1 } });
  });

  it('clears the condition to `(any time)`, which DELETES the key', () => {
    // An empty `when` is a condition naming nothing — refused by name — so the
    // authored state "no condition" is the key's absence, never `{}`.
    const onOrdersChange = editableCreature();
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'any' },
    });
    const next = onOrdersChange.mock.calls[0][0];
    expect('when' in next.on.time[0]).toBe(false);
  });

  it('opens the trigger picker on `time`, not on a social key', () => {
    // FOUND ON THE WALK: the picker's default was the vocabulary's first key
    // (`intimidated`), so the obvious first click authored a SOCIAL entry —
    // the half this slice is not about — and the `when` editor (legal on `time`
    // alone) never appeared. A creature with no table opens on `time`.
    const bare = { ...fixture.draft.room.monsterBindings!['goblin-1'] };
    delete bare.on;
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={bare}
        onOrdersChange={() => {}}
      />
    );
    const picker = screen.getByLabelText(
      'Add trigger to this creature'
    ) as HTMLSelectElement;
    expect(picker.value).toBe('time');
  });

  it('opens a FACTION’s picker on `time` too, for the same reason', () => {
    // FOUND IN REVIEW (independent-gate): the creature's picker was fixed and
    // the faction's was not, so a faction author landed on the social half
    // where no condition control can ever appear. Same invisibility, same fix.
    const bare: SiteScope = { factions: [{ id: 'goblins' }] };
    render(<SiteFacts scope={bare} />);
    // The label carries the faction's own id, and the faction list is
    // collapsed by default — so open the faction's row first.
    fireEvent.click(screen.getByLabelText('Faction goblins'));
    const picker = screen.getByLabelText(
      'Add trigger to goblins'
    ) as HTMLSelectElement;
    expect(picker.value).toBe('time');
  });

  it('offers no span the author did not type', () => {
    // FOUND IN REVIEW (independent-gate): clearing the span committed
    // `within: 0` — `Number('')` — a number nobody typed, where a weight's
    // absent IS 1 to the engine but a span has no legal absence. Emptying the
    // field now commits nothing, so the author's own value stands.
    // A DEED row, so the span field exists: the component renders from its
    // `binding` prop, so the row is mounted already authored rather than
    // switched in place (which only calls back and does not re-render here).
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{
          on: { time: [{ when: { attacked: { within: 3 } }, hold: {} }] },
        }}
        onOrdersChange={onOrdersChange}
      />
    );
    expect(
      (screen.getByLabelText('Within for time entry') as HTMLInputElement).value
    ).toBe('3');

    fireEvent.change(screen.getByLabelText('Within for time entry'), {
      target: { value: '' },
    });
    expect(onOrdersChange).not.toHaveBeenCalled();
  });

  it('offers no condition on a social trigger, because the verb IS the condition', () => {
    // `intimidated` already means "the threat landed"; a second condition under
    // it would be asking when a thing that just happened happened. The control
    // is ABSENT rather than disabled — the builder does not offer what the
    // engine refuses.
    const withIntimidated = {
      ...fixture.draft.room.monsterBindings!['goblin-1'],
      on: { intimidated: [{ say: 'Fine!' }] },
    };
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={withIntimidated}
        onOrdersChange={() => {}}
      />
    );
    expect(screen.queryByLabelText('When for intimidated entry')).toBeNull();
  });

  it('offers `actor` only once the condition names a deed', () => {
    // `actor` names the actor of a deed, and an entry naming none has no actor
    // to name. The selector list follows the condition rather than offering a
    // choice the engine refuses.
    const awayOnFled = {
      ...fixture.draft.room.monsterBindings!['goblin-1'],
      on: {
        time: [{ when: { fled: { within: 3 } }, away: 'actor' }],
      },
    };
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={awayOnFled}
        onOrdersChange={() => {}}
      />
    );
    const selector = screen.getByLabelText(
      'away selector for time entry'
    ) as HTMLSelectElement;
    expect(
      Array.from(selector.options).map((option) => option.value)
    ).toContain('actor');
  });

  it('clears an `actor` selector when the deed condition is cleared', () => {
    // The one place this form edits a second field: leaving `actor` behind with
    // no deed would publish a document the engine refuses by name.
    const onOrdersChange = vi.fn();
    const awayOnFled = {
      ...fixture.draft.room.monsterBindings!['goblin-1'],
      on: { time: [{ when: { fled: { within: 3 } }, away: 'actor' }] },
    };
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={awayOnFled}
        onOrdersChange={onOrdersChange}
      />
    );
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'any' },
    });
    const next = onOrdersChange.mock.calls[0][0];
    expect('when' in next.on.time[0]).toBe(false);
    expect(next.on.time[0].away).not.toBe('actor');
  });
});
